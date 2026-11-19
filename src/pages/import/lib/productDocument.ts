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