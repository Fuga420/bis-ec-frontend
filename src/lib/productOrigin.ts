import {
  PRODUCT_SORT_OPTIONS,
  type ProductSortKey,
} from "@/pages/products/lib/sort";
import type { StorageSortKey } from "@/pages/pokeka/lib/rawStorage";
import { CATEGORY_LABELS } from "@/pages/products/types";

/**
 * 商品詳細（/products/:id）を「どこから開いたか」を表す遷移元情報。
 *
 * 既存のルーティング（react-router）の state にこの情報を載せて遷移し、
 * 商品詳細ではパンくずと戻り先URLをこの情報から組み立てる。
 * 新しいAPIやDBは使わず、URLクエリ（/pokeka?tab=ungraded&scope=old&...）で
 * 一覧の状態を再現できるようにしているだけ。
 *
 * 遷移元が無い（直接アクセス・リロードで state が失われた）場合は null を返し、
 * 呼び出し側が従来の「すべての商品 > 商品詳細」にフォールバックする。
 */

/** ポケカページのメインタブ（グレードの有無） */
export type PokekaTabKey = "ungraded" | "graded";
export type StorageScopeKey = "all" | "old" | "current";
export type PriceFilterKey = "all" | "priced" | "unpriced";

export const POKEKA_TAB_LABELS: Record<PokekaTabKey, string> = {
  ungraded: "グレードなし",
  graded: "グレードあり",
};

export const STORAGE_SCOPE_LABELS: Record<StorageScopeKey, string> = {
  all: "すべて",
  old: "旧裏",
  current: "現行",
};

const POKEKA_TABS: PokekaTabKey[] = ["ungraded", "graded"];
const STORAGE_SCOPE_KEYS: StorageScopeKey[] = ["all", "old", "current"];
const PRICE_FILTER_KEYS: PriceFilterKey[] = ["all", "priced", "unpriced"];

/** 商品詳細をポケカページから開いたときの遷移元 */
export interface ProductOrigin {
  source: "pokeka";
  /** 上段タブ（ストレージ / VSS / PSA / その他鑑定） */
  tab: PokekaTabKey;
  /** ストレージの区分（旧裏 / 現行 / すべて） */
  scope: StorageScopeKey;
  /** カード名・商品ID検索 */
  search: string;
  /** 箱番フィルター */
  box: string;
  /** 作家フィルター */
  author: string;
  /** 参考価格フィルター */
  price: PriceFilterKey;
  /** 並び順 */
  sort: StorageSortKey;
  /** ページ番号（1始まり） */
  page: number;
}

/** /sneakers がURLから復元する一覧の状態 */
export interface SneakersQueryState {
  /** 商品名・商品ID・ブランドの検索語 */
  search: string;
  /** 公開状態（空＝すべて） */
  publishStatus: string;
  /** 在庫状態（空＝すべて） */
  inventoryStatus: string;
  /** 並び順キー */
  sort: ProductSortKey;
  /** ページ番号（1始まり） */
  page: number;
}

const SNEAKERS_SORT_KEYS: string[] = PRODUCT_SORT_OPTIONS.map(
  (option) => option.value
);

/** 商品詳細をスニーカーページから開いたときの遷移元 */
export interface SneakersProductOrigin {
  source: "sneakers";
  search: string;
  publishStatus: string;
  inventoryStatus: string;
  sort: ProductSortKey;
  page: number;
}

/** /chrome-hearts がURLから復元する一覧の状態 */
export interface ChromeHeartsQueryState {
  /** 商品名・商品ID・ブランドの検索語 */
  search: string;
  /** 商品種別（既存カテゴリ値。空＝すべて） */
  category: string;
  /** 公開状態（空＝すべて） */
  publishStatus: string;
  /** 在庫状態（空＝すべて） */
  inventoryStatus: string;
  /** 並び順キー */
  sort: ProductSortKey;
  /** ページ番号（1始まり） */
  page: number;
}

/** 商品詳細をChrome Heartsページから開いたときの遷移元 */
export interface ChromeHeartsProductOrigin {
  source: "chrome-hearts";
  search: string;
  category: string;
  publishStatus: string;
  inventoryStatus: string;
  sort: ProductSortKey;
  page: number;
}

/** /apparel がURLから復元する一覧の状態 */
export interface ApparelQueryState {
  /** 商品名・商品ID・ブランドの検索語 */
  search: string;
  /** 公開状態（空＝すべて） */
  publishStatus: string;
  /** 在庫状態（空＝すべて） */
  inventoryStatus: string;
  /** 並び順キー */
  sort: ProductSortKey;
  /** ページ番号（1始まり） */
  page: number;
}

/** 商品詳細をApparelページから開いたときの遷移元 */
export interface ApparelProductOrigin {
  source: "apparel";
  search: string;
  publishStatus: string;
  inventoryStatus: string;
  sort: ProductSortKey;
  page: number;
}

/** 商品詳細を開いたときの遷移元（専用ページごとに形が異なる） */
export type AnyProductOrigin =
  | ProductOrigin
  | SneakersProductOrigin
  | ChromeHeartsProductOrigin
  | ApparelProductOrigin;

/** /pokeka がURLから復元する一覧の状態 */
export interface PokekaQueryState {
  tab: PokekaTabKey;
  scope: StorageScopeKey;
  search: string;
  box: string;
  author: string;
  price: PriceFilterKey;
  sort: StorageSortKey;
  page: number;
}

/** パンくずの1階層（祖先階層は必ずリンク先を持つ） */
export interface ProductBreadcrumbItem {
  label: string;
  to: string;
}

export interface ProductOriginTrail {
  /** 現在地（商品詳細）を除く、親階層の並び */
  ancestors: ProductBreadcrumbItem[];
  /** パンくず最下位の親（＝一覧へ戻る先） */
  listPath: string;
  /** サイドナビで選択中として扱うパス */
  navActiveTo: string;
}

const STORAGE_SORT_KEYS: string[] = [
  "position",
  "name",
  "price_desc",
  "price_asc",
  "created_desc",
  "created_asc",
];

const DEFAULT_QUERY_STATE: PokekaQueryState = {
  tab: "ungraded",
  scope: "old",
  search: "",
  box: "",
  author: "",
  price: "all",
  sort: "position",
  page: 1,
};

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toTab(value: unknown): PokekaTabKey {
  return typeof value === "string" &&
    (POKEKA_TABS as string[]).includes(value)
    ? (value as PokekaTabKey)
    : DEFAULT_QUERY_STATE.tab;
}

function toScope(value: unknown): StorageScopeKey {
  return typeof value === "string" &&
    (STORAGE_SCOPE_KEYS as string[]).includes(value)
    ? (value as StorageScopeKey)
    : DEFAULT_QUERY_STATE.scope;
}

function toPrice(value: unknown): PriceFilterKey {
  return typeof value === "string" &&
    (PRICE_FILTER_KEYS as string[]).includes(value)
    ? (value as PriceFilterKey)
    : DEFAULT_QUERY_STATE.price;
}

function toStorageSort(value: unknown): StorageSortKey {
  return typeof value === "string" && STORAGE_SORT_KEYS.includes(value)
    ? (value as StorageSortKey)
    : "position";
}

function toSort(value: unknown): ProductSortKey {
  return typeof value === "string" &&
    SNEAKERS_SORT_KEYS.includes(value)
    ? (value as ProductSortKey)
    : "default";
}

/** 既存のカテゴリ値だけを受け付ける（存在しない種別を作らない）
 *  URL 由来の値なので、プロトタイプ上のキー（constructor 等）は受け付けない。
 */
function toCategory(value: unknown): string {
  if (typeof value !== "string") return "";
  return Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, value)
    ? value
    : "";
}

function toPage(value: unknown): number {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;
  if (!Number.isFinite(num) || num < 1) return 1;
  return Math.floor(num);
}

/** 現在の一覧の状態から、商品詳細へ渡す遷移元情報を作る */
export function buildPokekaOrigin(state: PokekaQueryState): ProductOrigin {
  return {
    source: "pokeka",
    tab: state.tab,
    scope: state.scope,
    search: state.search,
    box: state.box,
    author: state.author,
    price: state.price,
    sort: state.sort,
    page: state.page,
  };
}

/** 現在の一覧の状態から、商品詳細へ渡す遷移元情報を作る（Sneakers） */
export function buildSneakersOrigin(
  state: SneakersQueryState
): SneakersProductOrigin {
  return {
    source: "sneakers",
    search: state.search,
    publishStatus: state.publishStatus,
    inventoryStatus: state.inventoryStatus,
    sort: state.sort,
    page: state.page,
  };
}

/** 現在の一覧の状態から、商品詳細へ渡す遷移元情報を作る（Chrome Hearts） */
export function buildChromeHeartsOrigin(
  state: ChromeHeartsQueryState
): ChromeHeartsProductOrigin {
  return {
    source: "chrome-hearts",
    search: state.search,
    category: state.category,
    publishStatus: state.publishStatus,
    inventoryStatus: state.inventoryStatus,
    sort: state.sort,
    page: state.page,
  };
}

/** 現在の一覧の状態から、商品詳細へ渡す遷移元情報を作る（Apparel） */
export function buildApparelOrigin(
  state: ApparelQueryState
): ApparelProductOrigin {
  return {
    source: "apparel",
    search: state.search,
    publishStatus: state.publishStatus,
    inventoryStatus: state.inventoryStatus,
    sort: state.sort,
    page: state.page,
  };
}

/** 遷移時に載せる state（キー名を1か所に閉じ込める） */
export function buildProductDetailLinkState(
  origin: AnyProductOrigin
): { productOrigin: AnyProductOrigin } {
  return { productOrigin: origin };
}

/**
 * ルーターの state から遷移元を取り出す。
 * 形が想定と違う場合は null（＝遷移元不明）として扱い、推測はしない。
 */
export function readProductOrigin(state: unknown): AnyProductOrigin | null {
  if (!state || typeof state !== "object") return null;
  const raw = (state as { productOrigin?: unknown }).productOrigin;
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;

  // スニーカーページから開いた場合は、検索・絞り込み・並び順・ページだけを復元する。
  if (src.source === "sneakers") {
    return {
      source: "sneakers",
      search: toText(src.search),
      publishStatus: toText(src.publishStatus),
      inventoryStatus: toText(src.inventoryStatus),
      sort: toSort(src.sort),
      page: toPage(src.page),
    };
  }

  // Apparelページから開いた場合も、一覧の状態だけを復元する。
  if (src.source === "apparel") {
    return {
      source: "apparel",
      search: toText(src.search),
      publishStatus: toText(src.publishStatus),
      inventoryStatus: toText(src.inventoryStatus),
      sort: toSort(src.sort),
      page: toPage(src.page),
    };
  }

  // Chrome Heartsページから開いた場合も、一覧の状態だけを復元する。
  if (src.source === "chrome-hearts") {
    return {
      source: "chrome-hearts",
      search: toText(src.search),
      category: toCategory(src.category),
      publishStatus: toText(src.publishStatus),
      inventoryStatus: toText(src.inventoryStatus),
      sort: toSort(src.sort),
      page: toPage(src.page),
    };
  }

  if (src.source !== "pokeka") return null;

  return {
    source: "pokeka",
    tab: toTab(src.tab),
    scope: toScope(src.scope),
    search: toText(src.search),
    box: toText(src.box),
    author: toText(src.author),
    price: toPrice(src.price),
    sort: toStorageSort(src.sort),
    page: toPage(src.page),
  };
}

/** /pokeka のURLクエリ文字列を組み立てる（既定値は省略する） */
export function buildPokekaQueryString(state: PokekaQueryState): string {
  const params = new URLSearchParams();
  params.set("tab", state.tab);
  if (state.tab === "ungraded") {
    params.set("scope", state.scope);
    if (state.search.trim()) params.set("q", state.search.trim());
    if (state.box.trim()) params.set("box", state.box.trim());
    if (state.author.trim()) params.set("author", state.author.trim());
    if (state.price !== "all") params.set("price", state.price);
    if (state.sort !== "position") params.set("sort", state.sort);
    if (state.page > 1) params.set("page", String(state.page));
  }
  return params.toString();
}

/** /pokeka のURLクエリを読み取る（不正な値は既定値に落とす） */
export function readPokekaQuery(
  searchParams: URLSearchParams
): PokekaQueryState {
  return {
    tab: toTab(searchParams.get("tab") ?? undefined),
    scope: toScope(searchParams.get("scope") ?? undefined),
    search: toText(searchParams.get("q") ?? undefined),
    box: toText(searchParams.get("box") ?? undefined),
    author: toText(searchParams.get("author") ?? undefined),
    price: toPrice(searchParams.get("price") ?? undefined),
    sort: toStorageSort(searchParams.get("sort") ?? undefined),
    page: toPage(searchParams.get("page") ?? undefined),
  };
}

/** /sneakers のURLクエリ文字列を組み立てる（既定値は省略する） */
export function buildSneakersQueryString(state: SneakersQueryState): string {
  const params = new URLSearchParams();
  if (state.search.trim()) params.set("q", state.search.trim());
  if (state.publishStatus) params.set("publish", state.publishStatus);
  if (state.inventoryStatus) params.set("inventory", state.inventoryStatus);
  if (state.sort !== "default") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));
  return params.toString();
}

/** /sneakers のURLクエリを読み取る（不正な値は既定値に落とす） */
export function readSneakersQuery(
  searchParams: URLSearchParams
): SneakersQueryState {
  return {
    search: toText(searchParams.get("q") ?? undefined),
    publishStatus: toText(searchParams.get("publish") ?? undefined),
    inventoryStatus: toText(searchParams.get("inventory") ?? undefined),
    sort: toSort(searchParams.get("sort") ?? undefined),
    page: toPage(searchParams.get("page") ?? undefined),
  };
}

/** /chrome-hearts のURLクエリ文字列を組み立てる（既定値は省略する） */
export function buildChromeHeartsQueryString(
  state: ChromeHeartsQueryState
): string {
  const params = new URLSearchParams();
  if (state.search.trim()) params.set("q", state.search.trim());
  if (state.category) params.set("type", state.category);
  if (state.publishStatus) params.set("publish", state.publishStatus);
  if (state.inventoryStatus) params.set("inventory", state.inventoryStatus);
  if (state.sort !== "default") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));
  return params.toString();
}

/** /chrome-hearts のURLクエリを読み取る（不正な値は既定値に落とす） */
export function readChromeHeartsQuery(
  searchParams: URLSearchParams
): ChromeHeartsQueryState {
  return {
    search: toText(searchParams.get("q") ?? undefined),
    category: toCategory(searchParams.get("type") ?? undefined),
    publishStatus: toText(searchParams.get("publish") ?? undefined),
    inventoryStatus: toText(searchParams.get("inventory") ?? undefined),
    sort: toSort(searchParams.get("sort") ?? undefined),
    page: toPage(searchParams.get("page") ?? undefined),
  };
}

/** Chrome Heartsの一覧へ戻るためのURL（検索条件・ページ番号を含む） */
export function buildChromeHeartsReturnPath(
  origin: ChromeHeartsProductOrigin
): string {
  const query = buildChromeHeartsQueryString({
    search: origin.search,
    category: origin.category,
    publishStatus: origin.publishStatus,
    inventoryStatus: origin.inventoryStatus,
    sort: origin.sort,
    page: origin.page,
  });
  return query ? `/chrome-hearts?${query}` : "/chrome-hearts";
}

/** /apparel のURLクエリ文字列を組み立てる（既定値は省略する） */
export function buildApparelQueryString(state: ApparelQueryState): string {
  const params = new URLSearchParams();
  if (state.search.trim()) params.set("q", state.search.trim());
  if (state.publishStatus) params.set("publish", state.publishStatus);
  if (state.inventoryStatus) params.set("inventory", state.inventoryStatus);
  if (state.sort !== "default") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));
  return params.toString();
}

/** /apparel のURLクエリを読み取る（不正な値は既定値に落とす） */
export function readApparelQuery(
  searchParams: URLSearchParams
): ApparelQueryState {
  return {
    search: toText(searchParams.get("q") ?? undefined),
    publishStatus: toText(searchParams.get("publish") ?? undefined),
    inventoryStatus: toText(searchParams.get("inventory") ?? undefined),
    sort: toSort(searchParams.get("sort") ?? undefined),
    page: toPage(searchParams.get("page") ?? undefined),
  };
}

/** Apparelの一覧へ戻るためのURL（検索条件・ページ番号を含む） */
export function buildApparelReturnPath(
  origin: ApparelProductOrigin
): string {
  const query = buildApparelQueryString({
    search: origin.search,
    publishStatus: origin.publishStatus,
    inventoryStatus: origin.inventoryStatus,
    sort: origin.sort,
    page: origin.page,
  });
  return query ? `/apparel?${query}` : "/apparel";
}

/** スニーカーの一覧へ戻るためのURL（検索条件・ページ番号を含む） */
export function buildSneakersReturnPath(
  origin: SneakersProductOrigin
): string {
  const query = buildSneakersQueryString({
    search: origin.search,
    publishStatus: origin.publishStatus,
    inventoryStatus: origin.inventoryStatus,
    sort: origin.sort,
    page: origin.page,
  });
  return query ? `/sneakers?${query}` : "/sneakers";
}

/** 遷移元の一覧へ戻るためのURL（検索条件・ページ番号を含む） */
export function buildPokekaReturnPath(origin: ProductOrigin): string {
  const query = buildPokekaQueryString({
    tab: origin.tab,
    scope: origin.scope,
    search: origin.search,
    box: origin.box,
    author: origin.author,
    price: origin.price,
    sort: origin.sort,
    page: origin.page,
  });
  return query ? `/pokeka?${query}` : "/pokeka";
}

/**
 * パンくずとサイドナビの選択状態を、遷移元から組み立てる。
 * 遷移元が無い場合は null（呼び出し側で既存の表示にフォールバックする）。
 */
export function buildProductOriginTrail(
  origin: AnyProductOrigin | null
): ProductOriginTrail | null {
  if (!origin) return null;

  // Chrome Heartsも専用ページ1階層のみ（種別は絞り込みとして戻り先URLに含める）。
  if (origin.source === "chrome-hearts") {
    const listPath = buildChromeHeartsReturnPath(origin);
    return {
      ancestors: [{ label: "Chrome Hearts", to: listPath }],
      listPath,
      navActiveTo: "/chrome-hearts",
    };
  }

  // Apparelも専用ページ1階層のみ（種別はページ自体で固定のため持たない）。
  if (origin.source === "apparel") {
    const listPath = buildApparelReturnPath(origin);
    return {
      ancestors: [{ label: "Apparel", to: listPath }],
      listPath,
      navActiveTo: "/apparel",
    };
  }

  // スニーカーは専用ページ1階層のみ（タブ・区分は持たない）。
  // 戻り先には検索・絞り込み・ページ番号を含め、一覧の表示を再現する。
  if (origin.source === "sneakers") {
    const listPath = buildSneakersReturnPath(origin);
    return {
      ancestors: [{ label: "Sneakers", to: listPath }],
      listPath,
      navActiveTo: "/sneakers",
    };
  }

  const ancestors: ProductBreadcrumbItem[] = [
    { label: "Pokémon Card", to: "/pokeka" },
  ];

  if (origin.tab === "ungraded") {
    // グレードなしは「タブ > 区分 > 一覧」の3階層。
    // 区分のリンクにだけ絞り込み条件・ページ番号を載せ、戻ったときの一覧を再現する。
    ancestors.push({
      label: POKEKA_TAB_LABELS[origin.tab],
      to: `/pokeka?${buildPokekaQueryString({
        ...DEFAULT_QUERY_STATE,
        tab: "ungraded",
        scope: origin.scope,
      })}`,
    });
    ancestors.push({
      label: STORAGE_SCOPE_LABELS[origin.scope],
      to: buildPokekaReturnPath(origin),
    });
  } else {
    ancestors.push({
      label: POKEKA_TAB_LABELS[origin.tab],
      to: `/pokeka?tab=${origin.tab}`,
    });
  }

  return {
    ancestors,
    listPath: buildPokekaReturnPath(origin),
    navActiveTo: "/pokeka",
  };
}