import { getSupabaseClient } from "@/lib/supabaseClient";
import { fileToBase64 } from "@/pages/register/lib/aiProduct";
import { resolveDocumentMime } from "@/pages/import/lib/productDocument";
import {
  mapMatchStatus,
  resolveFileKind,
  type DocumentLedgerDocument,
  type DocumentLedgerLine,
  type DocumentLedgerProductLink,
  type DocumentLineSearchHit,
  type DocumentLineSearchParams,
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
  const rawLinks = Array.isArray(raw.links) ? (raw.links as RelayRecord[]) : [];
  // 論理削除・未確定のリンクは除外して全件保持する（分割紐付け対応）。
  const links: DocumentLedgerProductLink[] = rawLinks
    .filter((link) => {
      if (link.is_deleted === true) return false;
      const status = asString(link.status);
      return status === "" || status === "confirmed";
    })
    .map((link) => ({
      link_id: asString(link.id),
      product_id: asString(link.product_id),
      allocated_amount: toNumberOrNull(link.allocated_amount),
      link_type: asString(link.link_type) || "primary_cost",
    }))
    .filter((link) => link.product_id !== "");

  const firstLink = links[0];
  const serverId = raw.id !== undefined && raw.id !== null ? String(raw.id) : undefined;
  return {
    line_id: serverId ?? `local-${Math.random().toString(36).slice(2, 10)}`,
    server_id: serverId,
    line_number:
      typeof raw.line_number === "number" ? raw.line_number : undefined,
    description: asString(raw.item_name_raw),
    amount: toNumberOrNull(raw.total_line_amount),
    transaction_type: (asString(raw.transaction_type) || "purchase") as TransactionType,
    product_id: firstLink ? firstLink.product_id : "",
    product_name: "",
    link_id: firstLink ? firstLink.link_id : undefined,
    allocated_amount: firstLink ? firstLink.allocated_amount : null,
    reception_number: asString(raw.reception_number_raw),
    lot_number: asString(raw.lot_number),
    branch_number: asString(raw.branch_number),
    auction_bid_number: asString(raw.auction_bid_number),
    item_amount: toNumberOrNull(raw.item_amount),
    fee_amount: toNumberOrNull(raw.fee_amount),
    tax_amount: toNumberOrNull(raw.tax_amount),
    fee_tax_amount: toNumberOrNull(raw.fee_tax_amount),
    notes: asString(raw.notes),
    links,
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
    drive_folder_id: asString(raw.drive_folder_id) || undefined,
    drive_file_id: asString(raw.drive_file_id) || undefined,
    original_total: toNumber(raw.total_amount),
    uploaded_at: asString(raw.created_at),
    supplier_name: raw.supplier_name ? asString(raw.supplier_name) : undefined,
    status_text: status || undefined,
    line_count: toNumberOrNull(raw.extracted_line_count) ?? 0,
    line_total: toNumberOrNull(raw.extracted_total_amount) ?? 0,
    match_status: mapMatchStatus(status, discrepancy !== null && discrepancy !== 0),
    document_number: asString(raw.document_number) || undefined,
    issue_date: asString(raw.issue_date) || undefined,
    lines: [],
  };
}

/**
 * 書類一覧を取得する（list_documents）。
 *
 * 台帳サマリーを「先頭ページだけ」で集計しないよう、count / total_pages を
 * 使って最終ページまで取得する。1ページ最大100件。
 */
export async function fetchDocumentList(): Promise<DocumentLedgerDocument[]> {
  const PAGE_SIZE = 100;
  // 無限ループ防止（想定を超えるページ数は打ち切る）
  const MAX_PAGES = 100;
  const collected: DocumentLedgerDocument[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= MAX_PAGES) {
    const result = await invokeRelay({
      action: "list_documents",
      page,
      page_size: PAGE_SIZE,
    });
    const documents = Array.isArray(result.documents)
      ? (result.documents as RelayRecord[])
      : [];
    collected.push(...documents.map(mapDocument));

    const serverTotalPages = toNumberOrNull(result.total_pages);
    const serverCount = toNumberOrNull(result.count);

    if (serverTotalPages !== null) {
      totalPages = Math.max(1, serverTotalPages);
    } else if (serverCount !== null) {
      totalPages = Math.max(1, Math.ceil(serverCount / PAGE_SIZE));
    } else {
      // ページ情報が無い場合は、満杯でなければ最終ページとみなす。
      totalPages = documents.length < PAGE_SIZE ? page : page + 1;
    }

    if (documents.length === 0) break;
    page += 1;
  }

  return collected;
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
    // 受付番号・内訳（商品代金・落札手数料）は明細の主要情報として一緒に保存する。
    reception_number_raw: line.reception_number ?? "",
    item_amount: line.item_amount ?? null,
    fee_amount: line.fee_amount ?? null,
    tax_amount: line.tax_amount ?? null,
    fee_tax_amount: line.fee_tax_amount ?? null,
    lot_number: line.lot_number ?? "",
    branch_number: line.branch_number ?? "",
    auction_bid_number: line.auction_bid_number ?? "",
    notes: line.notes ?? "",
  }));
  await invokeRelay({
    action: "save_document_lines",
    document_id: documentId,
    lines: payload,
  });
}

// ─────────────────────────────────────────────────────────────
// 仕入明細を探す（受付番号・ことばの横断検索）
// ─────────────────────────────────────────────────────────────
//
// 一覧API（list_documents）は明細単位の検索を返さないため、
// 読み取り専用で公開済みの document_lines / documents を直接検索する。
// 書き込みは行わない（紐付け・保存は従来どおり documents-relay 経由）。

// 1回の検索で画面に返す明細の上限。
const LINE_SEARCH_LIMIT = 100;

const LINE_SEARCH_SELECT =
  "id, document_id, line_number, reception_number_raw, item_name_raw, brand_name_raw, transaction_type, item_amount, fee_amount, total_line_amount";

// 検索条件に使えない記号を落とす（PostgREST の or 条件を壊さないため）。
function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()%]/g, " ").trim();
}

/**
 * 仕入明細を検索する。
 *
 * - 受付番号: 部分一致（normalized / raw の両方）
 * - ことば: 品目・ブランド（明細）と仕入先・書類名・書類番号（書類）の部分一致
 * - 両方指定した場合は AND で絞り込む
 */
export async function searchDocumentLines(
  params: DocumentLineSearchParams
): Promise<DocumentLineSearchHit[]> {
  const client = getSupabaseClient();
  if (!client) {
    throw new DocumentLedgerApiError(
      "BACKEND_NOT_CONNECTED",
      "バックエンドに接続されていません。"
    );
  }

  const receptionTerm = sanitizeSearchTerm(params.receptionNumber ?? "");
  const keywordTerm = sanitizeSearchTerm(params.keyword ?? "");
  if (receptionTerm === "" && keywordTerm === "") return [];

  // 1) 受付番号に一致する明細（部分一致）
  let receptionRows: RelayRecord[] = [];
  if (receptionTerm !== "") {
    const normalized = receptionTerm.toUpperCase().replace(/\s+/g, "");
    const { data, error } = await client
      .from("document_lines")
      .select(LINE_SEARCH_SELECT)
      .eq("is_deleted", false)
      .or(
        `reception_number_normalized.ilike.%${normalized}%,reception_number_raw.ilike.%${receptionTerm}%`
      )
      .limit(LINE_SEARCH_LIMIT);
    if (error) {
      throw new DocumentLedgerApiError("DB_QUERY_ERROR", error.message);
    }
    receptionRows = (data ?? []) as RelayRecord[];
  }

  // 2) ことばに一致する明細（明細側の項目）
  let keywordRows: RelayRecord[] = [];
  if (keywordTerm !== "") {
    const { data: lineMatches, error: lineErr } = await client
      .from("document_lines")
      .select(LINE_SEARCH_SELECT)
      .eq("is_deleted", false)
      .or(
        `item_name_raw.ilike.%${keywordTerm}%,brand_name_raw.ilike.%${keywordTerm}%`
      )
      .limit(LINE_SEARCH_LIMIT);
    if (lineErr) {
      throw new DocumentLedgerApiError("DB_QUERY_ERROR", lineErr.message);
    }

    // 書類側の項目（仕入先・書類名・書類番号）に一致する書類の明細
    const { data: docMatches, error: docErr } = await client
      .from("documents")
      .select("id")
      .eq("is_deleted", false)
      .or(
        `supplier_name.ilike.%${keywordTerm}%,file_name.ilike.%${keywordTerm}%,document_number.ilike.%${keywordTerm}%`
      )
      .limit(LINE_SEARCH_LIMIT);
    if (docErr) {
      throw new DocumentLedgerApiError("DB_QUERY_ERROR", docErr.message);
    }

    const matchedDocIds = ((docMatches ?? []) as RelayRecord[])
      .map((row) => asString(row.id))
      .filter((id) => id !== "");

    let docLineRows: RelayRecord[] = [];
    if (matchedDocIds.length > 0) {
      const { data, error } = await client
        .from("document_lines")
        .select(LINE_SEARCH_SELECT)
        .eq("is_deleted", false)
        .in("document_id", matchedDocIds)
        .limit(LINE_SEARCH_LIMIT);
      if (error) {
        throw new DocumentLedgerApiError("DB_QUERY_ERROR", error.message);
      }
      docLineRows = (data ?? []) as RelayRecord[];
    }

    const merged = new Map<string, RelayRecord>();
    for (const row of [
      ...((lineMatches ?? []) as RelayRecord[]),
      ...docLineRows,
    ]) {
      merged.set(asString(row.id), row);
    }
    keywordRows = Array.from(merged.values());
  }

  // 3) 受付番号とことばの両方が指定されたら AND で絞り込む
  let rows: RelayRecord[];
  if (receptionTerm !== "" && keywordTerm !== "") {
    const keywordIds = new Set(keywordRows.map((row) => asString(row.id)));
    rows = receptionRows.filter((row) => keywordIds.has(asString(row.id)));
  } else if (receptionTerm !== "") {
    rows = receptionRows;
  } else {
    rows = keywordRows;
  }
  if (rows.length === 0) return [];

  // 4) 書類情報・紐付け情報を補完する
  const docIds = Array.from(
    new Set(rows.map((row) => asString(row.document_id)).filter((id) => id !== ""))
  );
  const lineIds = rows.map((row) => asString(row.id)).filter((id) => id !== "");

  const docMap = new Map<string, RelayRecord>();
  if (docIds.length > 0) {
    const { data: docs } = await client
      .from("documents")
      .select("id, file_name, supplier_name, issue_date, drive_file_url")
      .in("id", docIds);
    for (const doc of (docs ?? []) as RelayRecord[]) {
      docMap.set(asString(doc.id), doc);
    }
  }

  const linkedMap = new Map<string, string[]>();
  if (lineIds.length > 0) {
    const { data: linkRows } = await client
      .from("document_product_links")
      .select("document_line_id, product_id, status, is_deleted")
      .in("document_line_id", lineIds)
      .eq("is_deleted", false);
    for (const link of (linkRows ?? []) as RelayRecord[]) {
      const status = asString(link.status);
      if (status !== "" && status !== "confirmed") continue;
      const key = asString(link.document_line_id);
      const productId = asString(link.product_id);
      if (productId === "") continue;
      const current = linkedMap.get(key) ?? [];
      if (!current.includes(productId)) current.push(productId);
      linkedMap.set(key, current);
    }
  }

  const hits = rows.map((row) => {
    const lineId = asString(row.id);
    const doc = docMap.get(asString(row.document_id));
    const lineNumber = toNumberOrNull(row.line_number);
    return {
      line_id: lineId,
      document_id: asString(row.document_id),
      line_number: lineNumber === null ? undefined : lineNumber,
      document_file_name: doc ? asString(doc.file_name) : "",
      supplier_name: doc ? asString(doc.supplier_name) : "",
      issue_date: doc ? asString(doc.issue_date) : "",
      reception_number: asString(row.reception_number_raw),
      item_name: asString(row.item_name_raw),
      brand_name: asString(row.brand_name_raw),
      transaction_type: (asString(row.transaction_type) || "purchase") as TransactionType,
      item_amount: toNumberOrNull(row.item_amount),
      fee_amount: toNumberOrNull(row.fee_amount),
      total_line_amount: toNumberOrNull(row.total_line_amount),
      linked_product_ids: linkedMap.get(lineId) ?? [],
      drive_url: doc ? asString(doc.drive_file_url) : "",
    };
  });

  // 同じ書類の明細が並ぶよう、書類名→明細番号で並べ替える。
  hits.sort((a, b) => {
    const docCompare = a.document_file_name.localeCompare(b.document_file_name, "ja");
    if (docCompare !== 0) return docCompare;
    return (a.line_number ?? 0) - (b.line_number ?? 0);
  });

  // 明細が上限を超える場合は、並べ替え後の先頭100件に絞る。
  return hits.slice(0, LINE_SEARCH_LIMIT);
}

// ─────────────────────────────────────────────────────────────
// 商品詳細用: 仕入内訳（書類明細ベース）
// ─────────────────────────────────────────────────────────────

export interface ProductCostLinkDetail {
  link_id: string;
  link_type: string;
  allocated_amount: number;
  // 明細（document_lines.id）。同一明細の重複集計を避けるために使う。
  line_id: string;
  document_id: string;
  document_file_name: string;
  document_number: string;
  supplier_name: string;
  issue_date: string;
  reception_number: string;
  item_name: string;
  transaction_type: string;
  // 商品代金（税抜）
  item_amount: number | null;
  // 落札手数料（税抜）
  fee_amount: number | null;
  // 商品代金の税額
  tax_amount: number | null;
  // 落札手数料の税額
  fee_tax_amount: number | null;
  // 明細金額（税込の合計）
  total_line_amount: number | null;
  drive_url: string;
}

export interface ProductCostSummaryDetail {
  document_count: number;
  matched_lines_count: number;
  primary_total: number;
  commission_total: number;
  shipping_total: number;
  other_total: number;
  allocated_total: number;
}

export interface ProductCostDetail {
  summary: ProductCostSummaryDetail | null;
  links: ProductCostLinkDetail[];
}

// 入れ子の応答（object / 配列の両方）を安全に取り出す。
function pickRecord(value: unknown): RelayRecord {
  if (Array.isArray(value)) {
    return (value[0] as RelayRecord) ?? {};
  }
  if (value && typeof value === "object") {
    return value as RelayRecord;
  }
  return {};
}

export async function fetchProductCostDetail(
  productId: string
): Promise<ProductCostDetail> {
  const result = await fetchProductCost(productId);
  const breakdown = result.cost_breakdown;

  const summary: ProductCostSummaryDetail | null = breakdown
    ? {
        document_count: toNumber(breakdown.document_count),
        matched_lines_count: toNumber(breakdown.matched_lines_count),
        primary_total: toNumber(breakdown.total_primary_cost),
        commission_total: toNumber(breakdown.total_commission_fee),
        shipping_total: toNumber(breakdown.total_shipping_cost),
        other_total: toNumber(breakdown.total_other_expense),
        allocated_total: toNumber(breakdown.total_allocated_cost),
      }
    : null;

  const links: ProductCostLinkDetail[] = result.links.map((raw) => {
    const line = pickRecord(raw.line);
    const document = pickRecord(line.document);
    return {
      link_id: asString(raw.id),
      link_type: asString(raw.link_type) || "primary_cost",
      allocated_amount: toNumber(raw.allocated_amount),
      line_id: asString(line.id) || asString(raw.document_line_id),
      document_id: asString(document.id) || asString(line.document_id),
      document_file_name: asString(document.file_name),
      document_number: asString(document.document_number),
      supplier_name: asString(document.supplier_name),
      issue_date: asString(document.issue_date),
      reception_number: asString(line.reception_number_raw),
      item_name: asString(line.item_name_raw),
      transaction_type: asString(line.transaction_type),
      item_amount: toNumberOrNull(line.item_amount),
      fee_amount: toNumberOrNull(line.fee_amount),
      tax_amount: toNumberOrNull(line.tax_amount),
      fee_tax_amount: toNumberOrNull(line.fee_tax_amount),
      total_line_amount: toNumberOrNull(line.total_line_amount),
      drive_url: asString(document.drive_file_url),
    };
  });

  return { summary, links };
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

export async function linkLineToProduct(input: LinkProductInput): Promise<void> {
  await invokeRelay({
    action: "link_product_manual",
    document_line_id: input.documentLineId,
    product_id: input.productId,
    link_type: input.linkType ?? "primary_cost",
    allocated_amount: input.allocatedAmount ?? null,
  });
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