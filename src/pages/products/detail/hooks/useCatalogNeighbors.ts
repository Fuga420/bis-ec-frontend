import { useEffect, useState } from "react";
import { fetchProductsReadApi } from "@/config/productsApi";
import type { AdminProductListResponse } from "@/pages/products/types";

export interface CatalogNeighbor {
  id: string;
  name: string;
}

export interface CatalogNeighborsState {
  loading: boolean;
  // 一覧上の1つ前 / 1つ次の商品（取得できない場合は null）
  prev: CatalogNeighbor | null;
  next: CatalogNeighbor | null;
  // 一覧上の並び順（1始まり）と取得できた件数（ページ番号風の表示に使う）
  position: number | null;
  total: number;
}

const EMPTY: CatalogNeighborsState = {
  loading: false,
  prev: null,
  next: null,
  position: null,
  total: 0,
};

/**
 * 商品詳細フッターの「前の商品 / 次の商品」用に、一覧上の並びを読む。
 * 既存の管理用一覧API（mode=admin）を1ページ分だけ読み、現在の商品の位置を探す。
 * 取得に失敗しても画面は壊さず、前後リンクを出さないだけに留める（読み取り専用）。
 */
export function useCatalogNeighbors(
  productId: string | undefined,
  isTest = false
): CatalogNeighborsState {
  const [state, setState] = useState<CatalogNeighborsState>({
    ...EMPTY,
    loading: true,
  });

  useEffect(() => {
    if (!productId) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    const load = async () => {
      try {
        const params = new URLSearchParams();
        params.set("mode", "admin");
        params.set("page", "1");
        params.set("page_size", "100");
        params.set("is_test", isTest ? "true" : "false");
        const response = await fetchProductsReadApi(params.toString());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as AdminProductListResponse;
        if (!data || data.success !== true || !Array.isArray(data.products)) {
          throw new Error("Invalid response");
        }
        if (cancelled) return;

        const rows = data.products;
        const index = rows.findIndex((row) => row.product_id === productId);
        if (index < 0) {
          setState({ ...EMPTY, total: rows.length });
          return;
        }

        const toNeighbor = (
          row: (typeof rows)[number] | undefined
        ): CatalogNeighbor | null =>
          row
            ? {
                id: row.product_id,
                name: (row.product_name ?? "").trim(),
              }
            : null;

        setState({
          loading: false,
          prev: toNeighbor(rows[index - 1]),
          next: toNeighbor(rows[index + 1]),
          position: index + 1,
          total: rows.length,
        });
      } catch {
        if (!cancelled) setState(EMPTY);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [productId, isTest]);

  return state;
}