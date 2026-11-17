/**
 * 管理画面の共通ナビゲーション定義。
 *
 * 構造はサイトマップに合わせて3つのまとまりだけで持つ。
 * - 共通（common）: ホーム / 商品 / 仕入・書類
 * - カテゴリ（category）: Pokémon Card / Sneakers / Chrome Hearts / Apparel
 * - 最下部（footer）: 設定
 *
 * 親子メニュー（展開ボタン）は廃止し、各項目は単純なページリンクにした。
 * カテゴリが商品マスター配下のデータであることはデータ側の関係で保たれており、
 * サイドバーでは独立したまとまりとして表示するだけ。
 *
 * - to がある項目だけ実際の画面へ遷移する。
 * - to が無い項目は「準備中」として、存在しない画面へは移動できないようにする
 *   （新しい画面・推測したURLは作らない）。
 */

export interface AdminNavItem {
  /** 表示名 */
  label: string;
  /** 遷移先。未実装の項目は指定しない */
  to?: string;
  /** 補助的に選択中とみなすパス（例: 商品追加フロー） */
  alsoActiveFor?: string[];
}

/** 共通の項目（上から順に表示する） */
export const ADMIN_NAV_PRIMARY: AdminNavItem[] = [
  { label: "ホーム", to: "/home" },
  {
    label: "商品",
    to: "/products",
    // 商品の追加（登録・画像取込）も商品マスター配下の作業なので同じ項目を選択中にする
    alsoActiveFor: ["/register", "/import"],
  },
  { label: "仕入・書類", to: "/documents" },
];

/**
 * カテゴリ別の入口（独立したまとまり）。
 * Chrome Hearts はブランド、Apparel は商品種別（カテゴリ）で対象を絞る別々の入口。
 */
export const ADMIN_NAV_CATEGORIES: AdminNavItem[] = [
  { label: "Pokémon Card", to: "/pokeka" },
  { label: "Sneakers", to: "/sneakers" },
  { label: "Chrome Hearts", to: "/chrome-hearts" },
  { label: "Apparel", to: "/apparel" },
];

/**
 * サイドバー最下部に固定表示する項目。
 * 設定は /settings（環境切り替え）へ集約している。
 */
export const ADMIN_NAV_FOOTER: AdminNavItem[] = [
  { label: "設定", to: "/settings" },
];

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