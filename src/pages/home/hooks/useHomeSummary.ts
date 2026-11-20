import { useCallback, useEffect, useState } from "react";
import { fetchDocumentList } from "@/pages/documents/lib/documentLedgerApi";
import { summarizeLedger } from "@/pages/documents/lib/ledgerSummary";
import type { AdminProduct } from "@/pages/products/types";
import {
  HOME_ATTENTION_METRICS,
  HOME_CATEGORIES,
  fetchHomeCount,
  fetchRecentProducts,
  type HomeRecentLoadState,
} from "@/pages/home/lib/homeData";

export type HomeDataState = "loading" | "success" | "error";

export interface HomeProductSummary {
  /** 商品総数（旧裏ストレージを含む） */
  total: number | null;
  draft: number | null;
  published: number | null;
}

export interface HomeDocumentSummary {
  total: number | null;
  /** 照合が未完了（未照合・一部照合）の書類数 */
  pending: number | null;
}

export interface HomeCategoryCount {
  key: string;
  label: string;
  to: string;
  /** 取得できなかった場合は null（0件と区別する） */
  count: number | null;
}

export interface HomeAttentionCount {
  key: string;
  label: string;
  count: number | null;
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
  });

  const [categoryState, setCategoryState] =
    useState<HomeDataState>("loading");
  const [categories, setCategories] = useState<HomeCategoryCount[]>(() =>
    HOME_CATEGORIES.map((category) => ({
      key: category.key,
      label: category.label,
      to: category.to,
      count: null,
    }))
  );

  const [attentionState, setAttentionState] =
    useState<HomeDataState>("loading");
  const [attention, setAttention] = useState<HomeAttentionCount[]>(() =>
    HOME_ATTENTION_METRICS.map((metric) => ({
      key: metric.key,
      label: metric.label,
      count: null,
    }))
  );

  const [recentState, setRecentState] = useState<
    HomeRecentLoadState | "loading"
  >("loading");
  const [recentProducts, setRecentProducts] = useState<AdminProduct[]>([]);

  const [documentState, setDocumentState] =
    useState<HomeDataState>("loading");
  const [documents, setDocuments] = useState<HomeDocumentSummary>({
    total: null,
    pending: null,
  });

  // 商品系の集計と仕入照合は別々の取得なので、再取得のきっかけも分ける
  // （片方の失敗で、もう片方を不必要に取り直さない）。
  const [productReloadKey, setProductReloadKey] = useState(0);
  const [documentReloadKey, setDocumentReloadKey] = useState(0);

  // 商品概要（商品・下書き・公開中）。
  // 旧裏ストレージも通常の商品として全件を対象にする（除外しない）。
  useEffect(() => {
    let cancelled = false;
    setProductState("loading");

    const load = async () => {
      try {
        const results = await Promise.allSettled([
          fetchHomeCount(isTestMode, {}),
          fetchHomeCount(isTestMode, { publishStatus: "draft" }),
          fetchHomeCount(isTestMode, { publishStatus: "published" }),
        ]);
        if (cancelled) return;

        const countAt = (index: number): number | null => {
          const result = results[index];
          return result.status === "fulfilled" ? result.value : null;
        };
        const total = countAt(0);
        const draft = countAt(1);
        const published = countAt(2);

        setProducts({ total, draft, published });
        setProductState(
          total === null && draft === null && published === null
            ? "error"
            : "success"
        );
      } catch {
        if (cancelled) return;
        setProducts({ total: null, draft: null, published: null });
        setProductState("error");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isTestMode, productReloadKey]);

  // カテゴリ別商品。各カテゴリの取得は独立しており、
  // 失敗したカテゴリだけを null（＝未取得）のまま残す。
  // Pokémon Card は複数条件（カテゴリ一致＋旧裏ストレージ取込）を合算する。
  useEffect(() => {
    let cancelled = false;
    setCategoryState("loading");

    const load = async () => {
      const results = await Promise.allSettled(
        HOME_CATEGORIES.map(async (category) => {
          const counts = await Promise.all(
            category.filters.map((filter) => fetchHomeCount(isTestMode, filter))
          );
          return counts.reduce((sum, count) => sum + count, 0);
        })
      );
      if (cancelled) return;

      const next = HOME_CATEGORIES.map((category, index) => {
        const result = results[index];
        return {
          key: category.key,
          label: category.label,
          to: category.to,
          count: result.status === "fulfilled" ? result.value : null,
        };
      });
      setCategories(next);
      setCategoryState(
        next.some((category) => category.count !== null) ? "success" : "error"
      );
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isTestMode, productReloadKey]);

  // 要確認項目（在庫あり・売却済み）。既存の在庫状態の定義をそのまま使う。
  useEffect(() => {
    let cancelled = false;
    setAttentionState("loading");

    const load = async () => {
      const results = await Promise.allSettled(
        HOME_ATTENTION_METRICS.map((metric) =>
          fetchHomeCount(isTestMode, metric.filter)
        )
      );
      if (cancelled) return;

      const next = HOME_ATTENTION_METRICS.map((metric, index) => {
        const result = results[index];
        return {
          key: metric.key,
          label: metric.label,
          count: result.status === "fulfilled" ? result.value : null,
        };
      });
      setAttention(next);
      setAttentionState(
        next.some((metric) => metric.count !== null) ? "success" : "error"
      );
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isTestMode, productReloadKey]);

  // 最近の商品。全体の登録日時順を保証できない場合は unsupported になり、
  // 画面側はセクション自体を表示しない（一部から選んだ5件を見せない）。
  useEffect(() => {
    let cancelled = false;
    setRecentState("loading");

    const load = async () => {
      try {
        const result = await fetchRecentProducts(isTestMode);
        if (cancelled) return;
        setRecentProducts(result.products);
        setRecentState(result.state);
      } catch {
        if (cancelled) return;
        setRecentProducts([]);
        setRecentState("error");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isTestMode, productReloadKey]);

  // 仕入照合。既存の書類一覧取得（全ページ分）をそのまま使い、
  // 応答が無い場合だけ打ち切る（読み込み表示が残り続けないようにする）。
  useEffect(() => {
    let cancelled = false;
    setDocumentState("loading");

    const load = async () => {
      try {
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
    categoryState,
    categories,
    attentionState,
    attention,
    recentState,
    recentProducts,
    documentState,
    documents,
    reloadProducts,
    reloadDocuments,
  };
}