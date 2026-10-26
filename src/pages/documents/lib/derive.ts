import type {
  DocumentLedgerDocument,
  DocumentLedgerLine,
  DocumentMatchStatus,
} from "@/pages/documents/types";

// 明細金額を数値化する（未入力 null は 0 として集計）。
function toAmount(value: number | null | undefined): number {
  return Number(value) || 0;
}

// 明細合計（明細行の金額の合計。未入力は0として扱う）。
export function lineTotal(lines: DocumentLedgerLine[]): number {
  return (lines ?? []).reduce((sum, line) => sum + toAmount(line.amount), 0);
}

// 明細の商品代金合計（item_amount の合計）。
export function lineItemAmountTotal(lines: DocumentLedgerLine[]): number {
  return (lines ?? []).reduce((sum, line) => sum + toAmount(line.item_amount), 0);
}

// 明細の落札手数料合計（fee_amount の合計）。
export function lineFeeAmountTotal(lines: DocumentLedgerLine[]): number {
  return (lines ?? []).reduce((sum, line) => sum + toAmount(line.fee_amount), 0);
}

// 明細の商品税合計（tax_amount の合計）。税額は商品代金に混ぜず内訳として扱う。
export function lineTaxAmountTotal(lines: DocumentLedgerLine[]): number {
  return (lines ?? []).reduce((sum, line) => sum + toAmount(line.tax_amount), 0);
}

// 明細の手数料税合計（fee_tax_amount の合計）。税額は手数料に混ぜず内訳として扱う。
export function lineFeeTaxAmountTotal(lines: DocumentLedgerLine[]): number {
  return (lines ?? []).reduce((sum, line) => sum + toAmount(line.fee_tax_amount), 0);
}

// 明細の税額合計（商品税 + 手数料税）。
export function lineTaxTotal(lines: DocumentLedgerLine[]): number {
  return lineTaxAmountTotal(lines) + lineFeeTaxAmountTotal(lines);
}

// 明細に紐付いた商品IDの一覧（分割紐付け対応。未紐付けは空配列）。
export function lineLinkedProductIds(line: DocumentLedgerLine): string[] {
  const fromLinks = (line.links ?? [])
    .map((link) => (link.product_id ?? "").trim())
    .filter((id) => id !== "");
  if (fromLinks.length > 0) return Array.from(new Set(fromLinks));
  const fallback = (line.product_id ?? "").trim();
  return fallback === "" ? [] : [fallback];
}

// 明細が商品に紐付いているか。
export function isLineLinked(line: DocumentLedgerLine): boolean {
  return lineLinkedProductIds(line).length > 0;
}

// 差額（原本合計 − 明細合計）。
export function documentDifference(
  originalTotal: number,
  lines: DocumentLedgerLine[]
): number {
  return (Number(originalTotal) || 0) - lineTotal(lines);
}

/**
 * 照合状態を画面表示用に算出する（暫定）。
 *
 * - 照合済み  : 全明細行に商品が紐付き、かつ差額が0
 * - 一部照合  : 一部の明細行のみ商品が紐付いている（または差額が0でない）
 * - 未照合    : 明細行が無い、またはどの明細行にも商品が紐付いていない
 */
export function deriveMatchStatus(
  originalTotal: number,
  lines: DocumentLedgerLine[]
): DocumentMatchStatus {
  const list = lines ?? [];
  if (list.length === 0) return "unmatched";
  const linked = list.filter((line) => (line.product_id ?? "").trim() !== "");
  if (linked.length === 0) return "unmatched";
  const diff = documentDifference(originalTotal, list);
  if (linked.length === list.length && diff === 0) return "matched";
  return "partial";
}

// 書類の照合状態を取得する（バックエンド値があれば優先、無ければ算出）。
export function getDocumentMatchStatus(
  doc: DocumentLedgerDocument
): DocumentMatchStatus {
  if (doc.match_status) return doc.match_status;
  return deriveMatchStatus(doc.original_total, doc.lines);
}

// 一覧表示用の明細数（一覧API集計値があれば優先、無ければ明細行数）。
export function documentLineCount(doc: DocumentLedgerDocument): number {
  return typeof doc.line_count === "number" ? doc.line_count : doc.lines.length;
}

// 一覧表示用の明細合計（一覧API集計値があれば優先、無ければ明細行から算出）。
export function documentLineTotal(doc: DocumentLedgerDocument): number {
  return typeof doc.line_total === "number"
    ? doc.line_total
    : lineTotal(doc.lines);
}