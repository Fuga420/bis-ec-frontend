import { useCallback, useEffect, useRef, useState } from "react";
import { fetchProductsReadApi } from "@/config/productsApi";
import type { ProductFilterValue } from "@/pages/products/components/ProductFilterBar";
import type { ProductSortKey } from "@/pages/products/lib/sort";
import type {
  AdminProduct,
  AdminProductListResponse,
} from "@/pages/products/types";

// MVP既定の1ページあたり件数（契約の既定値・上限値に合わせる）。
export const PRODUCT_LIST_PAGE_SIZE = 50;

// 連続入力による通信を防ぐ検索のデバウンス時間。
const SEARCH_DEBOUNCE_MS = 400;

// 「全件を選択」などでページ送りするときの取得件数と上限ページ。
// 一覧APIの page_size 上限（100）を使い、通信回数を減らす。
// 上限は無限ループ防止の安全弁で、通常運用（数千件規模）では到達しない。
const HIDDEN_ALL_FETCH_PAGE_SIZE = 100;
const HIDDEN_ALL_MAX_PAGES = 100;

export type ProductListLoadState = "loading" | "success" | "error";

// 検索・フィルターの初期値（未指定＝全件）。
export const EMPTY_PRODUCT_FILTER: ProductFilterValue = {
  search: "",
  category: "",
  publishStatus: "",
  inventoryStatus: "",
  importMode: "",
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
 * - 検索・カテゴリ・公開状態・在庫状態・台帳状態・並び順はすべてGETパラメータでAPIへ送る。
 *   ブラウザ側で取得済み商品を再検索・再ソートはしない。
 * - 件数・ページングは応答の count / total_pages をそのまま使う（全件取得しない）。
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
    (pageNumber: number, pageSize = PRODUCT_LIST_PAGE_SIZE) => {
      const params = new URLSearchParams();
      // 必ずページ分割モードで呼ぶ（page の送信を省略しない）。
      params.set("mode", "admin");
      params.set("page", String(pageNumber));
      params.set("page_size", String(pageSize));
      params.set("search", debouncedSearch);
      params.set("category", filter.category || "all");
      params.set("publish_status", filter.publishStatus || "all");
      params.set("inventory_status", filter.inventoryStatus || "all");
      // 旧裏ストレージ（ポケカ素地取込）の商品だけに絞る。
      // 「すべての商品」ではパラメータ自体を送らず、従来どおりの取得条件を保つ。
      if (filter.importMode) {
        params.set("import_mode", filter.importMode);
      }
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
      filter.importMode,
      isArchived,
      isTestMode,
      sortKey,
    ]
  );

  /**
   * 現在の絞り込み条件（検索・カテゴリ・公開状態・在庫状態・記録状態・通常/テスト）に
   * 一致する商品を、既存の一覧APIをページ送りして全件集める（新しいAPIは使わない）。
   *
   * 1ページ目で総ページ数を確認したあと、残りのページを少数並列で取得する
   * （直列だと数千件規模で待ち時間が長くなるため）。並び順が崩れないよう、
   * 取得結果はページ番号順に結合し、product_id の重複は除外する。
   */
  const fetchAllFilteredProducts = useCallback(async () => {
    const fetchPage = async (pageNumber: number) => {
      const response = await fetchProductsReadApi(
        buildListParams(pageNumber, HIDDEN_ALL_FETCH_PAGE_SIZE).toString()
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as AdminProductListResponse;
      if (!data || data.success !== true) {
        throw new Error("Invalid response");
      }
      return data;
    };

    const first = await fetchPage(1);
    const pageLists: AdminProduct[][] = [first.products ?? []];

    // ページ分割非対応（旧v2）の応答では total_pages が無いため、その1回で打ち切る。
    const lastPage =
      typeof first.total_pages === "number"
        ? Math.min(first.total_pages, HIDDEN_ALL_MAX_PAGES)
        : 1;

    if (lastPage > 1) {
      const remaining: number[] = [];
      for (let p = 2; p <= lastPage; p += 1) remaining.push(p);

      let cursor = 0;
      const worker = async () => {
        while (cursor < remaining.length) {
          const targetPage = remaining[cursor];
          cursor += 1;
          const data = await fetchPage(targetPage);
          pageLists[targetPage - 1] = data.products ?? [];
        }
      };
      const concurrency = Math.min(6, remaining.length);
      await Promise.all(
        Array.from({ length: concurrency }, () => worker())
      );
    }

    const collected = new Map<string, AdminProduct>();
    pageLists.forEach((list) => {
      (list ?? []).forEach((product) => {
        if (product && product.product_id && !collected.has(product.product_id)) {
          collected.set(product.product_id, product);
        }
      });
    });
    return Array.from(collected.values());
  }, [buildListParams]);

  /**
   * 「条件に一致する全件を選択」用。表示中の一覧と同じ範囲を返す。
   */
  const fetchAllMatchingProducts = useCallback(
    () => fetchAllFilteredProducts(),
    [fetchAllFilteredProducts]
  );

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
        // 一覧は常にページ単位で取得する（取得済みの一部を全件として扱わない）。
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

        // ページ分割非対応応答のフォールバック（GAS v2 フォールバックは撤去済み）
        const list = data.products ?? [];
        setProducts(list);
        setCount(typeof data.count === "number" ? data.count : list.length);
        setTotalPages(list.length > 0 ? 1 : 0);
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