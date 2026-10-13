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