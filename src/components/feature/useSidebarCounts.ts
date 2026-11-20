import { useEffect, useState } from "react";
import { fetchDocumentList } from "@/pages/documents/lib/documentLedgerApi";
import { summarizeLedger } from "@/pages/documents/lib/ledgerSummary";
import { HOME_CATEGORIES, fetchHomeCount } from "@/pages/home/lib/homeData";

/**
 * サイドバーに表示する件数。
 *
 * 取得方法はホームの集計と同じ既存処理をそのまま使う（新しいAPI・集計ロジックは作らない）。
 * - 商品・カテゴリ別件数: 商品一覧API（mode=admin / page_size=1）の count
 * - 仕入照合の未完了: 既存の書類一覧取得＋summarizeLedger
 *
 * 取得できなかった項目は null のまま返し、画面側では数値を出さない
 * （固定値・推測値で埋めない）。
 */
export interface SidebarCounts {
  /** 全商品数（旧裏ストレージを含む） */
  products: number | null;
  /** カテゴリ別件数（HOME_CATEGORIES の key をそのまま使う） */
  categories: Record<string, number | null>;
  /** 仕入照合の未完了（未照合＋一部照合）件数 */
  documentsPending: number | null;
}

/** 書類一覧の取得が返らないまま待ち続けないよう、この時間で打ち切る（ホームと同じ扱い）。 */
const DOCUMENT_FETCH_TIMEOUT_MS = 20000;

/**
 * ページ遷移のたびに同じ集計を取り直さないよう、短時間だけ結果を共有する。
 * 件数の表示先が増えるだけで、取得条件そのものは変えない。
 */
const CACHE_TTL_MS = 60000;

interface CacheEntry {
  at: number;
  promise: Promise<SidebarCounts>;
}

const cache = new Map<string, CacheEntry>();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("SIDEBAR_DOCUMENT_TIMEOUT"));
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

async function loadCounts(isTestMode: boolean): Promise<SidebarCounts> {
  const [productResult, categoryResults, documentResult] = await Promise.all([
    fetchHomeCount(isTestMode, {}).then(
      (value) => value,
      () => null
    ),
    Promise.all(
      HOME_CATEGORIES.map(async (category) => {
        const counts = await Promise.all(
          category.filters.map((filter) =>
            fetchHomeCount(isTestMode, filter).then(
              (value) => value,
              () => null
            )
          )
        );
        if (counts.some((count) => count === null)) return null;
        return counts.reduce<number>((sum, count) => sum + (count ?? 0), 0);
      })
    ),
    withTimeout(fetchDocumentList(), DOCUMENT_FETCH_TIMEOUT_MS).then(
      (list) => {
        const summary = summarizeLedger(list);
        return summary.partial + summary.unmatched;
      },
      (error) => {
        console.warn("[SIDEBAR_DOCUMENT_SUMMARY_FAILED]", error);
        return null;
      }
    ),
  ]);

  const categories: Record<string, number | null> = {};
  HOME_CATEGORIES.forEach((category, index) => {
    categories[category.key] = categoryResults[index] ?? null;
  });

  return {
    products: productResult,
    categories,
    documentsPending: documentResult,
  };
}

export function useSidebarCounts(isTestMode: boolean): SidebarCounts | null {
  const [counts, setCounts] = useState<SidebarCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = isTestMode ? "test" : "normal";
    const cached = cache.get(key);
    let promise: Promise<SidebarCounts>;

    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      promise = cached.promise;
    } else {
      promise = loadCounts(isTestMode);
      cache.set(key, { at: Date.now(), promise });
      // 失敗した結果を保持し続けないよう、失敗時はキャッシュを捨てる
      promise.catch(() => cache.delete(key));
    }

    promise
      .then((value) => {
        if (!cancelled) setCounts(value);
      })
      .catch(() => {
        if (!cancelled) setCounts(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isTestMode]);

  return counts;
}

export default useSidebarCounts;