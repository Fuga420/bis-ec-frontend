/**
 * Chrome Hearts 商品の判定条件。
 *
 * 既存の商品マスターには「Chrome Hearts 専用のカテゴリ値」が存在しない
 * （カテゴリは sneaker / jewelry / pokemon_card / apparel / fashion_goods / other のみ）。
 * ブランド名は `brand` 列で別管理されており、既存の商品一覧APIの検索
 * （`search` = 商品名・商品ID・ブランドの部分一致）がブランド名でも一致する。
 *
 * そのため対象商品は「ブランド名が Chrome Hearts の商品」として、
 * 既存APIの検索パラメータだけで絞り込む（新しいカテゴリ・新しいAPIは作らない）。
 * 商品名からブランドを推測したり、カテゴリ値から Chrome Hearts を推測したりはしない。
 */
export const CHROME_HEARTS_BRAND = "Chrome Hearts";

/** Chrome Hearts の一覧で使う固定の検索語（既存APIの brand 部分一致に委ねる） */
export const CHROME_HEARTS_BRAND_SEARCH_TERM = CHROME_HEARTS_BRAND;

/** 一覧の1ページあたり件数（商品一覧・Sneakers と同じ密度に揃える） */
export const CHROME_HEARTS_LIST_PAGE_SIZE = 50;

/** 連続入力による通信を防ぐ検索のデバウンス時間 */
export const CHROME_HEARTS_SEARCH_DEBOUNCE_MS = 400;