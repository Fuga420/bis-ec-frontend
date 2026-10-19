import { getSupabaseClient } from "@/lib/supabaseClient";
import { fileToBase64 } from "@/pages/register/lib/aiProduct";
import { resolveDocumentMime } from "@/pages/import/lib/productDocument";
import {
  mapMatchStatus,
  resolveFileKind,
  type DocumentLedgerDocument,
  type DocumentLedgerLine,
  type TransactionType,
} from "@/pages/documents/types";

/**
 * 書類台帳API（documents-relay 接続）。
 *
 * ブラウザは anon key + JWT で Edge Function `documents-relay` を呼ぶだけ。
 * service_role も GAS 管理者キーもブラウザには置かない（中継側で付与）。
 *
 * 使用Action（契約準拠）:
 *   import_document / list_documents / get_document / save_document_lines /
 *   delete_document_line / link_product_manual / unlink_product_manual / get_product_cost
 */

const RELAY_FUNCTION = "documents-relay";

// 書類台帳APIは接続済み（documents-relay 配信済み）。
export const DOCUMENT_LEDGER_API_READY = true;

// 割当金額が未指定のときにバックエンドが返すエラーコード。
export const ALLOCATED_AMOUNT_REQUIRED_CODE = "ALLOCATED_AMOUNT_REQUIRED";

// 書類台帳APIのエラー（バックエンドの error_code を保持する）。
export class DocumentLedgerApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DocumentLedgerApiError";
    this.code = code;
  }
}

type RelayRecord = Record<string, unknown>;

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNumber(value: unknown): number {
  return toNumberOrNull(value) ?? 0;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

// 中継を呼び出し、失敗時は error_code を保持した例外に変換する。
async function invokeRelay(body: RelayRecord): Promise<RelayRecord> {
  const client = getSupabaseClient();
  if (!client) {
    throw new DocumentLedgerApiError(
      "BACKEND_NOT_CONNECTED",
      "バックエンドに接続されていません。"
    );
  }

  const { data, error } = await client.functions.invoke(RELAY_FUNCTION, { body });

  if (error) {
    // 非2xxの場合、応答本文に error_code / message が入っている。
    let code = "RELAY_INVOKE_FAILED";
    let message = error.message || "書類台帳の中継呼び出しに失敗しました。";
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      try {
        const payload = (await context.json()) as RelayRecord;
        code = asString(payload.error_code) || code;
        message = asString(payload.message) || asString(payload.error) || message;
      } catch {
        // 応答本文が読めない場合は既定メッセージを使う。
      }
    }
    throw new DocumentLedgerApiError(code, message);
  }

  const result = (data ?? {}) as RelayRecord;
  if (result.success !== true) {
    throw new DocumentLedgerApiError(
      asString(result.error_code) || "RELAY_ERROR",
      asString(result.message) || asString(result.error) || "書類台帳の処理に失敗しました。"
    );
  }
  return result;
}

// 明細行の応答を画面表示用に写像する。
function mapLine(raw: RelayRecord): DocumentLedgerLine {
  const links = Array.isArray(raw.links) ? (raw.links as RelayRecord[]) : [];
  const activeLinks = links.filter((l) => !l.is_deleted);
  const firstLink = activeLinks[0] || links[0];
  const serverId = raw.id !== undefined && raw.id !== null ? String(raw.id) : undefined;
  return {
    line_id: serverId ?? `local-${Math.random().toString(36).slice(2, 10)}`,
    server_id: serverId,
    line_number:
      typeof raw.line_number === "number" ? raw.line_number : undefined,
    description: asString(raw.item_name_raw),
    amount: toNumberOrNull(raw.total_line_amount),
    transaction_type: (asString(raw.transaction_type) || "purchase") as TransactionType,
    product_id: firstLink ? asString(firstLink.product_id) : "",
    product_name: "",
    link_id: firstLink ? asString(firstLink.id) : undefined,
    allocated_amount: firstLink ? toNumberOrNull(firstLink.allocated_amount) : null,
    item_amount_tax_included: toNumberOrNull(raw.item_amount_tax_included),
    fee_amount_tax_included: toNumberOrNull(raw.fee_amount_tax_included),
    receipt_number: raw.receipt_number_normalized
      ? asString(raw.receipt_number_normalized)
      : raw.reception_number_normalized
        ? asString(raw.reception_number_normalized)
        : raw.receipt_number
          ? asString(raw.receipt_number)
          : null,
    links: links.map((l) => ({
      id: asString(l.id),
      product_id: asString(l.product_id),
      link_type: asString(l.link_type),
      allocated_amount: toNumberOrNull(l.allocated_amount),
      status: asString(l.status),
      is_deleted: Boolean(l.is_deleted),
    })),
  };
}

// 書類の応答を画面表示用に写像する。
function mapDocument(raw: RelayRecord): DocumentLedgerDocument {
  const fileName = asString(raw.file_name);
  const status = asString(raw.status);
  const discrepancy = toNumberOrNull(raw.discrepancy_amount);
  return {
    document_id: asString(raw.id),
    file_name: fileName,
    file_kind: resolveFileKind(fileName),
    mime_type: asString(raw.mime_type),
    drive_url: asString(raw.drive_file_url),
    original_total: toNumber(raw.total_amount),
    uploaded_at: asString(raw.created_at),
    supplier_name: raw.supplier_name ? asString(raw.supplier_name) : undefined,
    status_text: status || undefined,
    line_count: toNumberOrNull(raw.extracted_line_count) ?? 0,
    line_total: toNumberOrNull(raw.extracted_total_amount) ?? 0,
    match_status: mapMatchStatus(status, discrepancy !== null && discrepancy !== 0),
    lines: [],
  };
}

/**
 * 書類一覧を取得する（list_documents）。
 */
export async function fetchDocumentList(): Promise<DocumentLedgerDocument[]> {
  const result = await invokeRelay({
    action: "list_documents",
    page: 1,
    page_size: 100,
  });
  const documents = Array.isArray(result.documents)
    ? (result.documents as RelayRecord[])
    : [];
  return documents.map(mapDocument);
}

/**
 * 書類詳細を取得する（get_document）。
 */
export async function fetchDocumentDetail(
  documentId: string
): Promise<DocumentLedgerDocument | null> {
  const result = await invokeRelay({
    action: "get_document",
    document_id: documentId,
  });
  const rawDoc = result.document as RelayRecord | undefined;
  if (!rawDoc) return null;

  const doc = mapDocument(rawDoc);
  // get_document は is_active=true / is_deleted=false の有効明細だけを返す。
  // フロント側では match_status（unlinked 等）やリンク有無で明細を絞り込まない。
  // 返却された lines を全件そのまま写像し、描画対象にする。
  const rawLines = Array.isArray(result.lines)
    ? (result.lines as RelayRecord[])
    : [];
  doc.lines = rawLines.map(mapLine);
  // 明細がある場合は明細行から集計し直す（監査ビューの合計を優先）。
  doc.line_total = doc.line_total || doc.lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  doc.line_count = doc.lines.length;
  return doc;
}

// ─────────────────────────────────────────────────────────────
// import_document（書類原本の独立取込）
// ─────────────────────────────────────────────────────────────

export interface UploadDocumentInput {
  file: File;
  // 仕入先名（バックエンド必須）
  supplierName: string;
  // 再送識別子（冪等性キー）
  idempotencyKey: string;
  // 書類種別（invoice / receipt）
  documentType?: string;
  // 原本合計（未入力は null）
  totalAmount?: number | null;
}

export async function uploadDocument(
  input: UploadDocumentInput
): Promise<DocumentLedgerDocument> {
  const base64 = await fileToBase64(input.file);
  const result = await invokeRelay({
    action: "import_document",
    idempotency_key: input.idempotencyKey,
    supplier_name: input.supplierName,
    document_type: input.documentType ?? "invoice",
    file_name: input.file.name,
    mime_type: resolveDocumentMime(input.file),
    base64,
    total_amount: input.totalAmount ?? null,
  });
  return mapDocument(result.document as RelayRecord);
}

// ─────────────────────────────────────────────────────────────
// save_document_lines（明細行の登録・更新）
// ─────────────────────────────────────────────────────────────

export async function saveDocumentLines(
  documentId: string,
  lines: DocumentLedgerLine[]
): Promise<void> {
  const payload = lines.map((line, index) => ({
    id: line.server_id,
    line_number: line.line_number ?? index + 1,
    page_number: 1,
    item_name_raw: line.description,
    transaction_type: line.transaction_type,
    // 金額未入力は null、明示的な0円だけ0を送る
    total_line_amount: line.amount,
  }));
  await invokeRelay({
    action: "save_document_lines",
    document_id: documentId,
    lines: payload,
  });
}

// ─────────────────────────────────────────────────────────────
// delete_document_line（明細行の論理削除）
// ─────────────────────────────────────────────────────────────

export async function deleteDocumentLine(documentLineId: string): Promise<void> {
  await invokeRelay({
    action: "delete_document_line",
    document_line_id: documentLineId,
  });
}

// ─────────────────────────────────────────────────────────────
// link_product_manual（商品の手動紐付け）
// ─────────────────────────────────────────────────────────────

export interface LinkProductInput {
  documentLineId: string;
  productId: string;
  // 割当金額（未指定は null。明細金額も無い場合はバックエンドが ALLOCATED_AMOUNT_REQUIRED を返す）
  allocatedAmount?: number | null;
  linkType?: string;
}

export async function linkLineToProduct(input: LinkProductInput): Promise<RelayRecord> {
  const res = await invokeRelay({
    action: "link_product_manual",
    document_line_id: input.documentLineId,
    product_id: input.productId,
    link_type: input.linkType ?? "primary_cost",
    allocated_amount: input.allocatedAmount ?? null,
  });
  return (res.link as RelayRecord) ?? {};
}

// 商品代金と落札手数料の自動分離紐付け (ワンクリック確定用)
export interface LinkWithBreakdownInput {
  documentLineId: string;
  productId: string;
  itemAmountTaxIncluded?: number | null;
  feeAmountTaxIncluded?: number | null;
  totalLineAmount?: number | null;
  confirmedBy?: string;
}

export interface LinkWithBreakdownResult {
  primaryLink: RelayRecord | null;
  commissionLink: RelayRecord | null;
  isComplete: boolean;
  error?: string;
}

export async function linkLineWithBreakdown(input: LinkWithBreakdownInput): Promise<LinkWithBreakdownResult> {
  const result: LinkWithBreakdownResult = {
    primaryLink: null,
    commissionLink: null,
    isComplete: false,
  };

  const hasCommission = Boolean(input.feeAmountTaxIncluded && input.feeAmountTaxIncluded > 0);

  // 1. 商品代金の紐付け (primary_cost)
  const primaryAmount = hasCommission
    ? input.itemAmountTaxIncluded
    : (input.totalLineAmount ?? input.itemAmountTaxIncluded);

  try {
    const res1 = await invokeRelay({
      action: "link_product_manual",
      document_line_id: input.documentLineId,
      product_id: input.productId,
      link_type: "primary_cost",
      allocated_amount: primaryAmount ?? null,
      confirmed_by: input.confirmedBy || "staff",
    });
    result.primaryLink = (res1.link as RelayRecord) ?? null;
  } catch (err: any) {
    result.error = `primary_cost 割当失敗: ${err.message}`;
    return result;
  }

  // 2. 落札手数料が存在する場合の紐付け (commission)
  if (hasCommission) {
    try {
      const res2 = await invokeRelay({
        action: "link_product_manual",
        document_line_id: input.documentLineId,
        product_id: input.productId,
        link_type: "commission",
        allocated_amount: input.feeAmountTaxIncluded ?? null,
        confirmed_by: input.confirmedBy || "staff",
      });
      result.commissionLink = (res2.link as RelayRecord) ?? null;
      result.isComplete = true;
    } catch (err: any) {
      result.error = `commission 割当失敗 (片方未完了): ${err.message}`;
      result.isComplete = false;
      return result;
    }
  } else {
    result.isComplete = true;
  }

  return result;
}

// 片方の保存だけが成功した場合の検出と再試行 (整合回復)
export async function repairIncompleteLinks(
  documentLineId: string,
  productId: string,
  existingLinks: RelayRecord[],
  expectedAmounts: { itemAmountTaxIncluded?: number | null; feeAmountTaxIncluded?: number | null }
): Promise<{ repaired: boolean; message: string }> {
  const hasPrimary = existingLinks.some(l => l.link_type === "primary_cost" && !l.is_deleted && l.status === "confirmed");
  const hasCommission = existingLinks.some(l => l.link_type === "commission" && !l.is_deleted && l.status === "confirmed");

  const needsCommission = Boolean(expectedAmounts.feeAmountTaxIncluded && expectedAmounts.feeAmountTaxIncluded > 0);

  // すでに両方揃っている場合
  if (hasPrimary && (!needsCommission || hasCommission)) {
    return { repaired: false, message: "リンクは既に完全な状態です。" };
  }

  // primary_cost が不足している場合
  if (!hasPrimary) {
    await invokeRelay({
      action: "link_product_manual",
      document_line_id: documentLineId,
      product_id: productId,
      link_type: "primary_cost",
      allocated_amount: expectedAmounts.itemAmountTaxIncluded ?? null,
    });
  }

  // commission が不足している場合
  if (needsCommission && !hasCommission) {
    await invokeRelay({
      action: "link_product_manual",
      document_line_id: documentLineId,
      product_id: productId,
      link_type: "commission",
      allocated_amount: expectedAmounts.feeAmountTaxIncluded ?? null,
    });
  }

  return { repaired: true, message: "不足していた片方のリンクを追加登録し、内訳の整合性を回復しました。" };
}

// ─────────────────────────────────────────────────────────────
// unlink_product_manual（紐付け解除）
// ─────────────────────────────────────────────────────────────

export async function unlinkProductManual(linkId: string): Promise<void> {
  await invokeRelay({
    action: "unlink_product_manual",
    link_id: linkId,
  });
}

// ─────────────────────────────────────────────────────────────
// get_product_cost（商品IDの原価内訳・関連明細）
// ─────────────────────────────────────────────────────────────

export interface ProductCostResult {
  product_id: string;
  cost_breakdown: RelayRecord | null;
  links: RelayRecord[];
}

export async function fetchProductCost(
  productId: string
): Promise<ProductCostResult> {
  const result = await invokeRelay({
    action: "get_product_cost",
    product_id: productId,
  });
  return {
    product_id: asString(result.product_id),
    cost_breakdown: (result.cost_breakdown as RelayRecord | null) ?? null,
    links: Array.isArray(result.links) ? (result.links as RelayRecord[]) : [],
  };
}

// ─────────────────────────────────────────────────────────────
// register_drive_document（Drive既存原本の直接登録）
// ─────────────────────────────────────────────────────────────

export interface RegisterDriveDocumentInput {
  driveFileId: string;
  driveFolderId?: string | null;
  driveFileUrl?: string | null;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  fileFingerprint: string;
  supplierName: string;
  supplierCode?: string | null;
  documentNumber?: string | null;
  invoiceRegistrationNumber?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  currency?: string;
  totalAmount?: number | null;
  taxAmount?: number | null;
  idempotencyKey?: string;
  notes?: string | null;
  status?: string;
}

export async function registerDriveDocument(
  input: RegisterDriveDocumentInput
): Promise<DocumentLedgerDocument> {
  const result = await invokeRelay({
    action: "register_drive_document",
    drive_file_id: input.driveFileId,
    drive_folder_id: input.driveFolderId ?? null,
    drive_file_url: input.driveFileUrl ?? null,
    file_name: input.fileName,
    file_size: input.fileSize ?? 0,
    mime_type: input.mimeType ?? "application/pdf",
    file_fingerprint: input.fileFingerprint,
    supplier_name: input.supplierName,
    supplier_code: input.supplierCode ?? null,
    document_number: input.documentNumber ?? null,
    invoice_registration_number: input.invoiceRegistrationNumber ?? null,
    issue_date: input.issueDate ?? null,
    due_date: input.dueDate ?? null,
    currency: input.currency ?? "JPY",
    total_amount: input.totalAmount ?? null,
    tax_amount: input.taxAmount ?? null,
    idempotency_key: input.idempotencyKey ?? `drive_${input.driveFileId}`,
    notes: input.notes ?? null,
    status: input.status,
  });
  return mapDocument(result.document as RelayRecord);
}

// ─────────────────────────────────────────────────────────────
// update_document_folder（原本Drive移動後のDB反映）
// ─────────────────────────────────────────────────────────────

export interface UpdateDocumentFolderInput {
  documentId: string;
  driveFolderId: string;
  status?: string;
}

export async function updateDocumentFolder(
  input: UpdateDocumentFolderInput
): Promise<DocumentLedgerDocument> {
  const result = await invokeRelay({
    action: "update_document_folder",
    document_id: input.documentId,
    drive_folder_id: input.driveFolderId,
    status: input.status,
  });
  return mapDocument(result.document as RelayRecord);
}

// ─────────────────────────────────────────────────────────────
// 一括取込 (documents-batch-relay) 連携API
// ブラウザからは DOCUMENTS_WORKER_SECRET を一切要求せず、
// Supabase Auth (JWT) または confirmed_by だけで中継を呼び出す。
// ─────────────────────────────────────────────────────────────

const BATCH_RELAY_FUNCTION = "documents-batch-relay";

export async function invokeBatchRelay(body: RelayRecord): Promise<RelayRecord> {
  const client = getSupabaseClient();
  if (!client) {
    throw new DocumentLedgerApiError(
      "BACKEND_NOT_CONNECTED",
      "バックエンドに接続されていません。"
    );
  }

  const { data, error } = await client.functions.invoke(BATCH_RELAY_FUNCTION, { body });

  if (error) {
    let code = "BATCH_RELAY_FAILED";
    let message = error.message || "一括取込中継の呼び出しに失敗しました。";
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      try {
        const payload = (await context.json()) as RelayRecord;
        code = asString(payload.error_code) || code;
        message = asString(payload.message) || asString(payload.error) || message;
      } catch {}
    }
    throw new DocumentLedgerApiError(code, message);
  }

  const result = (data ?? {}) as RelayRecord;
  if (result.success !== true) {
    throw new DocumentLedgerApiError(
      asString(result.error_code) || "BATCH_RELAY_ERROR",
      asString(result.message) || asString(result.error) || "一括取込処理に失敗しました。"
    );
  }
  return result;
}

/**
 * Drive 01_inbox の一括取込を開始する。
 * ブラウザに秘密鍵を持たせず、操作者名 (confirmedBy) のみを送信する。
 */
export async function startInboxImport(confirmedBy = "staff"): Promise<RelayRecord> {
  return invokeBatchRelay({
    action: "start_inbox_import",
    confirmed_by: confirmedBy,
  });
}

/**
 * 一括取込ジョブの進捗・ファイル別結果を照会する。
 * タブを閉じた後やリロード後でも、特定の jobId または最新ジョブの永続化結果を再取得できる。
 */
export async function fetchInboxImportStatus(jobId?: string): Promise<RelayRecord> {
  return invokeBatchRelay({
    action: "get_inbox_import_status",
    job_id: jobId,
  });
}