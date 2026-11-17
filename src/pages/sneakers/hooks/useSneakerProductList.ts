import { useEffect, useRef, useState } from "react";
import { fetchProductsReadApi } from "@/config/productsApi";
import type { ProductSortKey } from "@/pages/products/lib/sort";
import type {
  AdminProduct,
  AdminProductListResponse,
} from "@/pages/products/types";
import {
  isPurchasePriceSort,
  loadPurchasePriceSortedPage,
  type PurchasePriceCacheRef,
} from "@/pages/products/lib/purchasePriceSort";

// 商品一覧と同じ密度に揃える（1ページ50件・サーバー側ページ分割）。
export const SNEAKER_LIST_PAGE_SIZE = 50;

export type SneakerListLoadState = "loading" | "success" | "error";

interface UseSneakerProductListParams {
  // 検索語（商品名・商品ID・ブランドの部分一致。空白区切りAND検索はAPI側の仕様）
  search: string;
  // 公開状態の絞り込み（空＝すべて）
  publishStatus: string;
  // 在庫状態の絞り込み（空＝すべて）
  inventoryStatus: string;
  sortKey: ProductSortKey;
  page: number;
  isTestMode: boolean;
  reloadKey: number;
}

/**
 * Sneakersページの一覧取得。
 *
 * 商品一覧（/products）と同じ既存の一覧API（`mode=admin` のページ分割モード）を
 * そのまま使い、カテゴリ `sneaker` だけを固定で送る。
 * 検索・公開状態・在庫状態・並び替え・ページ番号は既存APIのGETパラメータだけで表現し、
 * 新しいAPIやバックエンドの変更は行わない。
 *
 * 仕入価格ソート（一覧API未対応）を選んだときだけ、条件一致の全件を集めてから
 * 数値でソートし、必要なページを切り出す。
 */
export function useSneakerProductList({
  search,
  publishStatus,
  inventoryStatus,
  sortKey,
  page,
  isTestMode,
  reloadKey,
}: UseSneakerProductListParams) {
  const [loadState, setLoadState] = useState<SneakerListLoadState>("loading");
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [count, setCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // 古い応答が新しい検索結果を上書きしないための通番ガード。
  const requestSeqRef = useRef(0);

  // 仕入価格ソート用に集めた「条件一致の全件」（条件が変わらない間は再取得しない）。
  const purchaseCacheRef = useRef<PurchasePriceCacheRef["current"]>(null);

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

    // 一覧APIの取得条件（既存パラメータの範囲内）を1か所で組み立てる。
    // 仕入価格ソートの全件取得でも同じ条件を使う（ページ番号と並び順だけ差し替える）。
    const buildParams = (
      pageNumber: number,
      pageSize: number,
      sort: string
    ) => {
      const params = new URLSearchParams();
      params.set("mode", "admin");
      params.set("page", String(pageNumber));
      params.set("page_size", String(pageSize));
      params.set("search", search);
      // スニーカーのカテゴリ値は既存データの "sneaker"（CATEGORY_LABELS と同じ値）。
      params.set("category", "sneaker");
      params.set("publish_status", publishStatus !== "" ? publishStatus : "all");
      params.set(
        "inventory_status",
        inventoryStatus !== "" ? inventoryStatus : "all"
      );
      params.set("record_status", "active");
      params.set("is_test", isTestMode ? "true" : "false");
      params.set("sort", sort);
      return params;
    };

    // 仕入価格ソートの全件キャッシュを分けるための条件キー（ページ・並び順は含めない）。
    const scopeKey = `${buildParams(1, 1, "default").toString()}|reload:${
      reloadKey
    }`;

    const load = async () => {
      try {
        if (isPurchasePriceSort(sortKey)) {
          // 一覧APIは仕入価格での並び替えに未対応のため、現在の検索・絞り込み条件に
          // 一致する全件を集めてから数値でソートし、必要なページ分だけを切り出す。
          const result = await loadPurchasePriceSortedPage({
            sortKey,
            page,
            pageSize: SNEAKER_LIST_PAGE_SIZE,
            scopeKey,
            cacheRef: purchaseCacheRef,
            buildParams: (targetPage, pageSize) =>
              buildParams(targetPage, pageSize, "default"),
          });
          if (cancelled || seq !== requestSeqRef.current) return;
          setProducts(result.products);
          setCount(result.count);
          setTotalPages(result.totalPages);
          setLoadState("success");
          return;
        }

        const response = await fetchProductsReadApi(
          buildParams(page, SNEAKER_LIST_PAGE_SIZE, sortKey).toString()
        );
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
    publishStatus,
    inventoryStatus,
    sortKey,
    page,
    isTestMode,
    reloadKey,
  ]);

  return { loadState, products, count, totalPages };
}