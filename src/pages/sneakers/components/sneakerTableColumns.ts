// スニーカー一覧の列幅は、列見出し・データ行で必ず同じ値を使う。
// 個別に数値を書くと見出しと行の文字開始位置がずれるため、ここに集約する。
// 狭い画面では列自体を落とし、ページ全体の横スクロールは発生させない。
export const SNEAKER_COL = {
  // 商品画像（40px 角）
  image: "w-10 shrink-0",
  // サイズ（実データがあるページだけ表示）
  size: "w-14 shrink-0",
  // 公開状態（デスクトップのみ）
  publish: "w-16 shrink-0",
  // 在庫状態
  inventory: "w-20 shrink-0",
  // 販売価格
  price: "w-24 shrink-0",
} as const;