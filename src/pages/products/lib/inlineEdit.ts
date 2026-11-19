import type { AdminProduct } from "../types";

// 一覧に表示しているタイトルの実体フィールド。
export type InlineTitleField = "product_name";

// 一覧編集のタイトル保存先フィールドを返す（常に product_name）。
export function getInlineTitleField(_product: AdminProduct): InlineTitleField {
  return "product_name";
}

// 一覧に表示しているタイトルそのもの（編集の初期値・変更判定の基準）。
export function getInlineTitleValue(product: AdminProduct): string {
  return (product.product_name ?? "").trim();
}

// 一覧インライン編集の入力値。
export interface InlineEditDraft {
  title: string;
  price: string;
}

// 編集開始時の初期値。
// タイトルは本票の product_name、価格は現在の販売予定価格（未設定は空文字）。
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
// - タイトル: product_name へ送る。
// - 価格: 空欄への変更は許可せず、正の整数のみ許可する。
export function computeInlineEditChanges(
  product: AdminProduct,
  draft: InlineEditDraft
): InlineEditChanges {
  const payload: Record<string, unknown> = {};

  // タイトル
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