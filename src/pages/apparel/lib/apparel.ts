/**
 * Apparel 商品の判定条件。
 *
 * 既存の商品マスターには「商品種別（category）」が既にあり、
 * アパレルは既存のカテゴリ値 `apparel`（表示名「アパレル」）として保存されている。
 * 新しいカテゴリ・判定フィールド・ブランドマスターは作らず、
 * 既存の商品一覧APIの `category` パラメータに `apparel` を固定で渡して絞り込む。
 *
 * Chrome Hearts は「ブランド名」で判定する別の入口であり、
 * カテゴリ（商品ジャンル）とは別の軸。既存データ上は Chrome Hearts の商品が
 * category=apparel を持つこともあり得るが、その関係は変更しない
 * （Apparel から Chrome Hearts を除外したり、Chrome Hearts を Apparel へ足したりしない）。
 */
export const APPAREL_CATEGORY = "apparel";

/** 一覧の1ページあたり件数（商品一覧・Sneakers・Chrome Hearts と同じ密度に揃える） */
export const APPAREL_LIST_PAGE_SIZE = 50;

/** 連続入力による通信を防ぐ検索のデバウンス時間 */
export const APPAREL_SEARCH_DEBOUNCE_MS = 400;