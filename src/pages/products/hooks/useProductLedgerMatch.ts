import { useEffect, useMemo, useState } from "react";
import {
  fetchProductLedgerMatch,
  type LedgerMatchStatus,
} from "@/pages/products/lib/ledgerMatch";

export type ProductLedgerMatchLoadState = "loading" | "success" | "error";

export interface UseProductLedgerMatchResult {
  loadState: ProductLedgerMatchLoadState;
  // 商品IDごとの照合状態。取得できていない商品は含まれない（＝不明表示）。
  statuses: Map<string, LedgerMatchStatus>;
}

/**
 * 商品一覧の「仕入照合」列の状態を、表示中の1ページ分まとめて取得する。
 *
 * 商品一覧APIは照合情報を返さないため、一覧の取得後に1回だけまとめ読みする。
 * 商品ごとの追加リクエストは発行しない（ページ・絞り込み・再取得でキーが変わった時だけ実行）。
 */
export function useProductLedgerMatch(
  productIds: string[]
): UseProductLedgerMatchResult {
  const [loadState, setLoadState] =
    useState<ProductLedgerMatchLoadState>("loading");
  const [statuses, setStatuses] = useState<Map<string, LedgerMatchStatus>>(
    new Map()
  );

  // 並び順に依存せず、同じ商品集合なら再取得しない。
  const key = useMemo(
    () => Array.from(new Set(productIds)).sort().join("|"),
    [productIds]
  );

  useEffect(() => {
    if (key === "") {
      setStatuses(new Map());
      setLoadState("success");
      return;
    }
    let cancelled = false;
    setLoadState("loading");
    fetchProductLedgerMatch(key.split("|"))
      .then((next) => {
        if (cancelled) return;
        setStatuses(next);
        setLoadState("success");
      })
      .catch(() => {
        if (cancelled) return;
        // 取得できなかった商品は「—」（不明）として表示する。
        setStatuses(new Map());
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { loadState, statuses };
}