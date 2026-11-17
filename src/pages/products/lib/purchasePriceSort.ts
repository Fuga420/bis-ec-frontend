import { fetchProductsReadApi } from "@/config/productsApi";
import {
  PRODUCT_SORT_OPTIONS,
  type ProductSortKey,
} from "@/pages/products/lib/sort";
import type {
  AdminProduct,
  AdminProductListResponse,
} from "@/pages/products/types";

/**
 * 仕入価格ソート（Chrome Hearts / Sneakers / Apparel 共通）。
 *
 * 一覧APIの並び順（sort）は default / created / price / name のみに対応しており、
 * 仕入価格でのサーバー側ソートは存在しない。そのため仕入価格ソートを選んだときだけ、
 * 「現在の検索・絞り込み条件に一致する全件」を既存の一覧APIのページ送りで集め、
 * 数値として全件ソートしてからページを切り出す（その場の1ページ分だけを並べ替えない）。
 *
 * 商品データ・価格の保存や優先順位には一切触れず、一覧APIが返す purchase_price
 * （商品詳細の「仕入価格（手入力）」と同じ値）だけを並び替えの基準に使う。
 */

/** 対象3ページの並び替え選択肢（既存項目はそのまま維持し、仕入価格を追加する） */
export const PURCHASE_PRICE_SORT_OPTIONS: Array<{
  value: ProductSortKey;
  label: string;
}> = [
  { value: "default", label: "既定の順序" },
  { value: "created_desc", label: "登録日時：新しい順" },
  { value: "created_asc", label: "登録日時：古い順" },
  { value: "price_desc", label: "価格：高い順" },
  { value: "price_asc", label: "価格：安い順" },
  { value: "purchase_asc", label: "仕入価格：安い順" },
  { value: "purchase_desc", label: "仕入価格：高い順" },
  { value: "name_asc", label: "商品名：昇順" },
  { value: "name_desc", label: "商品名：降順" },
];

// 既存の選択肢が追加・変更された場合もそのまま反映されるようにしておく。
// （重複する値は追加しない）
PRODUCT_SORT_OPTIONS.forEach((option) => {
  if (
    !PURCHASE_PRICE_SORT_OPTIONS.some((item) => item.value === option.value)
  ) {
    PURCHASE_PRICE_SORT_OPTIONS.push(option);
  }
});

/** 仕入価格ソートかどうか */
export function isPurchasePriceSort(
  key: ProductSortKey
): key is "purchase_asc" | "purchase_desc" {
  return key === "purchase_asc" || key === "purchase_desc";
}

/**
 * 仕入価格を数値として取り出す。未設定（null / undefined / 空文字 / 数値でない値）は null。
 * 数値の 0 は有効な金額として扱う（未設定に変換しない）。
 */
function toPurchasePrice(product: AdminProduct): number | null {
  const raw = product.purchase_price as unknown;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

// 同額商品の順序がページ遷移や再読み込みで変わらないよう、一意な product_id を最終キーにする。
const idCollator = new Intl.Collator("ja", { sensitivity: "base", numeric: true });

function compareProductId(a: AdminProduct, b: AdminProduct): number {
  return idCollator.compare(a.product_id ?? "", b.product_id ?? "");
}

/** 仕入価格で全件ソートする（未設定は昇順・降順どちらでも末尾） */
export function sortByPurchasePrice(
  products: AdminProduct[],
  key: "purchase_asc" | "purchase_desc"
): AdminProduct[] {
  const direction = key === "purchase_desc" ? -1 : 1;
  return [...products].sort((a, b) => {
    const priceA = toPurchasePrice(a);
    const priceB = toPurchasePrice(b);
    if (priceA === null && priceB === null) return compareProductId(a, b);
    if (priceA === null) return 1;
    if (priceB === null) return -1;
    if (priceA !== priceB) return (priceA - priceB) * direction;
    return compareProductId(a, b);
  });
}

/** ソート済みの全件から、表示する1ページ分だけを切り出す */
export function sliceProductPage(
  products: AdminProduct[],
  page: number,
  pageSize: number
): AdminProduct[] {
  if (products.length === 0) return [];
  const safePage = page > 0 ? page : 1;
  const start = (safePage - 1) * pageSize;
  if (start >= products.length) return [];
  return products.slice(start, start + pageSize);
}

// 全件取得時の1ページあたり件数（一覧APIの上限）と、安全弁の最大ページ数。
const SORT_FETCH_PAGE_SIZE = 100;
const SORT_FETCH_MAX_PAGES = 60;

/**
 * 現在の検索・絞り込み条件に一致する商品を、既存の一覧APIのページ送りで全件集める。
 * 条件（ページ番号を除く）は呼び出し側の buildParams に委ねる。
 * 新しいAPI・バックエンド変更は行わない。
 */
export async function fetchAllProductsForSort(
  buildParams: (page: number, pageSize: number) => URLSearchParams
): Promise<AdminProduct[]> {
  const fetchPage = async (pageNumber: number) => {
    const response = await fetchProductsReadApi(
      buildParams(pageNumber, SORT_FETCH_PAGE_SIZE).toString()
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
      ? Math.min(first.total_pages, SORT_FETCH_MAX_PAGES)
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
    const concurrency = Math.min(4, remaining.length);
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
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
}

/** 条件一致の全件キャッシュ（同じ条件の間は再取得せず、取得中の重複リクエストもまとめる） */
export interface PurchasePriceCacheRef {
  current: {
    scopeKey: string;
    productsPromise: Promise<AdminProduct[]>;
  } | null;
}

/**
 * 仕入価格ソート時の1ページ分を組み立てる。
 * 条件一致の全件を（必要なら取得して）ソートし、指定ページだけを切り出す。
 * ページ送り・昇順降順の切り替えでは再取得せず、キャッシュした全件を並べ替える。
 */
export async function loadPurchasePriceSortedPage(options: {
  sortKey: "purchase_asc" | "purchase_desc";
  page: number;
  pageSize: number;
  scopeKey: string;
  cacheRef: PurchasePriceCacheRef;
  buildParams: (page: number, pageSize: number) => URLSearchParams;
}): Promise<{ products: AdminProduct[]; count: number; totalPages: number }> {
  const { sortKey, page, pageSize, scopeKey, cacheRef, buildParams } = options;

  // 同じ条件の全件取得が進行中なら、その結果を共有する（重複リクエストを防ぐ）。
  let entry =
    cacheRef.current?.scopeKey === scopeKey ? cacheRef.current : null;
  if (entry == null) {
    entry = {
      scopeKey,
      productsPromise: fetchAllProductsForSort(buildParams),
    };
    cacheRef.current = entry;
  }

  let all: AdminProduct[];
  try {
    all = await entry.productsPromise;
  } catch (error) {
    // 取得に失敗した結果をキャッシュに残さない（次回の再試行で取り直せるようにする）。
    if (cacheRef.current === entry) cacheRef.current = null;
    throw error;
  }

  const sorted = sortByPurchasePrice(all, sortKey);
  return {
    products: sliceProductPage(sorted, page, pageSize),
    count: sorted.length,
    totalPages: sorted.length > 0 ? Math.ceil(sorted.length / pageSize) : 0,
  };
}