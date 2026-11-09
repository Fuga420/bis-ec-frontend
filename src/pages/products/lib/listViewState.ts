import type { ProductFilterValue } from "@/pages/products/components/ProductFilterBar";
import {
  PRODUCT_SORT_OPTIONS,
  type ProductSortKey,
} from "@/pages/products/lib/sort";

// 商品一覧（/products）の表示状態を、詳細・編集画面から戻ってきたときだけ復元するための
// 最小限の保存機構。新しいライブラリは追加せず sessionStorage（タブを閉じると消える）だけを使う。
//
// 復元の条件:
// - 一覧から商品詳細へ遷移した直前にだけ「戻ってくる予定」フラグを立てる
// - 一覧がマウントされたときにそのフラグがあり、保存内容が同じタブ（通常／アーカイブ）なら復元する
// - フラグは復元判定後に消す。そのため一覧を新規に開いた場合や再読み込み時は復元されない

const VIEW_STATE_KEY = "products.list.view-state.v1";
const RETURN_FLAG_KEY = "products.list.return-flag.v1";

// フラグの有効期限（長時間放置した古いフラグで意図しない復元をしないための安全策）
const RETURN_FLAG_TTL_MS = 60 * 60 * 1000;

export interface ProductListViewState {
  filter: ProductFilterValue;
  sortKey: ProductSortKey;
  page: number;
  scrollY: number;
  archived: boolean;
}

interface ReturnFlag {
  archived: boolean;
  at: number;
}

const SORT_KEYS: ProductSortKey[] = PRODUCT_SORT_OPTIONS.map(
  (option) => option.value
);

function getStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    // プライベートモード等で使えない場合は復元しない（一覧表示自体は継続する）
    return null;
  }
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// 保存された値を検証して、一覧がそのまま使える形に整える
function normalizeState(raw: unknown): ProductListViewState | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<ProductListViewState> & {
    filter?: Partial<ProductFilterValue>;
  };
  if (typeof source.archived !== "boolean") return null;

  const filter = source.filter ?? {};
  const sortKey =
    typeof source.sortKey === "string" &&
    (SORT_KEYS as string[]).includes(source.sortKey)
      ? (source.sortKey as ProductSortKey)
      : "default";
  const page =
    typeof source.page === "number" && Number.isFinite(source.page)
      ? Math.max(1, Math.floor(source.page))
      : 1;
  const scrollY =
    typeof source.scrollY === "number" && Number.isFinite(source.scrollY)
      ? Math.max(0, source.scrollY)
      : 0;

  return {
    filter: {
      search: toText(filter.search),
      category: toText(filter.category),
      publishStatus: toText(filter.publishStatus),
      inventoryStatus: toText(filter.inventoryStatus),
    },
    sortKey,
    page,
    scrollY,
    archived: source.archived,
  };
}

// 一覧から詳細へ移動する直前に、その時点の表示状態を保存する
export function saveProductListViewState(state: ProductListViewState): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(VIEW_STATE_KEY, JSON.stringify(state));
  } catch {
    // 容量超過等で保存できなくても、一覧の動作には影響させない
  }
}

// 一覧へ戻ってくる予定であることを記録する（詳細へ遷移する直前にだけ呼ぶ）
export function markProductListReturnPending(archived: boolean): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const flag: ReturnFlag = { archived, at: Date.now() };
    storage.setItem(RETURN_FLAG_KEY, JSON.stringify(flag));
  } catch {
    // 記録できなくても一覧表示には影響させない
  }
}

// フラグを消費せずに読む（描画中に呼んでも安全。StrictModeの二重描画でも結果が変わらない）
export function peekProductListReturnPending(archived: boolean): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const raw = storage.getItem(RETURN_FLAG_KEY);
    if (!raw) return false;
    const flag = JSON.parse(raw) as Partial<ReturnFlag> | null;
    if (!flag || typeof flag.archived !== "boolean") return false;
    if (typeof flag.at === "number" && Date.now() - flag.at > RETURN_FLAG_TTL_MS) {
      return false;
    }
    return flag.archived === archived;
  } catch {
    return false;
  }
}

// 復元判定が終わったらフラグを消す（再読み込みや新規アクセスで復元しないようにする）
export function clearProductListReturnPending(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(RETURN_FLAG_KEY);
  } catch {
    // 消せなくても致命的ではない（次回のマウント時に再度復元を試みるだけ）
  }
}

// 保存済みの一覧状態を読み出す（同じタブ＝通常／アーカイブのときだけ返す）
export function readProductListViewState(
  archived: boolean
): ProductListViewState | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(VIEW_STATE_KEY);
    if (!raw) return null;
    const state = normalizeState(JSON.parse(raw) as unknown);
    if (!state || state.archived !== archived) return null;
    return state;
  } catch {
    return null;
  }
}