import type { AdminProduct } from "../types";

// 一覧で先頭に表示する商品タイトルを決める（表示専用）。
//
// 表示ルール:
//   1. カテゴリがスニーカー(sneaker)のときだけ translated_title を trim して
//      値があれば、それを表示する。
//   2. スニーカー以外のカテゴリは translated_title の有無にかかわらず、
//      本票の商品名(product_name)を表示する。
//   3. スニーカーで translated_title が空欄・未定義なら product_name へフォールバックする。
//   4. 表示対象の名前が空欄なら従来どおり「（商品名なし）」を返す。
//
// 一覧APIの translated_title をそのまま使う（商品ごとに詳細APIを追加で呼ばない）。
// 本票の product_name や翻訳データは書き換えない。
export function getProductDisplayTitle(
  product: Pick<AdminProduct, "category" | "translated_title" | "product_name">
): string {
  const name = (product.product_name ?? "").trim();

  // スニーカーだけ英語タイトルを優先する。スニーカー以外は常に本票の商品名を表示する。
  const isSneaker = (product.category ?? "").toString().trim() === "sneaker";
  if (isSneaker) {
    const translated = (product.translated_title ?? "").trim();
    if (translated !== "") return translated;
  }

  if (name !== "") return name;

  return "（商品名なし）";
}