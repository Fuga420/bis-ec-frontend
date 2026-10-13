import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
import { fileToBase64 } from "@/pages/register/lib/aiProduct";

// 画像取込（import_product_by_images）とは別リクエストになる、書類添付の action 名。
// 商品の再登録は行わず、画像取込で得た同じ product_id に対して書類だけを送る。
export const ATTACH_PRODUCT_DOCUMENT_ACTION = "attach_product_document";

// MVP: 1商品につき書類は1件。PDF / JPG / PNG のみ受け付ける（画像取込の WEBP とは別枠）。
export const DOCUMENT_MAX_SIZE = 10 * 1024 * 1024;
export const DOCUMENT_ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];
export const DOCUMENT_ALLOWED_EXT = [".pdf", ".jpg", ".jpeg", ".png"];
export const DOCUMENT_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

// 書類添付の状態。画像取込の状態とは独立に管理する。
export type DocumentAttachStatus =
  | "idle"
  | "attaching"
  | "attached"
  | "conflict"
  | "error"
  | "unknown";

// 書類の種別（請求書 / 領収書）。GASの document_type に対応する。
export type DocumentType = "invoice" | "receipt";
export const DOCUMENT_TYPE_OPTIONS: Array<{
  value: DocumentType;
  label: string;
}> = [
  { value: "invoice", label: "請求書" },
  { value: "receipt", label: "領収書" },
];

// 添付済み（または既存）の書類情報（表示用）。
export interface AttachedDocument {
  file_name: string;
  mime_type: string;
  view_url: string;
  display_url: string;
  size: number | null;
  attached_at: string;
}

// 書類添付1件分の送信結果。
// - success : 応答本文 success===true（添付完了）
// - conflict: 別の書類が既に添付済み（上書きしない。既存書類を返す）
// - rejected: success:false（受付されなかったことが確定）
// - unknown : 応答解析不可 / 通信断。同じ product_id へ書類のみ再送できる
export type AttachDocumentResult =
  | { kind: "success"; document: AttachedDocument | null }
  | { kind: "conflict"; existing: AttachedDocument | null; message: string }
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
 * 選択された書類ファイルがMVPの受け入れ条件（PDF / JPG / PNG・10MBまで）を満たすか検証する。
 * 問題があればユーザー向けメッセージ、問題なければ null を返す。
 */
export function validateDocumentFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const byType = DOCUMENT_ALLOWED_TYPES.includes(file.type);
  const byExt = DOCUMENT_ALLOWED_EXT.some((ext) => name.endsWith(ext));
  if (!byType && !byExt) {
    return "書類は PDF / JPG / PNG のいずれかを選んでください。";
  }
  if (file.size > DOCUMENT_MAX_SIZE) {
    return "書類は1件10MBまでです。";
  }
  return null;
}

/** file.type が空でも拡張子から推定して MIME を確定する。 */
export function resolveDocumentMime(file: File): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

/** 応答から書類情報を取り出す（キー名の揺れを吸収する）。 */
export function parseProductDocument(raw: unknown): AttachedDocument | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const fileName =
    asString(obj.file_name) || asString(obj.filename) || asString(obj.name);
  const viewUrl =
    asString(obj.view_url) ||
    asString(obj.display_url) ||
    asString(obj.url) ||
    asString(obj.open_url);
  if (!fileName && !viewUrl) return null;
  return {
    file_name: fileName,
    mime_type: asString(obj.mime_type) || asString(obj.mimeType),
    view_url: viewUrl,
    display_url: asString(obj.display_url),
    size: typeof obj.size === "number" ? obj.size : null,
    attached_at: asString(obj.attached_at) || asString(obj.attachedAt),
  };
}

/**
 * 「別の書類が既に添付済み」の競合応答かどうかを判定する。
 * 契約上 error_code が付与される想定だが、揺れに備えて説明文でも判定する。
 */
export function isDocumentConflict(
  errorCode: string,
  message: string
): boolean {
  const code = errorCode.toUpperCase();
  if (
    ["CONFLICT", "ALREADY", "EXISTS", "DUPLICATE", "OCCUPIED"].some((k) =>
      code.includes(k)
    )
  ) {
    return true;
  }
  const msg = message.toLowerCase();
  return (
    msg.includes("already") ||
    msg.includes("conflict") ||
    msg.includes("既に") ||
    msg.includes("上書き")
  );
}

/**
 * 書類を attach_product_document で送信する（画像取込とは別リクエスト）。
 * - import_product_by_images と同じく、GAS Web App へ text/plain で直接POSTする。
 *   ブラウザに管理者キーは置かない（契約準拠）。
 * - 成功判定は HTTP ステータスではなく応答本文の success===true で行う。
 * - JSON 解析不可 / 通信断は「受付済みか判断できない」ため unknown を返し、
 *   呼び出し側が同じ product_id・同じ idempotency_key で書類のみ再送できるようにする。
 * - 商品の再登録は行わない（この関数は書類の送信だけを行う）。
 */
export async function attachProductDocument(params: {
  productId: string;
  idempotencyKey: string;
  documentType?: DocumentType;
  file: File;
}): Promise<AttachDocumentResult> {
  let base64: string;
  try {
    base64 = await fileToBase64(params.file);
  } catch {
    return {
      kind: "rejected",
      errorCode: "LOCAL_READ_ERROR",
      message: "書類ファイルの読み込みに失敗しました。選び直してください。",
    };
  }

  let response: Response;
  try {
    response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: ATTACH_PRODUCT_DOCUMENT_ACTION,
        product_id: params.productId,
        idempotency_key: params.idempotencyKey,
        document_type: params.documentType ?? "invoice",
        file_name: params.file.name,
        mime_type: resolveDocumentMime(params.file),
        base64,
      }),
    });
  } catch {
    return {
      kind: "unknown",
      message:
        "書類の通信に失敗しました。商品は登録済みのため、同じ商品へ書類だけ再送できます。",
    };
  }

  let text = "";
  try {
    text = await response.text();
  } catch {
    return {
      kind: "unknown",
      message: "書類の応答受信に失敗しました。受付状況が不明です。",
    };
  }

  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = null;
  }
  if (!data) {
    return {
      kind: "unknown",
      message: "書類の応答を解析できませんでした。受付状況が不明です。",
    };
  }

  if (data.success === true) {
    return {
      kind: "success",
      document: parseProductDocument(data.document ?? data.attached_document),
    };
  }

  // success:false を明示＝受付されなかったことが確定。
  const errorCode = asString(data.error_code);
  const message =
    asString(data.message) ||
    asString(data.error) ||
    "書類の添付に失敗しました。";

  // 別書類の競合は、勝手に上書きしない（既存書類を提示する）。
  if (isDocumentConflict(errorCode, message)) {
    return {
      kind: "conflict",
      existing: parseProductDocument(
        data.document ?? data.existing_document ?? data.attached_document
      ),
      message,
    };
  }

  return { kind: "rejected", errorCode, message };
}

/**
 * 書類用の再送識別子（idempotency_key）を発行する（例示形式 DOC_yyyymmdd_<uuid>）。
 * 対象ごとに保持し、同じファイルの再試行では同じキーを再利用して冪等性を担保する。
 */
export function createDocumentIdempotencyKey(): string {
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
  return `DOC_${yyyy}${mm}${dd}_${uuid}`;
}