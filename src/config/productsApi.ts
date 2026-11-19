import { getBackendWriteAuthHeaders } from "@/lib/supabaseClient";
import { getAdminReadHeaders, notifyAdminUnauthorized } from "@/lib/adminAuth";

/**
 * 商品マスターAPI（Cloud Run + Supabase）のエンドポイント。
 * - 一覧・検索・詳細のGET読取および全商品書込（新規登録・編集・画像更新・在庫変更・公開状態変更・
 *   アーカイブ/復元・完全削除・Square連携・AI下書き/バッチ・書類台帳）はすべて Cloud Run + Supabase を正本とする。
 * - GAS フォールバックは全廃済み。
 */
export const PRODUCTS_READ_API_URL = (
  (import.meta.env.VITE_PRODUCTS_API_URL as string | undefined) ||
  "https://bis-ec-products-api-345911340347.asia-northeast1.run.app"
)
  .trim()
  .replace(/\/+$/, "");

function requireProductsApiUrl(): string {
  if (!PRODUCTS_READ_API_URL) {
    throw new Error("PRODUCTS_READ_API_URL is not configured");
  }
  return PRODUCTS_READ_API_URL;
}

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
 * Cloud Run 商品読取APIへGETリクエストを送る（GAS読み取りフォールバックは撤去済み）。
 */
export async function fetchProductsReadApi(queryString: string): Promise<Response> {
  const apiUrl = requireProductsApiUrl();
  const cleanQuery = queryString.replace(/^\?+/, "");
  const searchParams = new URLSearchParams(cleanQuery);
  const isAdmin = (searchParams.get("mode") || "").trim().toLowerCase() === "admin";
  const requestedProductId = (searchParams.get("product_id") || "").trim();

  if (isAdmin) {
    const unsynced = readUnsyncedProducts();
    const relevantIds = requestedProductId
      ? unsynced[requestedProductId]
        ? [requestedProductId]
        : []
      : Object.keys(unsynced);

    if (relevantIds.length > 0) {
      for (const pid of relevantIds.slice(0, 3)) {
        try {
          const retry = await performSingleSyncRequest(pid, unsynced[pid]?.allowDelete);
          if (retry.ok) {
            clearProductUnsynced(pid);
          }
        } catch {
          // Ignore best-effort retry errors; read directly from Cloud Run
        }
      }
    }
  }

  // 管理画面の共有パスワードは、保持していればヘッダでそのまま送る。
  // 判定はしない（正誤はAPIが401で返す）。
  const response = await fetch(`${apiUrl}/?${cleanQuery}`, {
    method: "GET",
    headers: getAdminReadHeaders(),
  });
  // 401 = パスワード不一致・期限切れ。保持を消してロック画面へ戻す。
  if (response.status === 401) {
    notifyAdminUnauthorized();
  }
  return response;
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
 * 下書き商品の新規登録（Cloud Run -> Supabase 正本保存 + Drive画像保存）。
 */
export async function createDraftProductViaApi(
  payload: Record<string, unknown>
): Promise<Response> {
  const apiUrl = requireProductsApiUrl();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(`${apiUrl}/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });
}

/**
 * 第4弾(D) 一本化: 下書き・公開済み・Square連携済みの全商品編集（Cloud Run -> Supabase 正本更新 +
 * 価格変更時はパターンB同期 + 非価格変更時はSquare詳細同期）。
 */
export async function updateProductViaApi(
  productId: string,
  payload: Record<string, unknown>
): Promise<Response> {
  const apiUrl = requireProductsApiUrl();
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${apiUrl}/products/${encodeURIComponent(id)}/update`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({
        ...payload,
        square_sync: true,
      }),
    }
  );
}

/** 既存呼び出し元向けの互換エイリアス（updateProductViaApi へ一本化）。 */
export const updateDraftProductViaApi = updateProductViaApi;

/**
 * 複数画像からの商品取込（Cloud Run -> Supabase 冪等管理・正本保存 + Google Drive 画像保存）。
 */
export async function importProductByImagesViaApi(
  payload: Record<string, unknown>
): Promise<Response> {
  const apiUrl = requireProductsApiUrl();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(`${apiUrl}/products/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });
}

/**
 * 商品画像の追加・並べ替え・削除（Cloud Run -> Google Drive 更新 + Supabase 正本更新）。
 */
export async function updateProductImagesViaApi(
  productId: string,
  payload: Record<string, unknown>
): Promise<Response> {
  const apiUrl = requireProductsApiUrl();
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${apiUrl}/products/${encodeURIComponent(id)}/images`,
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

/**
 * 第4弾(D) 手動在庫変更: 下書き・公開済み・Square連携済みすべての商品の在庫状態変更（Cloud Run ->
 * Square在庫/Payment Link同期［Fail-Closed］+ Supabase 正本更新）。
 */
export async function updateInventoryStatusViaApi(
  productId: string,
  inventoryStatus: string
): Promise<Response> {
  const apiUrl = requireProductsApiUrl();
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${apiUrl}/products/${encodeURIComponent(id)}/inventory-status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({
        inventory_status: inventoryStatus,
        square_sync: true,
      }),
    }
  );
}

/** 既存呼び出し元向けの互換エイリアス（updateInventoryStatusViaApi へ一本化）。 */
export const updateDraftInventoryStatusViaApi = updateInventoryStatusViaApi;

/**
 * 商品のアーカイブ・復元（Cloud Run -> Square 在庫0・決済リンク無効化・Catalog アーカイブ同期 + Supabase 正本更新）。
 */
export async function updateDraftRecordStatusViaApi(
  productId: string,
  recordStatus: "active" | "archived",
  options?: { squareSync?: boolean }
): Promise<Response> {
  const apiUrl = requireProductsApiUrl();
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  const squareSync = options?.squareSync ?? true;
  return fetch(
    `${apiUrl}/products/${encodeURIComponent(id)}/record-status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({
        record_status: recordStatus,
        square_sync: squareSync,
      }),
    }
  );
}

/**
 * 第4弾(D) 商品の完全削除（アーカイブ済み商品のみ・台帳事前検査 -> Square安全化 -> Driveフォルダゴミ箱移動 -> Supabase行削除）。
 */
export async function deleteProductViaApi(
  productId: string
): Promise<Response> {
  const apiUrl = requireProductsApiUrl();
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${apiUrl}/products/${encodeURIComponent(id)}/delete`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({ product_id: id }),
    }
  );
}

/**
 * Phase 2 Unit 4: 単品AI下書き生成（Cloud Run -> Gemini Search Grounding + Supabase 正本保存 + Sheets互換ミラー）。
 * 単品生成は常にスタッフ確認前のドラフト（auto_apply: false）として保存し、公開状態は変更しない。
 */
export async function generateProductAiDraftViaApi(
  productId: string,
  payload?: Record<string, unknown>
): Promise<Response> {
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/ai-draft/generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({
        product_id: id,
        ...(payload ?? {}),
      }),
    }
  );
}

/**
 * Phase 2 Unit 4: 単品AI下書き確定（Cloud Run -> Supabase 正本更新 + Sheets / 翻訳 / ポケカ / 指紋 互換ミラー）。
 * 既存の下書き商品を確定更新するだけで、公開処理は行わない。
 */
export async function confirmProductAiDraftViaApi(
  productId: string,
  payload: Record<string, unknown>
): Promise<Response> {
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/ai-draft/confirm`,
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

/**
 * Phase 2 Unit 4: 単品AI下書き取得（Cloud Run -> Supabase 正本参照、未同期時はGASからオンデマンド補完）。
 */
export async function getProductAiDraftViaApi(
  productId: string,
  draftId?: string
): Promise<Response> {
  const id = productId.trim();
  const trimmedDraftId = (draftId ?? "").trim();
  const query = trimmedDraftId
    ? `?draft_id=${encodeURIComponent(trimmedDraftId)}`
    : "";
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/ai-draft${query}`,
    {
      method: "GET",
      headers: {
        ...authHeaders,
      },
    }
  );
}

/**
 * Phase 2 Unit 4: AI解析用画像の選択保存（Cloud Run -> Drive実在検証 + Supabase 正本保存 + GAS一括生成向け互換ミラー）。
 */
export async function saveProductAiSelectedImagesViaApi(
  productId: string,
  selectedImageIds: string[]
): Promise<Response> {
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/ai-selected-images`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({
        selected_image_ids: selectedImageIds,
      }),
    }
  );
}

/**
 * Phase 2 Unit 5: 手動AI一括生成の受付（Cloud Run -> 確定原価解決 + Supabase キュー登録 + 非同期ワーカー起動）。
 * 成功商品はワーカーが下書き商品へ自動確定反映し、公開・Square登録は行わない。
 */
export async function createProductAiDraftBatchViaApi(
  payload: Record<string, unknown>
): Promise<Response> {
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(`${PRODUCTS_READ_API_URL}/ai-batches`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Phase 2 Unit 5: AI一括生成バッチの進捗・商品別結果取得（Cloud Run -> Supabase キュー参照）。
 */
export async function getProductAiDraftBatchViaApi(
  batchId: string,
  testOnly?: boolean
): Promise<Response> {
  const id = batchId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  const query =
    typeof testOnly === "boolean"
      ? `?test_only=${testOnly ? "true" : "false"}`
      : "";
  return fetch(
    `${PRODUCTS_READ_API_URL}/ai-batches/${encodeURIComponent(id)}${query}`,
    {
      method: "GET",
      headers: {
        ...authHeaders,
      },
    }
  );
}

/**
 * Phase 2 Unit 5: AI一括生成の失敗商品のみ再実行（Cloud Run -> Supabase キュー再投入 + 非同期ワーカー起動）。
 */
export async function retryProductAiDraftBatchViaApi(
  batchId: string,
  payload: Record<string, unknown>
): Promise<Response> {
  const id = batchId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/ai-batches/${encodeURIComponent(id)}/retry`,
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

/**
 * 日時指定によるAI一括生成の予約作成（Cloud Run -> Supabase `ai_batch_schedules` 保存）。
 * 選択した商品IDを固定して保存し、指定時刻にサーバー側ディスパッチャーが確定原価を取得して起動する。
 */
export async function createAiBatchScheduleViaApi(
  payload: Record<string, unknown>
): Promise<Response> {
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(`${PRODUCTS_READ_API_URL}/ai-batch-schedules`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });
}

/**
 * 即時実行・日時指定予約の両方を含む統合AI一括生成ジョブ一覧・進捗サマリー取得（マルチデバイス対応）。
 */
export async function listAiBatchRunsViaApi(params: {
  testOnly?: boolean;
  limit?: number;
}): Promise<Response> {
  const authHeaders = await getBackendWriteAuthHeaders();
  const search = new URLSearchParams();
  search.set("test_only", params.testOnly === true ? "true" : "false");
  if (params.limit != null) {
    search.set("limit", String(params.limit));
  }
  return fetch(
    `${PRODUCTS_READ_API_URL}/ai-batch-runs?${search.toString()}`,
    {
      method: "GET",
      headers: {
        ...authHeaders,
      },
    }
  );
}

/**
 * 現在の動作モード（通常 / テスト）のAI一括生成予約一覧・結果サマリー取得。
 */
export async function listAiBatchSchedulesViaApi(params: {
  testOnly?: boolean;
  limit?: number;
}): Promise<Response> {
  const authHeaders = await getBackendWriteAuthHeaders();
  const search = new URLSearchParams();
  search.set("test_only", params.testOnly === true ? "true" : "false");
  if (params.limit != null) {
    search.set("limit", String(params.limit));
  }
  return fetch(
    `${PRODUCTS_READ_API_URL}/ai-batch-schedules?${search.toString()}`,
    {
      method: "GET",
      headers: {
        ...authHeaders,
      },
    }
  );
}

/**
 * AI一括生成予約の詳細・進捗・除外理由・商品別結果取得。
 */
export async function getAiBatchScheduleViaApi(
  scheduleId: string,
  testOnly?: boolean
): Promise<Response> {
  const id = scheduleId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  const query =
    typeof testOnly === "boolean"
      ? `?test_only=${testOnly ? "true" : "false"}`
      : "";
  return fetch(
    `${PRODUCTS_READ_API_URL}/ai-batch-schedules/${encodeURIComponent(id)}${query}`,
    {
      method: "GET",
      headers: {
        ...authHeaders,
      },
    }
  );
}

/**
 * 開始前のAI一括生成予約の取り消し。
 */
export async function cancelAiBatchScheduleViaApi(
  scheduleId: string,
  testOnly?: boolean
): Promise<Response> {
  const id = scheduleId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/ai-batch-schedules/${encodeURIComponent(id)}/cancel`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify(
        typeof testOnly === "boolean" ? { test_only: testOnly } : {}
      ),
    }
  );
}

/**
 * Square 連携第2弾: Square Production 商品（Catalog Item / Variation）の新規作成（Cloud Run -> Square API + Supabase 保存）。
 */
export async function createSquareProductionProductViaApi(
  productId: string
): Promise<Response> {
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/square-product`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({ product_id: id }),
    }
  );
}

/**
 * Square 連携第2弾: Square Production Payment Link（決済URL）の生成（Cloud Run -> Square API + Supabase 保存）。
 */
export async function createSquarePaymentLinkViaApi(
  productId: string,
  options?: {
    rollback_on_failure?: boolean;
    existing_publish_status?: string;
  }
): Promise<Response> {
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/payment-link`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({
        product_id: id,
        ...(options || {}),
      }),
    }
  );
}

/**
 * Square 連携第2弾: Square Production Payment Link（決済URL）状態の取得。
 */
export async function getSquarePaymentLinkViaApi(
  productId: string
): Promise<Response> {
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/payment-link`,
    {
      method: "GET",
      headers: {
        ...authHeaders,
        ...getAdminReadHeaders(),
      },
    }
  );
}

/**
 * Square 連携第2弾: Square Production Payment Link（決済URL）の無効化（DELETE + 世代番号インクリメント）。
 */
export async function invalidateSquarePaymentLinkViaApi(
  productId: string
): Promise<Response> {
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/payment-link/invalidate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({ product_id: id }),
    }
  );
}

/**
 * Square 連携第2弾: 公開状態（publish_status: draft / published / hidden）の更新（Cloud Run -> Square 在庫・Payment Link 同期 + Supabase 保存 + Sheets ミラー）。
 */
export async function updateProductPublishStatusViaApi(
  productId: string,
  publishStatus: string
): Promise<Response> {
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/publish-status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({
        product_id: id,
        publish_status: publishStatus,
      }),
    }
  );
}

/**
 * Square 連携第3弾: Square Production メイン画像同期（Cloud Run -> Google Drive 画像取得 + Square `/v2/catalog/images` アップロード・差し替え）。
 */
export async function syncSquareProductionImageViaApi(
  productId: string
): Promise<Response> {
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/square-image-sync`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({ product_id: id }),
    }
  );
}

/**
 * Square 連携第3弾: Square Production 在庫同期（Cloud Run -> BIS 状態に応じた目標数量の算出 + Square Inventory 更新）。
 */
export async function syncSquareProductionInventoryViaApi(
  productId: string,
  quantity?: number
): Promise<Response> {
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/square-inventory-sync`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({
        product_id: id,
        ...(quantity !== undefined ? { quantity } : {}),
      }),
    }
  );
}

/**
 * Square 連携第3弾: Square Production 価格同期（Cloud Run -> Square Catalog Variation 価格の version 付き upsert）。
 */
export async function updateSquareProductionPriceViaApi(
  productId: string,
  newPrice?: number
): Promise<Response> {
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/square-price-sync`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({
        product_id: id,
        ...(newPrice !== undefined ? { new_price: newPrice } : {}),
      }),
    }
  );
}

/**
 * Square 連携第3弾: Square Production 商品詳細同期（Cloud Run -> 表示ビルダー再生成 + Square Catalog Item/Variation の version 付き upsert）。
 */
export async function syncSquareProductionDetailsViaApi(
  productId: string
): Promise<Response> {
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/square-details-sync`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({ product_id: id }),
    }
  );
}

/**
 * Square 連携第3弾: Square Production カタログ商品のアーカイブ（`is_archived = true`、冪等）。
 */
export async function archiveSquareProductionProductViaApi(
  productId: string
): Promise<Response> {
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/square-archive`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({ product_id: id }),
    }
  );
}

/**
 * Square 連携第3弾: Square Production カタログ商品のアーカイブ解除（`is_archived = false`、冪等）。
 */
export async function unarchiveSquareProductionProductViaApi(
  productId: string
): Promise<Response> {
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/square-unarchive`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({ product_id: id }),
    }
  );
}

/**
 * Square 連携第3弾: Square Production カタログ商品の削除と BIS 側 Square ID 群のクリア（世代番号インクリメント）。
 */
export async function deleteSquareProductionProductViaApi(
  productId: string
): Promise<Response> {
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/square-delete`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify({ product_id: id }),
    }
  );
}

/**
 * Square 連携第3弾: Square 実状態と BIS 状態の照合・修復（管理者認証）。
 */
export async function reconcileSquareProductStatusViaApi(
  productId: string,
  autoReconcile?: "complete_publish" | "stop_sales"
): Promise<Response> {
  const id = productId.trim();
  const authHeaders = await getBackendWriteAuthHeaders();
  return fetch(
    `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(id)}/square-reconcile-status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
        ...getAdminReadHeaders(),
      },
      body: JSON.stringify({
        product_id: id,
        ...(autoReconcile ? { auto_reconcile: autoReconcile } : {}),
      }),
    }
  );
}




