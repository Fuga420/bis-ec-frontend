import { CHROME_HEARTS_BRAND } from "@/pages/chrome-hearts/lib/chromeHearts";

/**
 * 「商品を追加」メニューから商品登録・取込画面へ入ったときの戻り先。
 *
 * 一覧の検索・絞り込み・ページ番号は既存どおりURLのクエリで表現されているため、
 * メニューを開いた時点の pathname + search をそのまま react-router の state で渡す。
 * 新しい仕組みやAPIは作らず、既存のURL復元の仕組みを再利用するだけ。
 *
 * 受け取った値は必ず許可した一覧パスに一致するかを検証し、
 * 想定外の値は「戻り先なし」として扱う（勝手な遷移先を作らない）。
 */
export interface AddProductReturn {
  /** 戻り先（一覧の状態を含むURL） */
  to: string;
  /** パンくずに出す一覧の表示名 */
  label: string;
}

/** 戻り先として受け付ける一覧パスと、その表示名 */
const RETURN_LABELS: Record<string, string> = {
  "/products": "すべての商品",
  "/pokeka": "Pokémon Card",
  "/sneakers": "Sneakers",
  "/chrome-hearts": CHROME_HEARTS_BRAND,
  "/apparel": "Apparel",
};

/** 末尾のスラッシュだけを取り除く（/products/ → /products） */
function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "") || "/";
  }
  return pathname;
}

function isReturnPath(pathname: string): boolean {
  return Object.prototype.hasOwnProperty.call(RETURN_LABELS, pathname);
}

/**
 * 現在の一覧画面から戻り先を作る。
 * 商品管理系の一覧以外（詳細・書類・設定など）では null を返す。
 */
export function buildAddProductReturn(
  pathname: string,
  search: string
): AddProductReturn | null {
  const path = normalizePathname(pathname);
  if (!isReturnPath(path)) return null;
  const query = search && search !== "?" ? search : "";
  return { to: `${path}${query}`, label: RETURN_LABELS[path] ?? "" };
}

/** 遷移時に載せる state の形（キー名を1か所に閉じ込める） */
export function buildAddProductReturnState(
  target: AddProductReturn | null
): { addProductReturn: AddProductReturn } | undefined {
  return target ? { addProductReturn: target } : undefined;
}

/**
 * ルーターの state から戻り先を取り出す。
 * 形が想定と違う場合・許可していないパスの場合は null（推測しない）。
 */
export function readAddProductReturn(state: unknown): AddProductReturn | null {
  if (!state || typeof state !== "object") return null;
  const raw = (state as { addProductReturn?: unknown }).addProductReturn;
  if (!raw || typeof raw !== "object") return null;
  const to = (raw as { to?: unknown }).to;
  if (typeof to !== "string" || !to.startsWith("/")) return null;

  // クエリを落として一覧パスだけを検証する
  const path = normalizePathname(to.split("?")[0] ?? "");
  if (!isReturnPath(path)) return null;

  return { to, label: RETURN_LABELS[path] ?? "" };
}