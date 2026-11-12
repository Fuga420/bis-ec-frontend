import { useCallback, useEffect, useRef, useState } from "react";
import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
import { fetchProductsReadApi } from "@/config/productsApi";
import type { ProductFilterValue } from "@/pages/products/components/ProductFilterBar";
import type { ProductSortKey } from "@/pages/products/lib/sort";
import type {
  AdminProduct,
  AdminProductListResponse,
} from "@/pages/products/types";

// MVP既定の1ページあたり件数（契約の既定値・上限値に合わせる）。
export const PRODUCT_LIST_PAGE_SIZE = 50;

// 「条件に一致する全件を選択」でページ送りする上限（50件 × 60ページ = 3,000件）。
// 無限にAPIを叩き続けないための安全弁で、通常運用では到達しない。
const SELECT_ALL_MAX_PAGES = 60;

// 連続入力による通信を防ぐ検索のデバウンス時間。
const SEARCH_DEBOUNCE_MS = 400;

export type ProductListLoadState = "loading" | "success" | "error";

// 検索・フィルターの初期値（未指定＝全件）。
export const EMPTY_PRODUCT_FILTER: ProductFilterValue = {
  search: "",
  category: "",
  publishStatus: "",
  inventoryStatus: "",
};

interface UseProductListParams {
  // 通常一覧 / アーカイブ済み一覧の切り替え。
  isArchived: boolean;
  // 通常モード / テストモードの切り替え。
  isTestMode: boolean;
  // 一括操作後に一覧を再取得するためのキー。
  reloadKey: number;
  // 詳細画面から戻ってきたときだけ渡される初期状態（検索・フィルター・並び替え・ページ）。
  // 未指定（新規アクセス）の場合は既定値から始める。
  initialState?: {
    filter: ProductFilterValue;
    sortKey: ProductSortKey;
    page: number;
  } | null;
}

/**
 * 商品一覧（/products）のサーバー側検索・絞り込み・並び替え・ページ分割フック。
 *
 * - 一覧取得は通常 GAS 商品一覧API v3（`mode=admin&page=1&page_size=50...`）へ
 *   `page` を送信してページ分割モードで取得する。
 * - 検索・カテゴリ・公開状態・在庫状態・台帳状態・並び順はすべてGETパラメータでGASへ送る。
 *   ブラウザ側で取得済み商品を再検索・再ソートはしない。
 * - 検索入力はデバウンスし、古い応答が新しい結果を上書きしないよう通番でガードする。
 *
 * 互換対応（暫定）:
 * - GAS本番がまだ v2（ページ分割非対応）の場合、新パラメータを渡すと 0 件が返ることがある。
 *   その場合のみ旧形式（`?mode=admin` / `?mode=admin&record_status=archived`）で取り直して
 *   商品を表示する。v3 が配信されたらこの分岐には入らず、自動でページ分割モードになる。
 *   （この暫定経路ではサーバー側の絞り込み・並び替え・ページ分割は v2 側に存在しないため、
 *    それらが有効になるのは v3 配信後。商品が消えるよりは表示を優先する。）
 */
export function useProductList({
  isArchived,
  isTestMode,
  reloadKey,
  initialState,
}: UseProductListParams) {
  const [loadState, setLoadState] = useState<ProductListLoadState>("loading");
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [count, setCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [filter, setFilter] = useState<ProductFilterValue>(
    initialState?.filter ?? EMPTY_PRODUCT_FILTER
  );
  const [sortKey, setSortKey] = useState<ProductSortKey>(
    initialState?.sortKey ?? "default"
  );
  const [page, setPage] = useState(initialState?.page ?? 1);

  // 検索入力のデバウンス値。入力中の連続通信を防ぐ。
  // 復元時は入力済みの検索文字列から始め、余分な取得を発生させない。
  const [debouncedSearch, setDebouncedSearch] = useState(
    (initialState?.filter?.search ?? "").trim()
  );
  useEffect(() => {
    const trimmed = filter.search.trim();
    const timer = window.setTimeout(
      () => setDebouncedSearch(trimmed),
      SEARCH_DEBOUNCE_MS
    );
    return () => window.clearTimeout(timer);
  }, [filter.search]);

  // タブ（通常／アーカイブ）やモード（通常／テスト）を切り替えた際のスコープ変化追跡。
  const prevScopeRef = useRef({ isArchived, isTestMode });

  // 古い応答が新しい検索結果を上書きしないための通番ガード。
  const requestSeqRef = useRef(0);

  // 一覧APIの取得条件（既存パラメータの範囲内）を1か所で組み立てる。
  // 通常のページ取得と「条件に一致する全件を選択」のページ送りで同じ条件を使う。
  const buildListParams = useCallback(
    (pageNumber: number) => {
      const params = new URLSearchParams();
      // 必ずページ分割モードで呼ぶ（page の送信を省略しない）。
      params.set("mode", "admin");
      params.set("page", String(pageNumber));
      params.set("page_size", String(PRODUCT_LIST_PAGE_SIZE));
      params.set("search", debouncedSearch);
      params.set("category", filter.category || "all");
      params.set("publish_status", filter.publishStatus || "all");
      params.set("inventory_status", filter.inventoryStatus || "all");
      params.set("record_status", isArchived ? "archived" : "active");
      params.set("is_test", isTestMode ? "true" : "false");
      params.set("sort", sortKey);
      return params;
    },
    [
      debouncedSearch,
      filter.category,
      filter.publishStatus,
      filter.inventoryStatus,
      isArchived,
      isTestMode,
      sortKey,
    ]
  );

  /**
   * 現在の絞り込み条件（検索・カテゴリ・公開状態・在庫状態・記録状態・通常/テスト）の
   * 全件を既存の一覧APIでページ送りして集める（新しいAPIは使わない）。
   * product_id の重複は Map で排除し、取得順は一覧APIの並び順のまま保つ。
   */
  const fetchAllMatchingProducts = useCallback(async () => {
    const collected = new Map<string, AdminProduct>();
    let pageNumber = 1;
    let lastPage = 1;

    while (pageNumber <= lastPage && pageNumber <= SELECT_ALL_MAX_PAGES) {
      const response = await fetchProductsReadApi(
        buildListParams(pageNumber).toString()
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as AdminProductListResponse;
      if (!data || data.success !== true) {
        throw new Error("Invalid response");
      }
      const list = data.products ?? [];
      list.forEach((product) => {
        if (product && product.product_id && !collected.has(product.product_id)) {
          collected.set(product.product_id, product);
        }
      });

      // ページ分割非対応（旧v2）の応答では total_pages が無いため、その1回で打ち切る。
      lastPage = typeof data.total_pages === "number" ? data.total_pages : 1;
      if (list.length === 0) break;
      pageNumber += 1;
    }

    return Array.from(collected.values());
  }, [buildListParams]);

  useEffect(() => {
    const scopeChanged =
      prevScopeRef.current.isArchived !== isArchived ||
      prevScopeRef.current.isTestMode !== isTestMode;
    if (scopeChanged) {
      prevScopeRef.current = { isArchived, isTestMode };
      setProducts([]);
      setCount(0);
      setTotalPages(0);
      setLoadState("loading");
      if (page !== 1) {
        setPage(1);
        return;
      }
    }

    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    let cancelled = false;
    setLoadState("loading");

    const load = async () => {
      try {
        const response = await fetchProductsReadApi(
          buildListParams(page).toString()
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as AdminProductListResponse;
        if (!data || data.success !== true) {
          throw new Error("Invalid response");
        }
        // 送信後にさらに新しいリクエストが始まっていたら、この応答は破棄する。
        if (cancelled || seq !== requestSeqRef.current) return;

        // v3（ページ分割対応）: total_pages が数値で返る。そのままページ分割モードで表示する。
        if (typeof data.total_pages === "number") {
          const list = data.products ?? [];
          setProducts(list);
          setCount(typeof data.count === "number" ? data.count : list.length);
          setTotalPages(data.total_pages);
          setLoadState("success");
          return;
        }

        // 旧 v2 だが新パラメータを無視して全件を返してきた場合は、そのまま全件を表示する。
        const v2List = data.products ?? [];
        if (v2List.length > 0) {
          setProducts(v2List);
          setCount(typeof data.count === "number" ? data.count : v2List.length);
          setTotalPages(1);
          setLoadState("success");
          return;
        }

        // テストモード時は旧 GAS v2 フォールバック（is_test 非対応）へ流さない。
        if (isTestMode) {
          setProducts([]);
          setCount(0);
          setTotalPages(0);
          setLoadState("success");
          return;
        }
        // （v3 が配信されたらこの分岐には入らない）
        const legacyUrl = isArchived
          ? `${GOOGLE_SHEETS_WEBHOOK_URL}?mode=admin&record_status=archived`
          : `${GOOGLE_SHEETS_WEBHOOK_URL}?mode=admin`;
        const legacyResponse = await fetch(legacyUrl, { method: "GET" });
        if (!legacyResponse.ok) {
          throw new Error(`HTTP ${legacyResponse.status}`);
        }
        const legacyData =
          (await legacyResponse.json()) as AdminProductListResponse;
        if (!legacyData || legacyData.success !== true) {
          throw new Error("Invalid response");
        }
        if (cancelled || seq !== requestSeqRef.current) return;

        const legacyList = legacyData.products ?? [];
        setProducts(legacyList);
        setCount(
          typeof legacyData.count === "number"
            ? legacyData.count
            : legacyList.length
        );
        setTotalPages(legacyList.length > 0 ? 1 : 0);
        setLoadState("success");
      } catch {
        if (cancelled || seq !== requestSeqRef.current) return;
        setLoadState("error");
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [buildListParams, page, reloadKey]);

  const resetFilter = useCallback(() => {
    setFilter(EMPTY_PRODUCT_FILTER);
    setPage(1);
  }, []);

  return {
    loadState,
    products,
    count,
    totalPages,
    filter,
    setFilter,
    sortKey,
    setSortKey,
    page,
    setPage,
    resetFilter,
    // 現在の絞り込み条件で全ページ分の商品を取得する（「全件を選択」用）。
    fetchAllMatchingProducts,
  };
}