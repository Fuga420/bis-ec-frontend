import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDocumentList } from "@/pages/documents/lib/documentLedgerApi";
import { getDocumentMatchStatus } from "@/pages/documents/lib/derive";
import {
  summarizeLedger,
  type DocumentLedgerSummary,
} from "@/pages/documents/lib/ledgerSummary";
import type {
  DocumentLedgerDocument,
  DocumentMatchStatus,
} from "@/pages/documents/types";

export type DocumentListLoadState = "loading" | "success" | "error";

/**
 * 書類一覧の状態管理。
 * 一覧の取得元は lib/documentLedgerApi.ts（契約確定まではプレースホルダー）。
 * 検索（ファイル名・書類ID）と照合状態の絞り込みは表示中の一覧に対して行う。
 */
export function useDocumentList() {
  const [loadState, setLoadState] = useState<DocumentListLoadState>("loading");
  const [documents, setDocuments] = useState<DocumentLedgerDocument[]>([]);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | DocumentMatchStatus>("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    fetchDocumentList()
      .then((list) => {
        if (cancelled) return;
        setDocuments(list);
        setLoadState("success");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  // アップロード欄から仮登録（プレースホルダー）を先頭に追加する。
  const addDocument = useCallback((doc: DocumentLedgerDocument) => {
    setDocuments((prev) => [doc, ...prev]);
  }, []);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return documents.filter((doc) => {
      if (statusFilter && getDocumentMatchStatus(doc) !== statusFilter) {
        return false;
      }
      if (!kw) return true;
      return (
        doc.file_name.toLowerCase().includes(kw) ||
        doc.document_id.toLowerCase().includes(kw)
      );
    });
  }, [documents, keyword, statusFilter]);

  const hasFilter = keyword.trim() !== "" || statusFilter !== "";

  // 台帳サマリーは一覧の絞り込みとは独立に、取得済みの全書類から集計する。
  const summary: DocumentLedgerSummary = useMemo(
    () => summarizeLedger(documents),
    [documents]
  );

  const clearFilter = useCallback(() => {
    setKeyword("");
    setStatusFilter("");
  }, []);

  return {
    loadState,
    documents,
    filtered,
    keyword,
    setKeyword,
    statusFilter,
    setStatusFilter,
    hasFilter,
    clearFilter,
    retry,
    addDocument,
    summary,
  };
}