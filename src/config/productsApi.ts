import { GOOGLE_SHEETS_WEBHOOK_URL } from "./googleSheets";
import { getStaffAccessToken } from "./productsAuth";

/**
 * 商品マスター読取API（Cloud Run + Supabase）のエンドポイント。
 * - 一覧・検索・詳細のGET読取はこちらを優先利用する。
 * - 商品登録・更新・削除・Square同期等のPOST書込は引き続き GOOGLE_SHEETS_WEBHOOK_URL（GAS）を正本とし、
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
  accessToken: string | null,
  allowDelete?: boolean
): Promise<ProductSyncResult> {
  const suffix = allowDelete ? "?allow_delete=1" : "";
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(
    `${PRODUCTS_READ_API_URL}/sync/${encodeURIComponent(productId)}${suffix}`,
    {
      method: "POST",
      headers,
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
 * - `mode=admin` の場合はスタッフセッションの `Authorization: Bearer <jwt>` を付与する。
 * - 401/403（未認証・権限不足）の場合は GAS への無認証フォールバックを絶対に行わずそのまま返す。
 * - 直前の書込後に即時同期が失敗した商品が残っている場合は、再同期を1回試み、
 *   それでも未同期なら正本（GAS / Google Sheets）から直接読み取って古いキャッシュ表示を防ぐ。
 * - Cloud Run のネットワーク障害・5xx 時のみ保持中の Google Sheets（GAS）へフォールバックする。
 */
export async function fetchProductsReadApi(queryString: string): Promise<Response> {
  const cleanQuery = queryString.replace(/^\?+/, "");
  const searchParams = new URLSearchParams(cleanQuery);
  const isAdmin = (searchParams.get("mode") || "").trim().toLowerCase() === "admin";
  const requestedProductId = (searchParams.get("product_id") || "").trim();

  const accessToken = isAdmin ? await getStaffAccessToken() : null;

  // 直前の保存で同期失敗した商品がある場合、再同期を試行し、解消しなければ正本(GAS)から読む
  if (isAdmin && accessToken && PRODUCTS_READ_API_URL) {
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
          const retry = await performSingleSyncRequest(
            pid,
            accessToken,
            unsynced[pid]?.allowDelete
          );
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
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      const response = await fetch(`${PRODUCTS_READ_API_URL}/?${cleanQuery}`, {
        method: "GET",
        headers,
      });
      if (response.ok) {
        return response;
      }
      if (response.status === 401 && isAdmin && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("bis:staff-auth-expired"));
      }
      // 4xx（401/403含む）はフォールバックせずそのまま返却する
      if (response.status < 500) {
        return response;
      }
    } catch {
      // 未ログイン状態での通信失敗時は GAS へバイパスさせない
      if (isAdmin && !accessToken) {
        throw new Error("Staff authentication required");
      }
      // ログイン済みで Cloud Run 側が一時障害の場合のみ下の GAS フォールバックへ進む
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
    const accessToken = await getStaffAccessToken();
    const result = await performSingleSyncRequest(id, accessToken, options?.allowDelete);
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
