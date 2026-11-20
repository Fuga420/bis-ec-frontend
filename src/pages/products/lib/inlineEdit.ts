import type { AdminProduct } from "../types";

// 一覧に表示しているタイトルの実体フィールド。
export type InlineTitleField = "product_name" | "translated_title";

// 一覧編集で「いま表示しているタイトル」がどのフィールドかを返す。
// スニーカーで translated_title（保存済みの英語名）があるときだけ、それを表示している。
// それ以外は本票の product_name を表示している。
export function getInlineTitleField(product: AdminProduct): InlineTitleField {
  const isSneaker = (product.category ?? "").toString().trim() === "sneaker";
  if (isSneaker) {
    const translated = (product.translated_title ?? "").trim();
    if (translated !== "") return "translated_title";
  }
  return "product_name";
}

// 一覧に表示しているタイトルそのもの（編集の初期値・変更判定の基準）。
export function getInlineTitleValue(product: AdminProduct): string {
  return getInlineTitleField(product) === "translated_title"
    ? (product.translated_title ?? "").trim()
    : (product.product_name ?? "").trim();
}

// 一覧インライン編集の入力値。
export interface InlineEditDraft {
  title: string;
  price: string;
}

// 編集開始時の初期値。
// タイトルは「一覧に表示しているタイトル」をそのまま初期表示する
// （スニーカーの英語タイトル行なら translated_title、それ以外は product_name）。
// 価格は現在の販売予定価格（未設定は空文字）。
export function buildInlineEditInitialDraft(
  product: AdminProduct
): InlineEditDraft {
  const price =
    product.planned_sale_price != null && product.planned_sale_price > 0
      ? String(product.planned_sale_price)
      : "";
  return { title: getInlineTitleValue(product), price };
}

export interface InlineEditChanges {
  payload: Record<string, unknown>;
  changed: boolean;
  error?: string;
}

// 変更があった項目だけの部分更新ペイロードを組み立てる（未変更項目は送らない）。
// - タイトル: 表示中のタイトルと同じフィールドへ送る。
//   スニーカーで translated_title を表示している行 → translated_title
//   それ以外 → product_name（本票の値を書き換えない）
// - 価格: 空欄への変更は許可せず、正の整数のみ許可する。
//
// GAS 固定Web App v95 以降、update_product は translated_title を保存できる。
// タイトル＋価格を同時に変更した場合も、この payload を update_product へ1回で送る。
export function computeInlineEditChanges(
  product: AdminProduct,
  draft: InlineEditDraft
): InlineEditChanges {
  const payload: Record<string, unknown> = {};

  // タイトル（表示中のタイトルの実体フィールドだけを更新する）
  const titleField = getInlineTitleField(product);
  const originalTitle = getInlineTitleValue(product);
  const nextTitle = draft.title.trim();
  if (nextTitle === "") {
    return {
      payload: {},
      changed: false,
      error: "タイトルを入力してください",
    };
  }
  if (nextTitle !== originalTitle) {
    payload[titleField] = nextTitle;
  }

  // 販売予定価格（空欄不可・正の整数のみ）
  const originalPrice =
    product.planned_sale_price != null && product.planned_sale_price > 0
      ? String(product.planned_sale_price)
      : "";
  const nextPrice = draft.price.trim();
  if (nextPrice !== originalPrice) {
    if (!/^\d+$/.test(nextPrice)) {
      return {
        payload: {},
        changed: false,
        error: "販売予定価格は正の整数で入力してください",
      };
    }
    const value = Number(nextPrice);
    if (!Number.isInteger(value) || value <= 0) {
      return {
        payload: {},
        changed: false,
        error: "販売予定価格は正の整数で入力してください",
      };
    }
    payload.planned_sale_price = value;
  }

  return { payload, changed: Object.keys(payload).length > 0 };
}