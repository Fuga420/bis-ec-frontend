import { fetchProductsReadApi } from "@/config/productsApi";
import { APPAREL_CATEGORY } from "@/pages/apparel/lib/apparel";
import { CHROME_HEARTS_BRAND_SEARCH_TERM } from "@/pages/chrome-hearts/lib/chromeHearts";
import { POKECA_RAW_STORAGE_PREFIX } from "@/pages/products/lib/pokecaRawStorage";
import type {
  AdminProduct,
  AdminProductListResponse,
} from "@/pages/products/types";

/**
 * ホームの集計用データ取得。
 *
 * 新しい集計APIは作らず、既存の商品一覧API（`mode=admin` のページ分割モード）を
 * `page_size=1` で呼び、応答の `count` だけを読む。
 * 条件は各カテゴリページの一覧と同じパラメータで組み立て、
 * ホームの件数と一覧ページの「全 N 件」が一致するようにしている。
 */

export interface HomeListFilter {
  /** 検索語（既存APIの商品名・商品ID・ブランドの部分一致） */
  search?: string;
  /** 既存のカテゴリ値（sneaker / pokemon_card / apparel など） */
  category?: string;
  publishStatus?: string;
  inventoryStatus?: string;
  /**
   * 旧裏ストレージ商品を集計から外すか。
   * 商品一覧（/products）と同じ集計にする場合だけ true にする。
   */
  excludeRawStorage?: boolean;
}

export interface HomeCountResult {
  count: number;
  /** 除外条件で非表示にした件数（未対応の応答では 0） */
  excluded: number;
}

const RECENT_PRODUCT_LIMIT = 5;

// 一覧APIの取得条件を1か所で組み立てる。
function buildListParams(
  isTestMode: boolean,
  filter: HomeListFilter,
  pageSize: number,
  sort: string
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("mode", "admin");
  params.set("page", "1");
  params.set("page_size", String(pageSize));
  params.set("search", (filter.search ?? "").trim());
  params.set("category", filter.category ?? "all");
  params.set("publish_status", filter.publishStatus ?? "all");
  params.set("inventory_status", filter.inventoryStatus ?? "all");
  params.set("record_status", "active");
  params.set("is_test", isTestMode ? "true" : "false");
  params.set("sort", sort);
  if (filter.excludeRawStorage === true) {
    params.set("exclude_storage_location_prefix", POKECA_RAW_STORAGE_PREFIX);
  }
  return params;
}

async function fetchListResponse(
  isTestMode: boolean,
  filter: HomeListFilter,
  pageSize: number,
  sort: string
): Promise<AdminProductListResponse> {
  const response = await fetchProductsReadApi(
    buildListParams(isTestMode, filter, pageSize, sort).toString()
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = (await response.json()) as AdminProductListResponse;
  if (!data || data.success !== true) {
    throw new Error("Invalid response");
  }
  return data;
}

/** 条件に一致する商品の件数だけを取得する（1件分の応答しか受け取らない）。 */
export async function fetchHomeCount(
  isTestMode: boolean,
  filter: HomeListFilter
): Promise<HomeCountResult> {
  const data = await fetchListResponse(isTestMode, filter, 1, "default");
  const count =
    typeof data.count === "number" ? data.count : data.products?.length ?? 0;
  return { count, excluded: Math.max(0, data.excluded_count ?? 0) };
}

export type HomeRecentLoadState = "success" | "unsupported" | "error";

export interface HomeRecentResult {
  state: HomeRecentLoadState;
  products: AdminProduct[];
}

/**
 * 最近登録された商品（登録日時：新しい順の先頭5件）。
 *
 * 一覧APIは絞り込み後の全件をサーバー側で並び替えてからページを切り出すため、
 * 先頭ページの5件は全体の登録日時順の先頭になる。
 * ただし応答が並び順を保証していない場合は、一部から選んだ5件を
 * 「最近の商品」として見せないよう unsupported を返す（画面側でセクションを出さない）。
 */
export async function fetchRecentProducts(
  isTestMode: boolean
): Promise<HomeRecentResult> {
  const data = await fetchListResponse(
    isTestMode,
    { excludeRawStorage: true },
    RECENT_PRODUCT_LIMIT,
    "created_desc"
  );

  // 応答が並び順を返している場合は、要求した並び順と一致することを確認する。
  if (typeof data.sort === "string" && data.sort !== "created_desc") {
    return { state: "unsupported", products: [] };
  }

  const list = data.products ?? [];
  // 実際に新しい順で並んでいるか（登録日時が読めること）も確認する。
  let previous = Number.POSITIVE_INFINITY;
  for (const product of list) {
    const time = new Date(product.created_at ?? "").getTime();
    if (Number.isNaN(time) || time > previous) {
      return { state: "unsupported", products: [] };
    }
    previous = time;
  }

  return { state: "success", products: list };
}

export interface HomeCategoryDefinition {
  key: string;
  label: string;
  to: string;
  filter: HomeListFilter;
}

/**
 * カテゴリ別商品の表示対象。
 * 判定条件は各カテゴリページの実装と同じ値・同じパラメータを使う
 * （Chrome Hearts はブランド検索、Apparel は既存カテゴリ値 apparel）。
 */
export const HOME_CATEGORIES: HomeCategoryDefinition[] = [
  {
    key: "pokemon_card",
    label: "Pokémon Card",
    to: "/pokeca",
    filter: { category: "pokemon_card" },
  },
  {
    key: "sneaker",
    label: "Sneakers",
    to: "/sneakers",
    filter: { category: "sneaker" },
  },
  {
    key: "chrome_hearts",
    label: "Chrome Hearts",
    to: "/chrome-hearts",
    filter: { search: CHROME_HEARTS_BRAND_SEARCH_TERM },
  },
  {
    key: "apparel",
    label: "Apparel",
    to: "/apparel",
    filter: { category: APPAREL_CATEGORY },
  },
];

export interface HomeAttentionDefinition {
  key: string;
  label: string;
  filter: HomeListFilter;
}

/**
 * 要確認項目。
 * 既存の在庫状態（in_stock / sold）で絞り込める件数だけを扱い、
 * 商品一覧と同じ集計範囲（旧裏ストレージを除く）で数える。
 * 販売価格未設定のように既存APIで絞り込めない項目は表示しない。
 */
export const HOME_ATTENTION_METRICS: HomeAttentionDefinition[] = [
  {
    key: "in_stock",
    label: "在庫あり",
    filter: { inventoryStatus: "in_stock", excludeRawStorage: true },
  },
  {
    key: "sold",
    label: "売却済み",
    filter: { inventoryStatus: "sold", excludeRawStorage: true },
  },
];

/** 一覧と同じ形式（2026/11/17 10:32）で登録日時を表示する。 */
export function formatHomeDateTime(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 件数の3桁区切り表示。 */
export function formatHomeCount(value: number): string {
  return value.toLocaleString("ja-JP");
}