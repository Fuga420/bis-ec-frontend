import { GOOGLE_SHEETS_WEBHOOK_URL } from "./googleSheets";

/**
 * 商品マスター読取API（Cloud Run + Supabase）のエンドポイント。
 * - 一覧・検索・詳細のGET読取はこちらを優先利用する。
 * - 商品登録・更新・削除・Square同期等のPOST書込は引き続き GOOGLE_SHEETS_WEBHOOK_URL（GAS）を正本とし、
 *   書込成功後に syncProductToReadDb() で該当1商品をSupabaseへ即時反映する。
 */
export const PRODUCTS_READ_API_URL = (
  (import.meta.env.VITE_PRODUCTS_API_URL as string | undefined) ||
  "https://bis-ec-products-api-345911340347.asia-northeast1.run.app"
)
  .trim()
  .replace(/\/+$/, "");

/**
 * Cloud Run 商品読取APIへGETリクエストを送り、万一ネットワーク障害や5xxが発生した場合は
 * 保持中の Google Sheets（GAS Web App）へ安全にフォールバックする。
 */
export async function fetchProductsReadApi(queryString: string): Promise<Response> {
  const cleanQuery = queryString.replace(/^\?+/, "");
  if (PRODUCTS_READ_API_URL) {
    try {
      const response = await fetch(`${PRODUCTS_READ_API_URL}/?${cleanQuery}`, {
        method: "GET",
      });
      if (response.ok) {
        return response;
      }
      if (response.status < 500) {
        return response;
      }
    } catch {
      // Cloud Run 側の一時障害時は下の GAS フォールバックへ進む
    }
  }
  return fetch(`${GOOGLE_SHEETS_WEBHOOK_URL}?${cleanQuery}`, {
    method: "GET",
  });
}

/**
 * GAS（Google Sheets）側への商品作成・更新・状態変更・削除が成功した直後に呼び出し、
 * 該当 product_id の最新状態を Supabase 読取DBへ即時同期する。
 * 同期失敗時も GAS 側への保存成功自体は壊さないよう例外を握りつぶす。
 */
export async function syncProductToReadDb(
  productId: string | null | undefined,
  options?: { allowDelete?: boolean }
): Promise<void> {
  const id = (productId ?? "").trim();
  if (!id || !PRODUCTS_READ_API_URL) return;
  const suffix = options?.allowDelete ? "?allow_delete=1" : "";
  try {
    await fetch(
      `${PRODUCTS_READ_API_URL}/sync/${encodeURIComponent(id)}${suffix}`,
      { method: "POST" }
    );
  } catch {
    // 読取DBへの即時同期に失敗しても本票（Google Sheets）の保存結果は維持する
  }
}
