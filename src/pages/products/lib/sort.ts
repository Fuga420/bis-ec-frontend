import type { AdminProduct } from "../types";

// 一覧の並び替えキー（フロントエンドのみ。取得済みの商品だけを対象にする）
export type ProductSortKey =
  | "default"
  | "created_desc"
  | "created_asc"
  | "price_desc"
  | "price_asc"
  | "name_asc"
  | "name_desc";

// 初期選択は現在の既存表示順（APIが返した順）を維持する「既定の順序」。
export const PRODUCT_SORT_OPTIONS: Array<{ value: ProductSortKey; label: string }> = [
  { value: "default", label: "既定の順序" },
  { value: "created_desc", label: "登録日時：新しい順" },
  { value: "created_asc", label: "登録日時：古い順" },
  { value: "price_desc", label: "価格：高い順" },
  { value: "price_asc", label: "価格：安い順" },
  { value: "name_asc", label: "商品名：昇順" },
  { value: "name_desc", label: "商品名：降順" },
];

// 価格を数値として比較する（未設定・NaNは最小値として扱う）
function toPrice(product: AdminProduct): number {
  const value = product.planned_sale_price;
  return typeof value === "number" && !Number.isNaN(value) ? value : Number.NEGATIVE_INFINITY;
}

// 日時を日付として比較する（パースできない場合は最古として扱う）
function toTime(product: AdminProduct): number {
  const time = new Date(product.created_at ?? "").getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

// 日本語を考慮した文字列比較（数値入りの商品名も自然に並ぶようにする）
const jaCollator = new Intl.Collator("ja", { sensitivity: "base", numeric: true });

// 同じ値でも表示順が安定するように product_id を最終キーにする
function compareId(a: AdminProduct, b: AdminProduct): number {
  return jaCollator.compare(a.product_id ?? "", b.product_id ?? "");
}

// 元配列を直接変更しないようコピーした配列をソートして返す
export function sortProducts(
  products: AdminProduct[],
  key: ProductSortKey
): AdminProduct[] {
  const list = [...products];
  if (key === "default") return list;

  list.sort((a, b) => {
    switch (key) {
      case "created_desc":
        return toTime(b) - toTime(a) || compareId(a, b);
      case "created_asc":
        return toTime(a) - toTime(b) || compareId(a, b);
      case "price_desc":
        return toPrice(b) - toPrice(a) || compareId(a, b);
      case "price_asc":
        return toPrice(a) - toPrice(b) || compareId(a, b);
      case "name_asc":
        return jaCollator.compare(a.product_name ?? "", b.product_name ?? "") || compareId(a, b);
      case "name_desc":
        return jaCollator.compare(b.product_name ?? "", a.product_name ?? "") || compareId(a, b);
      default:
        return 0;
    }
  });

  return list;
}