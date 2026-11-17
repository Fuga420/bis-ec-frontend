import CategoryListingPage from "./page";

// クロムハーツは独立したカテゴリ値を持たないため、ブランド名で絞り込む。
// 商品のカテゴリ（ジュエリー／アパレル／ファッション小物）に関係なく、
// ブランドが Chrome Hearts の商品をまとめて表示する。
export default function ChromeHeartsPage() {
  return (
    <CategoryListingPage pageTitle="クロムハーツ" brandKeyword="Chrome Hearts" />
  );
}