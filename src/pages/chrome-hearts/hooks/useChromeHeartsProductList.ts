import { useEffect, useRef, useState } from "react";
import { fetchProductsReadApi } from "@/config/productsApi";
import type { ProductSortKey } from "@/pages/products/lib/sort";
import type {
  AdminProduct,
  AdminProductListResponse,
} from "@/pages/products/types";
import {
  CHROME_HEARTS_BRAND_SEARCH_TERM,
  CHROME_HEARTS_LIST_PAGE_SIZE,
} from "@/pages/chrome-hearts/lib/chromeHearts";

export type ChromeHeartsListLoadState = "loading" | "success" | "error";

interface UseChromeHeartsProductListParams {
  /** 入力した検索語（商品名・商品ID・ブランドの部分一致） */
  search: string;
  /** 商品種別（既存カテゴリ値。空＝すべて） */
  category: string;
  /** 公開状態（空＝すべて） */
  publishStatus: string;
  /** 在庫状態（空＝すべて） */
  inventoryStatus: string;
  sortKey: ProductSortKey;
  page: number;
  isTestMode: boolean;
  reloadKey: number;
}

/**
 * Chrome Heartsページの一覧取得。
 *
 * 商品一覧（/products）と同じ既存の一覧API（`mode=admin` のページ分割モード）を
 * そのまま使い、検索語に固定のブランド名（Chrome Hearts）を併用する。
 * 検索・種別・公開状態・在庫状態・並び順・ページ番号はすべて既存のGETパラメータで送り、
 * 件数・ページ数は応答の count / total_pages をそのまま表示する（部分取得を全件扱いしない）。
 */
export function useChromeHeartsProductList({
  search,
  category,
  publishStatus,
  inventoryStatus,
  sortKey,
  page,
  isTestMode,
  reloadKey,
}: UseChromeHeartsProductListParams) {
  const [loadState, setLoadState] =
    useState<ChromeHeartsListLoadState>("loading");
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [count, setCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // 古い応答が新しい検索結果を上書きしないための通番ガード。
  const requestSeqRef = useRef(0);

  // 通常モード／テストモードを切り替えた直後は、前のモードの商品・件数を残さない。
  // 取得中の一瞬だけ別モードの商品が混ざって見えるのを防ぐ（一覧はスケルトン表示に戻す）。
  const prevIsTestModeRef = useRef(isTestMode);
  useEffect(() => {
    if (prevIsTestModeRef.current === isTestMode) return;
    prevIsTestModeRef.current = isTestMode;
    setProducts([]);
    setCount(0);
    setTotalPages(0);
    setLoadState("loading");
  }, [isTestMode]);

  useEffect(() => {
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    let cancelled = false;
    setLoadState("loading");

    // 固定のブランド名と入力した検索語は、既存APIの空白区切りAND検索で併用する。
    const searchTerms = [CHROME_HEARTS_BRAND_SEARCH_TERM, search.trim()].filter(
      (term) => term !== ""
    );

    const params = new URLSearchParams();
    params.set("mode", "admin");
    params.set("page", String(page));
    params.set("page_size", String(CHROME_HEARTS_LIST_PAGE_SIZE));
    params.set("search", searchTerms.join(" "));
    params.set("category", category !== "" ? category : "all");
    params.set("publish_status", publishStatus !== "" ? publishStatus : "all");
    params.set(
      "inventory_status",
      inventoryStatus !== "" ? inventoryStatus : "all"
    );
    params.set("record_status", "active");
    params.set("is_test", isTestMode ? "true" : "false");
    params.set("sort", sortKey);

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
    search,
    category,
    publishStatus,
    inventoryStatus,
    sortKey,
    page,
    isTestMode,
    reloadKey,
  ]);

  return { loadState, products, count, totalPages };
}