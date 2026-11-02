import { GOOGLE_SHEETS_WEBHOOK_URL } from "./googleSheets";
import { getBackendWriteAuthHeaders } from "@/lib/supabaseClient";

/**
 * 商品マスターAPI（Cloud Run + Supabase）のエンドポイント。
 * - 一覧・検索・詳細のGET読取はこちらを優先利用する（ログイン不要・ブラウザへの秘密鍵埋め込みなし）。
 * - Phase 2 Unit 1: Square連携を伴わない下書き商品の新規登録（POST /products）および
 *   下書き商品の編集（POST /products/:productId/update）は Cloud Run + Supabase を書込正本とする。
 * - 公開登録・Square連携済み商品の編集・公開状態変更・AI生成等は引き続き GOOGLE_SHEETS_WEBHOOK_URL（GAS）を利用し、
 *   書込成功後に syncProductToReadDb() で該当1商品をSupabaseへ即時反映する。
 * - 画面を閉じている間のGAS定期処理による変更は Cloud Scheduler -> POST /reconcile（5分周期）が差分同期する。
 */
export const PRODUCTS_READ_API_URL = (
  (import.meta.env.VITE_PRODUCTS_API_URL as string | undefined) ||
  "https://bis-ec-products-api-345911340347.asia-northeast1.run.app"
)
  .trim()
  .replace(/\/+$/, "");

const UNSYNCED_PRODUCTS_STORAGE_KEY = "bis_unsynced_products_v1";
const UNSYNCED_TTL_MS = 10 * 60 * 1000; // 10 minutes (covers >1 scheduled 5-min reconcile cycle)

export interface ProductSyncResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface ProductSyncWarningDetail {
  productId: string;
  status?: number;
  error: string;
  occurredAt: string;
}

interface UnsyncedMap {
  [productId: string]: {
    failedAtMs: number;
    allowDelete?: boolean;
    error: string;
  };
}

function readUnsyncedProducts(): UnsyncedMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(UNSYNCED_PRODUCTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as UnsyncedMap;
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    let mutated = false;
    const cleaned: UnsyncedMap = {};
    for (const [pid, entry] of Object.entries(parsed)) {
      if (entry && typeof entry.failedAtMs === "number" && now - entry.failedAtMs < UNSYNCED_TTL_MS) {
        cleaned[pid] = entry;
      } else {
        mutated = true;
      }
    }
    if (mutated) {
      window.sessionStorage.setItem(UNSYNCED_PRODUCTS_STORAGE_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return {};
  }
}

function markProductUnsynced(productId: string, error: string, allowDelete?: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const current = readUnsyncedProducts();
    current[productId] = {
      failedAtMs: Date.now(),
      allowDelete,
      error,
    };
    window.sessionStorage.setItem(UNSYNCED_PRODUCTS_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Ignore sessionStorage quota errors
  }
}

function clearProductUnsynced(productId: string): void {
  if (typeof window === "undefined") return;
  try {
    const current = readUnsyncedProducts();
    if (productId in current) {
      delete current[productId];
      window.sessionStorage.setItem(UNSYNCED_PRODUCTS_STORAGE_KEY, JSON.stringify(current));
    }
  } catch {
    // Ignore sessionStorage errors
  }
}

function emitSyncWarning(detail: ProductSyncWarningDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ProductSyncWarningDetail>("bis:product-sync-warning", { detail })
  );
}

async function performSingleSyncRequest(
  productId: string,
  allowDelete?: boolean
): Promise<ProductSyncResult> {
  const suffix = allowDelete ? "?allow_delete=1" : "";
  const response = await fetch(
    `${PRODUCTS_READ_API_URL}/sync/${encodeURIComponent(productId)}${suffix}`,
    {
      method: "POST",
    }
  );

  let data: Record<string, unknown> | null = null;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errMsg =
      (typeof data?.error === "string" && data.error) ||
      `HTTP ${response.status}`;
    return { ok: false, status: response.status, error: errMsg };
  }

  if (!data || data.success !== true || data.synced !== true) {
    const errMsg =
      (typeof data?.error === "string" && data.error) ||
      "Invalid sync response payload";
    return { ok: false, status: response.status, error: errMsg };
  }

  return { ok: true, status: response.status };
}

/**
 * Cloud Run 商品読取APIへGETリクエストを送る。
 * - 直前の書込後に即時同期が失敗した商品が残っている場合は、再同期を1回試み、
 *   それでも未同期なら正本（GAS / Google Sheets）から直接読み取って古いキャッシュ表示を防ぐ。
 * - Cloud Run のネットワーク障害・5xx 時は保持中の Google Sheets（GAS）へ自動フォールバックする。
 */
export async function fetchProductsReadApi(queryString: string): Promise<Response> {
  const cleanQuery = queryString.replace(/^\?+/, "");
  const searchParams = new URLSearchParams(cleanQuery);
  const isAdmin = (searchParams.get("mode") || "").trim().toLowerCase() === "admin";
  const requestedProductId = (searchParams.get("product_id") || "").trim();

  if (isAdmin && PRODUCTS_READ_API_URL) {
    const unsynced = readUnsyncedProducts();
    const relevantIds = requestedProductId
      ? unsynced[requestedProductId]
        ? [requestedProductId]
        : []
      : Object.keys(unsynced);

    if (relevantIds.length > 0) {
      let stillDirty = false;
      for (const pid of relevantIds.slice(0, 3)) {
        try {
          const retry = await performSingleSyncRequest(pid, unsynced[pid]?.allowDelete);
          if (retry.ok) {
            clearProductUnsynced(pid);
          } else {
            stillDirty = true;
          }
        } catch {
          stillDirty = true;
        }
      }
      if (stillDirty || relevantIds.length > 3) {
        return fetch(`${GOOGLE_SHEETS_WEBHOOK_URL}?${cleanQuery}`, {
          method: "GET",
        });
      }
    }
  }

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
 * - 通信例外だけでなく HTTP エラー（4xx/5xx）や応答ボディ失敗（success !== true / synced !== true）も確実に検出する。
 * - 失敗時は警告ログ＋画面通知イベント＋未同期マーク（次回読取時の正本フォールバック用）を記録しつつ、
 *   正本（Google Sheets）の保存成功自体は壊さないよう例外は投げない。
 */
export async function syncProductToReadDb(
  productId: string | null | undefined,
  options?: { allowDelete?: boolean }
): Promise<ProductSyncResult> {
  const id = (productId ?? "").trim();
  if (!id || !PRODUCTS_READ_API_URL) {
    return { ok: true };
  }

  try {
    const result = await performSingleSyncRequest(id, options?.allowDelete);
    if (!result.ok) {
      const errMsg = result.error || "Unknown sync failure";
      console.warn(
        `[productsApi] Supabase sync failed for ${id} (status=${result.status ?? "none"}): ${errMsg}`
      );
      markProductUnsynced(id, errMsg, options?.allowDelete);
      emitSyncWarning({
        productId: id,
        status: result.status,
        error: errMsg,
        occurredAt: new Date().toISOString(),
      });
      return result;
    }

    clearProductUnsynced(id);
    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[productsApi] Supabase sync network error for ${id}: ${errMsg}`);
    markProductUnsynced(id, errMsg, options?.allowDelete);
    emitSyncWarning({
      productId: id,
      error: errMsg,
      occurredAt: new Date().toISOString(),
    });
    return { ok: false, error: errMsg };
  }
}

/**
 * 対象商品が「Square連携を伴わない下書き商品」であり、Cloud Run + Supabase 書込APIの対象かを判定する。
 * - 一度公開して Square Item / Variation が紐付いた後に下書きへ戻した商品は Square 価格同期が関わるため除外する。
 */
export function canUseCloudRunDraftUpdate(product: {
  publish_status?: string | null;
  square_item_id?: string | null;
  square_variation_id?: string | null;
}): boolean {
  if (!PRODUCTS_READ_API_URL) return false;
  const pubStatus = (product.publish_status ?? "draft").trim() || "draft";
  const hasSquareLink =
    Boolean((product.square_item_id ?? "").trim()) ||
    Boolean((product.square_variation_id ?? "").trim());
  return pubStatus === "draft" && !hasSquareLink;
}

/**
 * Cloud Run + Supabase へ直接書込が完了した商品について、セッション内の未同期フラグを解除する。
 */
export function markDraftProductSyncedInSession(
  productId: string | null | undefined
): void {
  const id = (productId ?? "").trim();
  if (!id) return;
  clearProductUnsynced(id);
}

/**
 * Phase 2 Unit 1: Square連携を伴わない下書き商品の新規登録（Cloud Run -> Supabase 正本保存 + Drive画像保存）。
 */
export async function createDraftProductViaApi(
  payload: Record<string, unknown>
): Promise<Response> {
  if (!PRODUCTS_READ_API_URL) {
    return fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
  }
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(`${PRODUCTS_READ_API_URL}/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Phase 2 Unit 1: Square連携を伴わない下書き商品の編集（Cloud Run -> Supabase 正本更新 + Sheets互換ミラー）。
 */
export async function updateDraftProductViaApi(
  productId: string,
  payload: Record<string, unknown>
): Promise<Response> {
  const id = productId.trim();
  if (!PRODUCTS_READ_API_URL) {
    return fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        ...payload,
        action: "update_product",
        product_id: id,
      }),
    });
  }
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/update`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify(payload),
    }
  );
}

