import type { AdminProduct } from "../types";

// 一覧で先頭に表示する商品タイトルを決める（表示専用）。
// 本票の商品名(product_name)を表示し、空欄なら「（商品名なし）」を返す。
export function getProductDisplayTitle(
  product: Pick<AdminProduct, "product_name">
): string {
  const name = (product.product_name ?? "").trim();
  if (name !== "") return name;
  return "（商品名なし）";
}