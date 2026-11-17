import { useEffect, useRef, useState } from "react";
import { fetchProductsReadApi } from "@/config/productsApi";
import { pickRawStorageProducts } from "@/pages/pokeka/lib/rawStorage";
import type {
  AdminProduct,
  AdminProductListResponse,
} from "@/pages/products/types";

export type PokekaListLoadState = "loading" | "success" | "error";

// 一覧APIの page_size 上限（100）を使い、取得回数を抑える。
const FETCH_PAGE_SIZE = 100;
// 無限ループ防止の安全弁（通常運用では到達しない）。
const MAX_PAGES = 100;
// 直列取得だと数千件で待ち時間が長くなるため、少数並列で取得する。
const PARALLEL_LIMIT = 6;

interface UsePokekaRawStorageListParams {
  isTestMode: boolean;
  reloadKey: number;
}

/**
 * 旧裏ストレージ商品（storage_location が「旧裏ストレージ/」で始まる商品）の全件取得。
 *
 * 既存の商品一覧と同じ方式:
 * 一覧APIをページ送りで全件取得 → storage_location で振り分け → 画面側で 50 件ずつページ表示。
 * 条件（モード）が変わらない間はキャッシュし、ページ移動で再取得しない。
 */
export function usePokekaRawStorageList({
  isTestMode,
  reloadKey,
}: UsePokekaRawStorageListParams) {
  const [loadState, setLoadState] = useState<PokekaListLoadState>("loading");
  const [items, setItems] = useState<AdminProduct[]>([]);
  // 取得した全商品（グレード未判定件数の集計用）。表示には使わない。
  const [allItems, setAllItems] = useState<AdminProduct[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  const cacheRef = useRef<{
    key: string;
    items: AdminProduct[];
    allItems: AdminProduct[];
  } | null>(null);
  const seqRef = useRef(0);

  // 通常モード／テストモードを切り替えた直後は、前のモードの商品を残さない。
  // 取得中の一瞬だけ別モードの商品が混ざって見えるのを防ぐ。
  const prevIsTestModeRef = useRef(isTestMode);
  useEffect(() => {
    if (prevIsTestModeRef.current === isTestMode) return;
    prevIsTestModeRef.current = isTestMode;
    setItems([]);
    setAllItems([]);
    setErrorMessage("");
    setLoadState("loading");
  }, [isTestMode]);

  useEffect(() => {
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    let cancelled = false;

    const cacheKey = `${isTestMode ? "test" : "normal"}|reload:${reloadKey}`;
    const cached = cacheRef.current?.key === cacheKey ? cacheRef.current : null;
    if (cached) {
      setItems(cached.items);
      setAllItems(cached.allItems);
      setLoadState("success");
      setErrorMessage("");
      return () => {
        cancelled = true;
      };
    }

    setLoadState("loading");
    setErrorMessage("");

    const buildParams = (pageNumber: number) => {
      const params = new URLSearchParams();
      params.set("mode", "admin");
      params.set("page", String(pageNumber));
      params.set("page_size", String(FETCH_PAGE_SIZE));
      params.set("search", "");
      params.set("category", "all");
      params.set("publish_status", "all");
      params.set("inventory_status", "all");
      params.set("record_status", "active");
      params.set("is_test", isTestMode ? "true" : "false");
      params.set("sort", "default");
      return params.toString();
    };

    const fetchPage = async (pageNumber: number) => {
      const response = await fetchProductsReadApi(buildParams(pageNumber));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as AdminProductListResponse;
      if (!data || data.success !== true) throw new Error("Invalid response");
      return data;
    };

    const load = async () => {
      try {
        const first = await fetchPage(1);
        const pageLists: AdminProduct[][] = [first.products ?? []];

        const lastPage =
          typeof first.total_pages === "number"
            ? Math.min(first.total_pages, MAX_PAGES)
            : 1;

        if (lastPage > 1) {
          const remaining: number[] = [];
          for (let p = 2; p <= lastPage; p += 1) remaining.push(p);
          let cursor = 0;
          const worker = async () => {
            while (cursor < remaining.length) {
              const target = remaining[cursor];
              cursor += 1;
              const data = await fetchPage(target);
              pageLists[target - 1] = data.products ?? [];
            }
          };
          await Promise.all(
            Array.from({ length: Math.min(PARALLEL_LIMIT, remaining.length) }, () =>
              worker()
            )
          );
        }

        const collected = new Map<string, AdminProduct>();
        pageLists.forEach((list) => {
          (list ?? []).forEach((product) => {
            if (
              product &&
              product.product_id &&
              !collected.has(product.product_id)
            ) {
              collected.set(product.product_id, product);
            }
          });
        });

        const all = Array.from(collected.values());
        const rawStorage = pickRawStorageProducts(all);
        if (cancelled || seq !== seqRef.current) return;

        cacheRef.current = { key: cacheKey, items: rawStorage, allItems: all };
        setItems(rawStorage);
        setAllItems(all);
        setLoadState("success");
      } catch (err) {
        if (cancelled || seq !== seqRef.current) return;
        console.error("pokeka raw storage list failed:", err);
        setErrorMessage(
          "旧裏ストレージ商品の取得に失敗しました。時間をおいてもう一度お試しください。"
        );
        setLoadState("error");
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [isTestMode, reloadKey]);

  return { loadState, items, allItems, errorMessage };
}