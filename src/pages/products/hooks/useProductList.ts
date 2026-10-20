import { useCallback, useEffect, useRef, useState } from "react";
import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
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

  // タブ（通常／アーカイブ）を切り替えたら1ページ目に戻す。
  const prevArchivedRef = useRef(isArchived);
  useEffect(() => {
    if (prevArchivedRef.current !== isArchived) {
      prevArchivedRef.current = isArchived;
      setPage(1);
    }
  }, [isArchived]);

  // 古い応答が新しい検索結果を上書きしないための通番ガード。
  const requestSeqRef = useRef(0);

  useEffect(() => {
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    let cancelled = false;
    setLoadState("loading");

    const load = async () => {
      try {
        const params = new URLSearchParams();
        // 必ずページ分割モードで呼ぶ（page の送信を省略しない）。
        params.set("mode", "admin");
        params.set("page", String(page));
        params.set("page_size", String(PRODUCT_LIST_PAGE_SIZE));
        params.set("search", debouncedSearch);
        params.set("category", filter.category || "all");
        params.set("publish_status", filter.publishStatus || "all");
        params.set("inventory_status", filter.inventoryStatus || "all");
        params.set("record_status", isArchived ? "archived" : "active");
        params.set("sort", sortKey);

        const response = await fetch(
          `${GOOGLE_SHEETS_WEBHOOK_URL}?${params.toString()}`,
          { method: "GET" }
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

        // 旧 v2 が新パラメータを解釈できず空を返した場合は、旧形式で取り直して表示する。
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
  }, [
    debouncedSearch,
    filter.category,
    filter.publishStatus,
    filter.inventoryStatus,
    sortKey,
    page,
    isArchived,
    reloadKey,
  ]);

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
  };
}