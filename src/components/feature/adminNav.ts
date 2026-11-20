/**
 * 管理画面の共通ナビゲーション定義。
 *
 * 構造はサイトマップに合わせて2つのまとまり＋最下部の設定で持つ。
 * - 共通（menu）: ホーム / 商品 / 仕入・書類
 * - カテゴリ（category）: Pokémon Card / Sneakers / Chrome Hearts / Apparel
 * - 最下部: 作業状況カード・環境/設定カード（設定はこの中に置く）
 *
 * 各項目は単純なページリンクで、行内に別の操作は置かない。
 * - to がある項目だけ実際の画面へ遷移する。
 * - to が無い項目は「準備中」として、存在しない画面へは移動できないようにする。
 *
 * 件数・バッジは「どこから数えるか」だけを定義し、実際の取得は
 * useSidebarCounts（既存の集計処理の再利用）に任せる。固定値は埋め込まない。
 */

/** 件数の取得元（useSidebarCounts の値と対応する） */
export type AdminNavCountKey =
  | "products"
  | "pokemon_card"
  | "sneaker"
  | "chrome_hearts"
  | "apparel";

/** 要対応バッジの取得元 */
export type AdminNavBadgeKey = "documents_pending";

/** 選択中の親項目の下に展開するサブ項目 */
export interface AdminNavSubItem {
  label: string;
  to: string;
  /** 行の右端に出す件数の取得元 */
  countKey?: AdminNavCountKey;
  /**
   * /pokeka のURLクエリでの選択判定。
   * 指定しない条件は「不問」として扱う。
   */
  match?: {
    tab?: string;
    scope?: string;
  };
}

export interface AdminNavItem {
  /** 表示名 */
  label: string;
  /** 遷移先。未実装の項目は指定しない */
  to?: string;
  /** 補助的に選択中とみなすパス（例: 商品追加フロー） */
  alsoActiveFor?: string[];
  /** 行の左に出す線アイコン（Remix Icon のクラス名。16px・モノクロ） */
  icon?: string;
  /** 行の右端に常時表示する件数の取得元 */
  countKey?: AdminNavCountKey;
  /** 件数とは別に付ける要対応バッジの取得元 */
  badgeKey?: AdminNavBadgeKey;
  /** 選択中にだけ展開するサブ項目 */
  subItems?: AdminNavSubItem[];
}

/** 共通の項目（上から順に表示する） */
export const ADMIN_NAV_PRIMARY: AdminNavItem[] = [
  { label: "ホーム", to: "/home", icon: "ri-home-line" },
  {
    label: "商品",
    to: "/products",
    icon: "ri-box-3-line",
    countKey: "products",
    // 商品の追加（登録・画像取込）も商品マスター配下の作業なので同じ項目を選択中にする
    alsoActiveFor: ["/register", "/import"],
  },
  {
    label: "仕入・書類",
    to: "/documents",
    icon: "ri-file-text-line",
    badgeKey: "documents_pending",
  },
];

/**
 * カテゴリ別の入口（独立したまとまり）。
 * Chrome Hearts はブランド、Apparel は商品種別（カテゴリ）で対象を絞る別々の入口。
 */
export const ADMIN_NAV_CATEGORIES: AdminNavItem[] = [
  {
    label: "Pokémon Card",
    to: "/pokeka",
    icon: "ri-stack-line",
    countKey: "pokemon_card",
    // グレードの有無・ストレージ区分は、この項目を選択中にしたままサブ項目で切り替える
    subItems: [
      {
        label: "すべて",
        // /pokeka の既定は「旧裏」のため、全件を見る場合は scope=all を明示する
        to: "/pokeka?tab=ungraded&scope=all",
        countKey: "pokemon_card",
        match: { tab: "ungraded", scope: "all" },
      },
      {
        label: "旧裏ストレージ",
        to: "/pokeka?tab=ungraded&scope=old",
        match: { tab: "ungraded", scope: "old" },
      },
      {
        label: "グレード未判定",
        to: "/pokeka?tab=graded",
        match: { tab: "graded" },
      },
    ],
  },
  {
    label: "Sneakers",
    to: "/sneakers",
    icon: "ri-footprint-line",
    countKey: "sneaker",
  },
  {
    label: "Chrome Hearts",
    to: "/chrome-hearts",
    icon: "ri-cross-line",
    countKey: "chrome_hearts",
  },
  {
    label: "Apparel",
    to: "/apparel",
    icon: "ri-t-shirt-line",
    countKey: "apparel",
  },
];

/**
 * 最下部カード「環境・設定」に置く設定への入口。
 * ログアウトは現行どおりトップバー右端のまま。
 */
export const ADMIN_NAV_SETTINGS: AdminNavItem = {
  label: "設定",
  to: "/settings",
  icon: "ri-settings-3-line",
};

/**
 * 現在のパスがそのナビ項目を選択中かどうか。
 * 前方一致（/products/:id や /documents/:id も親項目を選択中にする）。
 *
 * overrideTo（遷移元のカテゴリ）が指定された場合は、その項目だけを選択中にする。
 * 商品のカテゴリから推測せず、詳細画面を開いた実際の入口を優先するため。
 */
export function isAdminNavItemActive(
  item: AdminNavItem,
  pathname: string,
  overrideTo?: string
): boolean {
  if (!item.to) return false;
  if (overrideTo) return item.to === overrideTo;
  if (pathname === item.to) return true;
  if (pathname.startsWith(`${item.to}/`)) return true;
  return (item.alsoActiveFor ?? []).some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

/**
 * サブ項目が現在の表示と一致するか（/pokeka のURLクエリで判定する）。
 * /pokeka の既定は tab=ungraded / scope=old のため、未指定はその既定として扱う。
 */
export function isAdminNavSubItemActive(
  subItem: AdminNavSubItem,
  pathname: string,
  searchParams: URLSearchParams
): boolean {
  if (pathname !== "/pokeka") return false;
  const tab = searchParams.get("tab") ?? "ungraded";
  const scope = searchParams.get("scope") ?? "old";
  if (subItem.match?.tab && subItem.match.tab !== tab) return false;
  if (subItem.match?.scope && subItem.match.scope !== scope) return false;
  return true;
}