/**
 * 管理画面の共通ナビゲーション定義。
 *
 * 「共通」と「カテゴリ」の2グループだけを持ち、画面が増えてもヘッダー右側に
 * ボタンを増やさずに済む構造にする。
 *
 * - to がある項目だけ実際の画面へ遷移する。
 * - to が無い項目は「準備中」として、存在しない画面へは移動できないようにする
 *   （新しい画面・ダミーデータは作らない）。
 */
export interface AdminNavItem {
  /** 表示名 */
  label: string;
  /** 遷移先。未実装の項目は指定しない */
  to?: string;
  /** 補助的に選択中とみなすパス（例: 商品追加フロー） */
  alsoActiveFor?: string[];
}

export interface AdminNavGroup {
  id: string;
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "common",
    label: "共通",
    items: [
      {
        label: "すべての商品",
        to: "/products",
        // 商品の追加（登録・画像取込）も商品マスター配下の作業なので同じ項目を選択中にする
        alsoActiveFor: ["/register", "/import"],
      },
      { label: "仕入書類", to: "/documents" },
    ],
  },
  {
    id: "category",
    label: "カテゴリ",
    items: [
      { label: "ポケモンカード", to: "/pokeka" },
      { label: "スニーカー" },
      { label: "クロムハーツ" },
      { label: "アパレル" },
    ],
  },
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