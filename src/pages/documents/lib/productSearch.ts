import { fetchProductsReadApi } from "@/config/productsApi";
import type {
  AdminProduct,
  AdminProductListResponse,
} from "@/pages/products/types";

// 手動紐付けの候補提示に使う、1回の検索の最大件数。
const SEARCH_PAGE_SIZE = 20;

// 商品ID部分一致で絞り込む（商品ID検索）。
function filterByProductId(
  products: AdminProduct[],
  query: string
): AdminProduct[] {
  const lower = query.toLowerCase();
  return products
    .filter((p) => (p.product_id ?? "").toLowerCase().includes(lower))
    .slice(0, SEARCH_PAGE_SIZE);
}

/**
 * 商品IDで商品を検索する（Cloud Run 商品一覧API GET ?mode=admin）。
 */
export async function searchProductsById(
  query: string
): Promise<AdminProduct[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const params = new URLSearchParams();
    params.set("mode", "admin");
    params.set("page", "1");
    params.set("page_size", String(SEARCH_PAGE_SIZE));
    params.set("search", q);

    const response = await fetchProductsReadApi(params.toString());
    if (!response.ok) return [];
    const data = (await response.json()) as AdminProductListResponse;
    if (data?.success !== true || !Array.isArray(data.products)) {
      return [];
    }
    return filterByProductId(data.products, q);
  } catch {
    return [];
  }
}