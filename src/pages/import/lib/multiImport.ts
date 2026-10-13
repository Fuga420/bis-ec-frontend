import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
import { fileToBase64 } from "@/pages/register/lib/aiProduct";

// 新API action 名（MULTI_PRODUCT_IMPORT_API_CONTRACT.md に一致させる）。
export const IMPORT_PRODUCT_BY_IMAGES_ACTION = "import_product_by_images";

// 同一 import_attempt_id で内容（画像の順序・内容・ファイル名）が変わったため中止されたコード。
// 新IDでの安易な自動再送はせず、先の取込結果を確認する操作として扱う（契約の指紋照合）。
export const IMPORT_PAYLOAD_MISMATCH_CODE = "IMPORT_IDEMPOTENCY_PAYLOAD_MISMATCH";

// 1セット（1商品）あたりの画像枚数。契約の 1〜20 枚に合わせる。
export const IMPORT_MIN_IMAGES = 1;
export const IMPORT_MAX_IMAGES = 20;

// 既存の商品画像と揃えた受け入れ条件（ImageUpload と同じ）。
export const IMPORT_MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const IMPORT_ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

// 送信する画像1枚分。画面で確定した順序の配列として送る。
export interface ImportImagePayload {
  base64: string;
  file_name: string;
  mime_type: string;
}

// import_product_by_images の応答（契約 2.2）。
export interface ImportResponseData {
  success?: boolean;
  version?: string;
  import_attempt_id?: string;
  product_id?: string;
  is_reused?: boolean;
  status?: string;
  publish_status?: string;
  inventory_status?: string;
  record_status?: string;
  image_count?: number;
  error?: string;
  error_code?: string;
  message?: string;
}

/**
 * 1セット分の送信結果。
 * - success  : 応答本文 success===true（is_reused:true の再送ヒットも成功として扱う）
 * - rejected : success:false を明示（受付されなかったことが確定。error_code/説明を表示）
 * - unknown  : 応答を解析できない / 通信断 / HTTP 5xx 等。受付済みか不明（同一IDで再送可能）
 */
export type ImportSendResult =
  | { kind: "success"; productId: string; isReused: boolean }
  | { kind: "rejected"; errorCode: string; message: string }
  | { kind: "unknown"; message: string };

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/**
 * 商品セット1件を import_product_by_images で取り込む。
 *
 * - 既存の商品登録と同じ通信経路（GAS Web App へ text/plain で直接POST）を使う。
 *   ブラウザに管理者キーは置かない（契約 1.3）。
 * - 成功判定は HTTP ステータスではなく応答本文の success===true で行う（契約 2.2）。
 * - JSON を解析できない / 通信断 / 5xx は「受付済みか判断できない」ため unknown を返し、
 *   呼び出し側が同一 import_attempt_id・同一ペイロードで再送できるようにする。
 */
export async function importProductByImages(params: {
  importAttemptId: string;
  images: ImportImagePayload[];
}): Promise<ImportSendResult> {
  let response: Response;
  try {
    response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      // action と import_attempt_id、確定済み順序の images を送る。
      // 属性は送らない（画像のみ取り込み。商品情報は後から一括AI生成で補完する）。
      // publish_status は GAS 側で "draft" 固定だが、意図を明示するため便宜上送っても良い。
      // ここではキー名の揺れを避けるため契約どおりの最小構成にする。
      body: JSON.stringify({
        action: IMPORT_PRODUCT_BY_IMAGES_ACTION,
        import_attempt_id: params.importAttemptId,
        images: params.images,
        publish_status: "draft",
      }),
    });
  } catch {
    // 通信断・タイムアウト等：GAS が受付済みか判断できない。
    return {
      kind: "unknown",
      message:
        "通信に失敗しました。受付状況が不明なため、同じ内容で再送できます。",
    };
  }

  let text = "";
  try {
    text = await response.text();
  } catch {
    return {
      kind: "unknown",
      message: "応答の受信に失敗しました。受付状況が不明です。",
    };
  }

  let data: ImportResponseData | null = null;
  try {
    data = JSON.parse(text) as ImportResponseData;
  } catch {
    data = null;
  }

  // 応答本文を解析できない＝受付済みか不明（HTTPステータスだけでは成功にしない）。
  if (!data) {
    return {
      kind: "unknown",
      message: "応答を解析できませんでした。受付状況が不明です。",
    };
  }

  // 成功判定は応答本文の success===true で行う。
  // is_reused:true（同一 import_attempt_id の再送ヒット）も同じ商品IDの成功として扱う。
  if (data.success === true) {
    return {
      kind: "success",
      productId: asString(data.product_id),
      isReused: data.is_reused === true,
    };
  }

  // success:false を明示＝受付されなかったことが確定。error_code と説明をそのまま返す。
  if (data.success === false) {
    const errorCode = asString(data.error_code);
    const message =
      asString(data.message) ||
      asString(data.error) ||
      "取り込みに失敗しました。";
    return { kind: "rejected", errorCode, message };
  }

  // success フィールドが無い等、判定できない応答は受付済みか不明として保持する。
  return {
    kind: "unknown",
    message: "想定外の応答形式です。受付状況が不明です。",
  };
}

/**
 * 画面で確定した順序のまま、各画像の base64 / file_name / mime_type を生成する。
 * 配列の先頭（メイン画像）がそのまま送信順の先頭になる。
 */
export async function buildImagePayload(
  files: File[]
): Promise<ImportImagePayload[]> {
  return Promise.all(
    files.map(async (file, index) => ({
      base64: await fileToBase64(file),
      file_name: file.name || `image_${index + 1}.jpg`,
      // type が空（拡張子から判別できない等）の場合は契約の既定 image/jpeg を使う。
      mime_type: file.type || "image/jpeg",
    }))
  );
}

/**
 * success:false 応答の「前回の試行で商品が作成されている可能性」を評価する。
 *
 * import_product_by_images は、Google Drive への画像保存や本票（Sheets）への書込みまで
 * 進んだ“途中”で失敗した場合も success:false を返しうる。そのため error_code だけでは
 * 「商品が作成されていない」と確定できない。
 *
 * したがって既定では「商品が作成された可能性がある（要確認＝重複リスクあり）」として扱い、
 * 新IDでの取り込みはスタッフの明示承認があるときだけ許可する。
 * 将来、保存前に確定で弾かれるコードが契約に明記された場合のみ、ここで mayHaveCreated:false にする。
 */
export function evaluateRejectionRisk(errorCode: string): {
  mayHaveCreated: boolean;
  isPayloadMismatch: boolean;
} {
  const isPayloadMismatch = errorCode === IMPORT_PAYLOAD_MISMATCH_CODE;
  return { mayHaveCreated: true, isPayloadMismatch };
}

/** セットごとに一意な import_attempt_id を発行する（契約の例示形式 IMP_yyyymmdd_<uuid>）。 */
export function createImportAttemptId(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  let uuid = "";
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      uuid = crypto.randomUUID();
    }
  } catch {
    uuid = "";
  }
  if (!uuid) {
    uuid = `${Date.now().toString(16)}-${Math.random()
      .toString(16)
      .slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`;
  }
  return `IMP_${yyyy}${mm}${dd}_${uuid}`;
}

/**
 * 2つの File 配列が「同一の内容・順序」かを判定する。
 * 前回送信時と画像が1枚でも変わっていれば新しい import_attempt_id を発行するために使う
 * （同一ID＋異なる内容は契約の IMPORT_IDEMPOTENCY_PAYLOAD_MISMATCH になるため）。
 */
export function sameFiles(a: File[] | null, b: File[]): boolean {
  if (!a) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}