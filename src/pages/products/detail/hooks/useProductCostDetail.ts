import { useCallback, useEffect, useState } from "react";
import {
  DocumentLedgerApiError,
  fetchProductCostDetail,
  type ProductCostDetail,
} from "@/pages/documents/lib/documentLedgerApi";

export type ProductCostLoadState = "loading" | "success" | "error";

export interface UseProductCostDetailResult {
  loadState: ProductCostLoadState;
  detail: ProductCostDetail | null;
  errorText: string;
  reload: () => void;
}

/**
 * 商品の確定済み仕入原価（get_product_cost）を1回だけ取得し、画面内で共有する。
 *
 * 商品詳細の上部サマリーと下部「仕入・書類」が同じ取得結果を使うことで、
 * 同じ税額・手数料を別々に足し直さず、上下の表示金額が食い違わない。
 */
export function useProductCostDetail(
  productId: string | undefined
): UseProductCostDetailResult {
  const [loadState, setLoadState] = useState<ProductCostLoadState>("loading");
  const [detail, setDetail] = useState<ProductCostDetail | null>(null);
  const [errorText, setErrorText] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!productId) {
      setDetail(null);
      setErrorText("");
      setLoadState("success");
      return;
    }
    let cancelled = false;
    setLoadState("loading");
    setErrorText("");
    fetchProductCostDetail(productId)
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
        setLoadState("success");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setErrorText(
          e instanceof DocumentLedgerApiError
            ? e.message
            : "仕入内訳を取得できませんでした。"
        );
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [productId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { loadState, detail, errorText, reload };
}