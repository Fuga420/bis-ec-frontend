import { useEffect, useRef, useState } from "react";
import { fetchProductsReadApi } from "@/config/productsApi";
import type {
  AdminProduct,
  AdminProductListResponse,
} from "@/pages/products/types";

// 商品一覧と同じ密度に揃える（1ページ50件・サーバー側ページ分割）。
export const CATEGORY_LIST_PAGE_SIZE = 50;

// 連続入力による通信を防ぐ検索のデバウンス時間。
const SEARCH_DEBOUNCE_MS = 400;

export type CategoryListLoadState = "loading" | "success" | "error";

interface UseCategoryProductListParams {
  // カテゴリ値（未指定＝すべてのカテゴリ）。
  category?: string;
  // 固定の絞り込み語（例: ブランド名）。カテゴリを持たない区分で使う。
  brandKeyword?: string;
  // 通常モード / テストモードの切り替え。
  isTestMode: boolean;
  // 再取得キー（エラー時の取り直しに使う）。
  reloadKey: number;
}

/**
 * カテゴリ別ページ（スニーカー・クロムハーツ・アパレル）の一覧取得。
 *
 * 商品一覧と同じ既存API（`mode=admin` のページ分割モード）をそのまま使う。
 * 検索語・カテゴリ・モードはすべてGETパラメータで送り、
 * 件数・ページ数は応答の count / total_pages をそのまま表示する。
 */
export function useCategoryProductList({
  category,
  brandKeyword,
  isTestMode,
  reloadKey,
}: UseCategoryProductListParams) {
  const [loadState, setLoadState] = useState<CategoryListLoadState>("loading");
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [count, setCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [page, setPage] = useState(1);

  // 古い応答が新しい検索結果を上書きしないための通番ガード。
  const requestSeqRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedKeyword(keyword.trim()),
      SEARCH_DEBOUNCE_MS
    );
    return () => window.clearTimeout(timer);
  }, [keyword]);

  // 検索語・カテゴリ・モードが変わったら先頭ページに戻す。
  useEffect(() => {
    setPage(1);
  }, [debouncedKeyword, category, brandKeyword, isTestMode]);

  useEffect(() => {
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    let cancelled = false;
    setLoadState("loading");

    // 固定の絞り込み語と入力した検索語は、既存APIの空白区切りAND検索で併用する。
    const searchTerms = [brandKeyword?.trim() ?? "", debouncedKeyword].filter(
      (term) => term !== ""
    );

    const params = new URLSearchParams();
    params.set("mode", "admin");
    params.set("page", String(page));
    params.set("page_size", String(CATEGORY_LIST_PAGE_SIZE));
    params.set("search", searchTerms.join(" "));
    params.set("category", category ?? "all");
    params.set("publish_status", "all");
    params.set("inventory_status", "all");
    params.set("record_status", "active");
    params.set("is_test", isTestMode ? "true" : "false");
    params.set("sort", "default");

    const load = async () => {
      try {
        const response = await fetchProductsReadApi(params.toString());
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as AdminProductListResponse;
        if (!data || data.success !== true) {
          throw new Error("Invalid response");
        }
        if (cancelled || seq !== requestSeqRef.current) return;

        const list = data.products ?? [];
        setProducts(list);
        setCount(typeof data.count === "number" ? data.count : list.length);
        setTotalPages(
          typeof data.total_pages === "number"
            ? data.total_pages
            : list.length > 0
              ? 1
              : 0
        );
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
    category,
    brandKeyword,
    debouncedKeyword,
    isTestMode,
    page,
    reloadKey,
  ]);

  return {
    loadState,
    products,
    count,
    totalPages,
    page,
    setPage,
    keyword,
    setKeyword,
  };
}