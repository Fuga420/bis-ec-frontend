import { getDocumentMatchStatus } from "@/pages/documents/lib/derive";
import type { DocumentLedgerDocument } from "@/pages/documents/types";

// 書類台帳の全件サマリー（一覧の絞り込みとは独立）。
export interface DocumentLedgerSummary {
  total: number;
  matched: number;
  partial: number;
  unmatched: number;
}

/**
 * 取得済みの全書類から合計と内訳を数える。
 *
 * 返された書類が全件であることを前提にする（取得側で全ページ取得している）。
 * 合計 = matched + partial + unmatched が常に一致する。
 */
export function summarizeLedger(
  documents: DocumentLedgerDocument[]
): DocumentLedgerSummary {
  const summary: DocumentLedgerSummary = {
    total: documents.length,
    matched: 0,
    partial: 0,
    unmatched: 0,
  };
  for (const doc of documents) {
    summary[getDocumentMatchStatus(doc)] += 1;
  }
  return summary;
}