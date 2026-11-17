// Chrome Hearts一覧の列幅。列見出しとデータ行で必ず同じ値を使う。
// 狭い画面では列自体を落とし、ページ全体の横スクロールを発生させない。
export const CHROME_HEARTS_COL = {
  // 商品画像（40px 角）
  image: "w-10 shrink-0",
  // 商品種別（既存カテゴリの表示名）
  type: "w-24 shrink-0",
  // 仕入価格（既存一覧APIの purchase_price = 商品マスタの手入力値）
  // 販売価格と同じ文字サイズ・右揃えで、比較しやすい幅に揃える。
  purchase: "w-24 shrink-0",
  // 公開状態（デスクトップのみ）
  publish: "w-16 shrink-0",
  // 在庫状態
  inventory: "w-20 shrink-0",
  // 販売価格
  price: "w-24 shrink-0",
} as const;