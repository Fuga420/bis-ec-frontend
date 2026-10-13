import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
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
 * 商品IDで商品を検索する。
 *
 * 新しいAPIは追加せず、既存の商品一覧API（GET ?mode=admin）を再利用する。
 * - まずページ分割モード（page / page_size / search）で検索し、
 *   商品IDの部分一致で絞り込む。
 * - 旧仕様（v2）が新パラメータで0件を返す環境では、旧形式（?mode=admin）で
 *   取得して商品IDで絞り込む（商品一覧と同じ互換方針）。
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

    const response = await fetch(
      `${GOOGLE_SHEETS_WEBHOOK_URL}?${params.toString()}`,
      { method: "GET" }
    );
    if (response.ok) {
      const data = (await response.json()) as AdminProductListResponse;
      if (data?.success === true && Array.isArray(data.products)) {
        // ページ分割モード（total_pages あり）または結果がある場合はそのまま絞り込む。
        if (typeof data.total_pages === "number" || data.products.length > 0) {
          return filterByProductId(data.products, q);
        }
      }
    }

    // 旧形式フォールバック（新パラメータで何も返らないときのみ）。
    const legacyResponse = await fetch(
      `${GOOGLE_SHEETS_WEBHOOK_URL}?mode=admin`,
      { method: "GET" }
    );
    if (!legacyResponse.ok) return [];
    const legacyData = (await legacyResponse.json()) as AdminProductListResponse;
    if (legacyData?.success !== true || !Array.isArray(legacyData.products)) {
      return [];
    }
    return filterByProductId(legacyData.products, q);
  } catch {
    return [];
  }
}