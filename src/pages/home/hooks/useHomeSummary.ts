import { useCallback, useEffect, useState } from "react";
import { fetchProductsReadApi } from "@/config/productsApi";
import { fetchDocumentList } from "@/pages/documents/lib/documentLedgerApi";
import { summarizeLedger } from "@/pages/documents/lib/ledgerSummary";
import { POKECA_RAW_STORAGE_PREFIX } from "@/pages/products/lib/pokecaRawStorage";
import type { AdminProductListResponse } from "@/pages/products/types";

export type HomeDataState = "loading" | "success" | "error";

export interface HomeProductSummary {
  /** 旧裏ストレージを除く、通常の商品数 */
  total: number | null;
  draft: number | null;
  published: number | null;
  /** 旧裏ストレージの商品数 */
  rawStorage: number | null;
}

export interface HomeDocumentSummary {
  total: number | null;
  /** 照合が未完了（未照合・一部照合）の書類数 */
  pending: number | null;
}

interface CountResult {
  count: number;
  excluded: number;
}

/**
 * 仕入照合の取得（全ページ分の書類一覧）が返らないまま読み込み表示が続かないよう、
 * この時間を超えたら取得失敗として扱う。
 * 通信そのものは止めず、画面の状態だけを終了させる（既存の取得処理は変更しない）。
 */
const DOCUMENT_FETCH_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("DOCUMENT_SUMMARY_TIMEOUT"));
    }, timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * 既存の商品一覧API（GET ?mode=admin）で件数だけを取得する。
 * 新しい集計APIは使わず、page_size=1 で count だけを読む。
 * 商品一覧画面と同じ除外条件（旧裏ストレージを隠す）を付け、
 * 一覧の「全 N 件」と数字が食い違わないようにする。
 */
async function fetchProductCount(
  isTestMode: boolean,
  publishStatus: string | null
): Promise<CountResult> {
  const params = new URLSearchParams();
  params.set("mode", "admin");
  params.set("page", "1");
  params.set("page_size", "1");
  params.set("record_status", "active");
  params.set("is_test", isTestMode ? "true" : "false");
  if (publishStatus) params.set("publish_status", publishStatus);
  params.set("exclude_storage_location_prefix", POKECA_RAW_STORAGE_PREFIX);

  const response = await fetchProductsReadApi(params.toString());
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = (await response.json()) as AdminProductListResponse;
  if (!data || data.success !== true) {
    throw new Error("Invalid response");
  }
  const count =
    typeof data.count === "number" ? data.count : data.products?.length ?? 0;
  return { count, excluded: Math.max(0, data.excluded_count ?? 0) };
}

/**
 * ホームの概要表示用データ。
 *
 * 表示するのは既存APIから取得できる値だけに限定する。
 * 取得できなかった項目は null のまま返し、画面側では値を出さない
 * （架空の数値・ダミーデータでの補完はしない）。
 */
export function useHomeSummary(isTestMode: boolean) {
  const [productState, setProductState] = useState<HomeDataState>("loading");
  const [products, setProducts] = useState<HomeProductSummary>({
    total: null,
    draft: null,
    published: null,
    rawStorage: null,
  });

  const [documentState, setDocumentState] =
    useState<HomeDataState>("loading");
  const [documents, setDocuments] = useState<HomeDocumentSummary>({
    total: null,
    pending: null,
  });

  // 商品概要と仕入照合は別々の取得なので、再取得のきっかけも分ける
  // （片方の失敗で、もう片方を不必要に取り直さない）。
  const [productReloadKey, setProductReloadKey] = useState(0);
  const [documentReloadKey, setDocumentReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setProductState("loading");

    const load = async () => {
      try {
        const [all, draft, published] = await Promise.all([
          fetchProductCount(isTestMode, null),
          fetchProductCount(isTestMode, "draft"),
          fetchProductCount(isTestMode, "published"),
        ]);
        if (cancelled) return;
        setProducts({
          total: all.count,
          draft: draft.count,
          published: published.count,
          rawStorage: all.excluded,
        });
        setProductState("success");
      } catch {
        if (cancelled) return;
        setProducts({
          total: null,
          draft: null,
          published: null,
          rawStorage: null,
        });
        setProductState("error");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isTestMode, productReloadKey]);

  useEffect(() => {
    let cancelled = false;
    setDocumentState("loading");

    const load = async () => {
      try {
        // 既存の書類一覧取得（全ページ分）をそのまま使い、応答が無い場合だけ打ち切る。
        const list = await withTimeout(
          fetchDocumentList(),
          DOCUMENT_FETCH_TIMEOUT_MS
        );
        if (cancelled) return;
        const summary = summarizeLedger(list);
        setDocuments({
          total: summary.total,
          pending: summary.partial + summary.unmatched,
        });
        setDocumentState("success");
      } catch (error) {
        if (cancelled) return;
        // 利用者向けの表示は簡潔にし、原因は開発時に確認できるようログへ残す。
        console.warn("[HOME_DOCUMENT_SUMMARY_FAILED]", error);
        setDocuments({ total: null, pending: null });
        setDocumentState("error");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [documentReloadKey]);

  const reloadProducts = useCallback(
    () => setProductReloadKey((k) => k + 1),
    []
  );
  const reloadDocuments = useCallback(
    () => setDocumentReloadKey((k) => k + 1),
    []
  );

  return {
    productState,
    products,
    documentState,
    documents,
    reloadProducts,
    reloadDocuments,
  };
}