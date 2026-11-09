import {
  AI_BATCH_RELAY_FUNCTION_NAME,
  AiRelayError,
  extractRelayError,
  invokeAiRelay,
} from "@/pages/register/lib/aiProduct";
import {
  PRODUCTS_READ_API_URL,
  cancelAiBatchScheduleViaApi,
  createAiBatchScheduleViaApi,
  createProductAiDraftBatchViaApi,
  getAiBatchScheduleViaApi,
  getProductAiDraftBatchViaApi,
  listAiBatchRunsViaApi,
  listAiBatchSchedulesViaApi,
  markDraftProductSyncedInSession,
  retryProductAiDraftBatchViaApi,
  saveProductAiSelectedImagesViaApi,
  syncProductToReadDb,
} from "@/config/productsApi";
import { isBackendConnected } from "@/lib/supabaseClient";
import type {
  AiBatchCreateResponse,
  AiBatchDisplayItem,
  AiBatchDisplayStatus,
  AiBatchItem,
  AiBatchItemStatus,
  AiBatchOverallStatus,
  AiBatchProgressResponse,
  AiBatchRetryResponse,
  AiBatchRunListResponse,
  AiBatchScheduleDetailResponse,
  AiBatchScheduleListResponse,
} from "@/pages/products/types";

// 中継（gas-ai-batch-relay）が扱うaction名。GAS/契約と一致させる。
export const AI_BATCH_ACTIONS = {
  create: "create_ai_product_draft_batch",
  get: "get_ai_product_draft_batch",
  retry: "retry_ai_product_draft_batch",
  // AI解析に使う画像（Drive file_id）の保存・指定解除（空配列）。
  saveSelectedImages: "save_product_ai_selected_images",
} as const;

// 概算原価への最低上乗せ率の既定値（30% = 下限価格は原価 × 1.30）。
// GAS v103 契約: 0 < min_cost_markup_rate <= 5.0
export const DEFAULT_MIN_COST_MARKUP_RATE = 0.3;
export const MIN_COST_MARKUP_RATE_EXCLUSIVE_MIN = 0;
export const MIN_COST_MARKUP_RATE_MAX = 5.0;

// 価格根拠の種別（GAS v103）。原価上乗せ下限を採用した場合の price_basis。
export const PRICE_BASIS_COST_MARKUP_FLOOR = "cost_markup_floor";

/** price_basis が「原価上乗せ下限」かどうか。 */
export function isCostMarkupFloorBasis(basis?: string | null): boolean {
  return (basis ?? "").trim() === PRICE_BASIS_COST_MARKUP_FLOOR;
}

// AI解析に使う画像の最大枚数（サーバー・GASと一致）
export const MAX_AI_ANALYSIS_IMAGES = 3;

// Cloud Run + Supabase キュー移行後: 1リクエストあたり最大500件（旧20件上限は撤廃）
export const MAX_AI_BATCH_SIZE = 500;

// 進捗取得の間隔（約5秒）。開始前の予約状態は15秒間隔で確認する。
export const AI_BATCH_POLL_INTERVAL_MS = 5000;
export const AI_SCHEDULE_IDLE_POLL_INTERVAL_MS = 15000;

// 復元したバッチ状態を追跡する上限（受付から24時間）。
// これを超えた保存状態は、サーバー側に残っていても復元しない。
export const AI_BATCH_STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// 進捗取得の連続失敗がこの回数を超えたら「状態不明」として扱う（約5秒×30＝約2分半）。
// 状態不明でもポーリングは継続し、成功すれば通常表示に戻す。
export const AI_BATCH_MAX_CONSECUTIVE_POLL_FAILURES = 30;

/**
 * 進捗取得（get）で「再送しても結果が変わらない確定エラー」の error_code。
 *
 * 保存済み batch_id / schedule_id がサーバーに存在しない場合や、
 * 権限・入力の不足で取得自体が成立しない場合は、ポーリングを続けても
 * 状態は変わらないため、追跡を終了してローカルの保存状態を破棄する。
 * ここに無いコード（HTTP 5xx・タイムアウト・未知コード）は一時的エラーとして扱う。
 */
const DEFINITIVE_BATCH_POLL_ERROR_CODES: ReadonlySet<string> = new Set([
  "BATCH_NOT_FOUND",
  "BATCH_ID_REQUIRED",
  "SCHEDULE_NOT_FOUND",
  "SCHEDULE_ID_REQUIRED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "UNAUTHORIZED_ADMIN_ACCESS",
]);

/**
 * 進捗取得のエラーが「追跡を終了してよい確定エラー」かどうか。
 * 通信断・タイムアウト・HTTP 5xx は素の Error（error_code なし）で届くため false になる。
 */
export function isDefinitiveBatchPollError(err: unknown): boolean {
  if (!(err instanceof AiRelayError)) return false;
  return DEFINITIVE_BATCH_POLL_ERROR_CODES.has((err.code ?? "").trim());
}

// バッチ全体ステータスの表示ラベル
export const AI_BATCH_STATUS_LABELS: Record<AiBatchOverallStatus, string> = {
  scheduled: "予約済み",
  starting: "開始処理中",
  dispatch_retry: "開始再試行待ち",
  queued: "受付済み",
  processing: "処理中",
  completed: "全件反映完了",
  partially_failed: "一部失敗",
  failed: "失敗",
  cancelled: "予約取消済み",
};

const TERMINAL_BATCH_STATUSES: AiBatchOverallStatus[] = [
  "completed",
  "partially_failed",
  "failed",
  "cancelled",
];

// 完了後は定期取得を停止する判定
export function isTerminalBatchStatus(
  status: AiBatchOverallStatus | null | undefined
): boolean {
  return status != null && TERMINAL_BATCH_STATUSES.includes(status);
}

const ITEM_STATUSES: AiBatchItemStatus[] = [
  "pending",
  "processing",
  "completed",
  "failed",
  "excluded",
  "cancelled",
];

// 契約外の値が来ても「成功」と誤認しない。想定外は pending として保持する。
export function normalizeBatchItemStatus(value: unknown): AiBatchItemStatus {
  const s = typeof value === "string" ? value : "";
  return (ITEM_STATUSES as string[]).includes(s)
    ? (s as AiBatchItemStatus)
    : "pending";
}

// 商品別の表示ステータスを導出する。
// 「再試行待ち」は契約に無いキーを使わず、pending かつ retry_count>0 から導く。
export function deriveAiBatchDisplayStatus(item: {
  status: AiBatchItemStatus;
  retry_count: number;
  error_code?: string | null;
}): AiBatchDisplayStatus {
  if (item.status === "excluded") return "excluded";
  if (item.status === "cancelled") return "cancelled";
  // GAS 契約外応答: status:"completed" と error_code が同時に返るケース。
  if (item.status === "completed" && item.error_code) {
    return "contract_violation";
  }
  if (item.status === "pending" && item.retry_count > 0) return "retry_wait";
  if (item.status === "pending") return "pending";
  if (item.status === "processing") return "processing";
  if (item.status === "completed") return "success";
  return "failed";
}

/**
 * status:"completed" と error_code が同時に返る「GAS 契約外応答」かどうか。
 * 契約 3.2 では completed は成功（error_code なし）を意味するため、この組み合わせは契約外。
 */
export function isGasContractViolation(item: {
  status: AiBatchItemStatus;
  error_code?: string | null;
}): boolean {
  return item.status === "completed" && Boolean(item.error_code);
}

/**
 * 契約外応答（status:"completed" かつ error_code）を記録する（同一商品は一度だけ）。
 *
 * 画面上は成功表示を防ぐが、GAS 側の status は completed のため、
 * GAS の retry 対象に含まれるとは限らない。後から追跡できるよう、
 * 商品ID・error_code・error_message を残す。バックエンドへは送らない（フロント内の記録）。
 */
export function recordGasContractViolations(
  items: AiBatchDisplayItem[],
  seen: Set<string>
): void {
  items.forEach((item) => {
    if (!isGasContractViolation(item)) return;
    if (seen.has(item.product_id)) return;
    seen.add(item.product_id);
    try {
      console.warn("[AI_BATCH_CONTRACT_VIOLATION]", {
        product_id: item.product_id,
        item_status: item.status,
        error_code: item.error_code,
        error_message: item.error_message,
        note:
          "status:completed と error_code が同時に返る契約外応答。成功表示は行わないが、GAS側は completed のため retry 対象に含まれない可能性がある。",
      });
    } catch {
      // 記録に失敗しても処理は継続する
    }
  });
}

/**
 * 商品別エラーの分かりやすい説明を返す（error_code は呼び出し側で必ず併記する）。
 * 検索付き生成で報告された失敗カテゴリ（検索未実行・参照元なし・MAX_TOKENS・429 等）を
 * 日本語で説明する。分類できないコードは API の message をそのまま使う。
 */
export function explainAiBatchError(
  code?: string | null,
  message?: string | null
): string {
  const upper = (code ?? "").trim().toUpperCase();
  if (upper) {
    if (upper === "PUBLISHED_PRODUCT_NOT_ALLOWED") {
      return message || "公開済み（または非公開）商品のため対象外になりました。";
    }
    if (upper === "INACTIVE_PRODUCT_NOT_ALLOWED") {
      return message || "アーカイブ済み商品のため対象外になりました。";
    }
    if (upper === "SQUARE_LINKED_PRODUCT_NOT_ALLOWED") {
      return message || "Square連携済み商品のため対象外になりました。";
    }
    if (upper === "NO_IMAGES_FOUND") {
      return message || "商品画像が0枚のため対象外になりました。";
    }
    if (upper === "SELECTED_IMAGE_DELETED" || upper === "IMAGE_COUNT_EXCEEDED") {
      return message || "選択されていたAI解析用画像が不整合となったため対象外になりました。";
    }
    if (upper === "PRODUCT_NOT_FOUND") {
      return message || "商品が見つからないため対象外になりました。";
    }
    if (upper === "NON_TEST_PRODUCT_INCLUDED" || upper === "TEST_PRODUCT_INCLUDED") {
      return message || "動作モード（通常／テスト）と一致しないため対象外になりました。";
    }
    if (upper === "PRODUCT_ALREADY_IN_ACTIVE_AI_BATCH") {
      return (
        message ||
        "別のAI一括生成ジョブで予約中または処理待ち・処理中のため対象外になりました。"
      );
    }
    if (upper === "CONFIRMED_DRAFT_EXISTS") {
      return "すでに確定済みのAI下書きが存在するため再生成しませんでした。再生成する場合は確認画面で「生成済みのAI下書きがある商品も再生成する」を選択して実行してください。";
    }
    if (upper === "PRODUCT_COST_FETCH_FAILED") {
      return message || "確定済み仕入原価の取得に失敗したため、安全のため生成を中断しました。";
    }
    if (upper.includes("MAX_TOKENS") || upper.includes("MAX_OUTPUT")) {
      return "生成内容が長すぎて上限（MAX_TOKENS）に達し、出力が完了しませんでした。時間をおいて「失敗のみ再実行」してください。";
    }
    if (
      upper.includes("429") ||
      upper.includes("RATE") ||
      upper.includes("RESOURCE_EXHAUSTED") ||
      upper.includes("QUOTA")
    ) {
      return "APIの利用制限（429 / レート制限）に達しました。時間をおいて「失敗のみ再実行」してください。";
    }
    if (upper.includes("EMPTY_RESPONSE")) {
      return "生成モデルから本文が空の応答が返りました（Stage A の応答が空）。画像・商品情報を確認し、時間をおいて「失敗のみ再実行」してください。";
    }
    if (
      upper.includes("SOURCE") ||
      upper.includes("REFERENCE") ||
      upper.includes("NO_GROUNDING")
    ) {
      return "検索は行われましたが、参考にできる参照元（出典）が見つかりませんでした。画像・商品情報を確認して再実行してください。";
    }
    if (upper.includes("SEARCH") || upper.includes("GROUNDING")) {
      return "画像からの生成に必要な検索（グラウンディング）が実行できませんでした。もう一度「失敗のみ再実行」してください。";
    }
  }
  if (message) return message;
  return "生成に失敗しました。時間をおいて「失敗のみ再実行」してください。";
}

// =============================================================================
// 日本時間（JST / UTC+09:00 固定）日時ユーティリティ
// OSのタイムゾーン設定に関わらず、常に入力・表示を日本時間（Asia/Tokyo）として扱う。
// =============================================================================
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * ISO文字列（またはDate）を「YYYY/MM/DD(曜) HH:mm（日本時間）」で整形する。
 */
export function formatJstDateTime(
  value?: string | Date | null,
  options?: { withSuffix?: boolean }
): string {
  if (!value) return "";
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(ms)) return "";
  const jst = new Date(ms + JST_OFFSET_MS);
  const yyyy = jst.getUTCFullYear();
  const mm = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(jst.getUTCDate()).padStart(2, "0");
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const min = String(jst.getUTCMinutes()).padStart(2, "0");
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const wd = weekdays[jst.getUTCDay()] ?? "";
  const suffix = options?.withSuffix === false ? "" : "（日本時間）";
  return `${yyyy}/${mm}/${dd}(${wd}) ${hh}:${min}${suffix}`;
}

/**
 * 指定ミリ秒を `<input type="datetime-local">` 用の日本時間文字列 `YYYY-MM-DDTHH:mm` に変換する。
 */
export function toJstDateTimeLocalValue(ms: number): string {
  const jst = new Date(ms + JST_OFFSET_MS);
  const yyyy = jst.getUTCFullYear();
  const mm = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(jst.getUTCDate()).padStart(2, "0");
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const min = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

/**
 * 初期値として現在時刻の30分後（5分単位切り上げ）の日本時間 `YYYY-MM-DDTHH:mm` を返す。
 */
export function buildDefaultJstDateTimeLocal(now = new Date()): string {
  const stepMs = 5 * 60 * 1000;
  const rounded = Math.ceil((now.getTime() + 30 * 60 * 1000) / stepMs) * stepMs;
  return toJstDateTimeLocalValue(rounded);
}

/**
 * よく使う予約時刻プリセット（日本時間）を生成する。
 */
export function buildPresetJstDateTimeLocal(
  preset: "in_10m" | "tonight_23" | "next_02",
  now = new Date()
): string {
  const nowMs = now.getTime();
  if (preset === "in_10m") {
    const stepMs = 60 * 1000;
    return toJstDateTimeLocalValue(Math.ceil((nowMs + 10 * 60 * 1000) / stepMs) * stepMs);
  }
  const jstNow = new Date(nowMs + JST_OFFSET_MS);
  const y = jstNow.getUTCFullYear();
  const m = jstNow.getUTCMonth();
  const d = jstNow.getUTCDate();

  if (preset === "tonight_23") {
    let targetUtcMs = Date.UTC(y, m, d, 23, 0, 0) - JST_OFFSET_MS;
    if (targetUtcMs <= nowMs + 60 * 1000) {
      targetUtcMs += 24 * 60 * 60 * 1000;
    }
    return toJstDateTimeLocalValue(targetUtcMs);
  }

  // preset === "next_02": 次の午前02:00（JST）
  let target02UtcMs = Date.UTC(y, m, d, 2, 0, 0) - JST_OFFSET_MS;
  if (target02UtcMs <= nowMs + 60 * 1000) {
    target02UtcMs += 24 * 60 * 60 * 1000;
  }
  return toJstDateTimeLocalValue(target02UtcMs);
}

/**
 * `<input type="datetime-local">` の入力値（`YYYY-MM-DDTHH:mm`）を常に日本時間（+09:00）として解釈し、
 * UTC ISO文字列へ変換する。過去日時の場合はエラー理由も返す。
 */
export function parseJstDateTimeLocalToIso(
  rawValue: string,
  now = new Date()
): { iso: string | null; error: string } {
  const trimmed = (rawValue ?? "").trim();
  if (!trimmed) {
    return { iso: null, error: "開始日時（日本時間）を入力してください。" };
  }
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return { iso: null, error: "開始日時の形式が正しくありません。" };
  }
  const sec = match[3] ?? "00";
  const parsedMs = Date.parse(`${match[1]}T${match[2]}:${sec}+09:00`);
  if (!Number.isFinite(parsedMs)) {
    return { iso: null, error: "有効な開始日時を入力してください。" };
  }
  if (parsedMs < now.getTime() - 60 * 1000) {
    return {
      iso: null,
      error: "開始日時は現在以降の日時（日本時間）を指定してください。",
    };
  }
  return { iso: new Date(parsedMs).toISOString(), error: "" };
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

// 受付前に発行する冪等キー。通信失敗による同じ受付の再送で再利用する。
export function createRequestId(prefix = "REQ_BATCH"): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    // フォールバックへ
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function parseCloudRunBatchJson<T>(
  response: Response
): Promise<
  | (T & {
      success?: boolean;
      error?: string;
      message?: string;
      error_code?: string;
    })
  | null
> {
  try {
    const text = await response.text();
    if (!text) return null;
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function assertBackendConnectedForBatch(): void {
  if (!isBackendConnected()) {
    throw new Error(
      "バックエンド（Readdy Backend / SaaS Supabase）に接続されていません。管理者に接続を依頼してください。"
    );
  }
}

/**
 * 一括生成の受付。batch_id を即時返却する（非同期受付）。
 * 応答の success / batch_id を確認できない場合は成功扱いにしない。
 */
export async function createAiProductDraftBatch(params: {
  requestId: string;
  productIds: string[];
  forceRegenerate?: boolean;
  // 概算原価への最低上乗せ率（0より大きく5.0以下の小数）。未指定は 0.30（30%）。
  minCostMarkupRate?: number;
  // テスト実行モード: true の場合、対象IDがすべて is_test=true でなければサーバーが受付前に拒否する。
  testOnly?: boolean;
}): Promise<AiBatchCreateResponse> {
  const body: Record<string, unknown> = {
    action: AI_BATCH_ACTIONS.create,
    request_id: params.requestId,
    product_ids: params.productIds,
    min_cost_markup_rate:
      params.minCostMarkupRate ?? DEFAULT_MIN_COST_MARKUP_RATE,
  };
  if (params.forceRegenerate !== undefined) {
    body.force_regenerate = params.forceRegenerate;
  }
  if (params.testOnly === true) {
    body.test_only = true;
  }
  // product_costs は送らない。原価はサーバー側が確定済み照合（documents-relay）から取得する
  // （ブラウザ送信値を原価の正本として採用しない）。
  // model_name は送らない。モデルの選択は常にサーバー既定に委ねる。

  if (!PRODUCTS_READ_API_URL) {
    const data = await invokeAiRelay<AiBatchCreateResponse>(
      body,
      AI_BATCH_RELAY_FUNCTION_NAME
    );
    if (!data || data.success !== true || !asString(data.batch_id)) {
      const info = extractRelayError(data, "一括AI生成の受付に失敗しました。");
      throw new AiRelayError(info.message, info.code);
    }
    return data;
  }

  assertBackendConnectedForBatch();
  const response = await createProductAiDraftBatchViaApi(body);
  const data = await parseCloudRunBatchJson<AiBatchCreateResponse>(response);
  if (!data) {
    throw new Error(
      `一括AI生成の受付応答を取得できませんでした (HTTP ${response.status})。`
    );
  }
  if (!response.ok || data.success !== true || !asString(data.batch_id)) {
    const info = extractRelayError(data, "一括AI生成の受付に失敗しました。");
    throw new AiRelayError(info.message, info.code);
  }
  return data;
}

/**
 * バッチの進捗・結果取得。API取得失敗は成功として扱わず例外を投げる。
 */
export async function getAiProductDraftBatch(
  batchId: string,
  testOnly?: boolean
): Promise<AiBatchProgressResponse> {
  if (!PRODUCTS_READ_API_URL) {
    const data = await invokeAiRelay<AiBatchProgressResponse>(
      {
        action: AI_BATCH_ACTIONS.get,
        batch_id: batchId,
      },
      AI_BATCH_RELAY_FUNCTION_NAME
    );
    if (!data || data.success !== true) {
      const info = extractRelayError(
        data,
        "一括AI生成の進捗を取得できませんでした。"
      );
      throw new AiRelayError(info.message, info.code);
    }
    return data;
  }

  assertBackendConnectedForBatch();
  const response = await getProductAiDraftBatchViaApi(batchId, testOnly);
  const data = await parseCloudRunBatchJson<AiBatchProgressResponse>(response);
  if (!data) {
    throw new Error(
      `一括AI生成の進捗を取得できませんでした (HTTP ${response.status})。`
    );
  }
  if (!response.ok || data.success !== true) {
    const info = extractRelayError(
      data,
      "一括AI生成の進捗を取得できませんでした。"
    );
    throw new AiRelayError(info.message, info.code);
  }
  return data;
}

/**
 * 失敗分のみ再実行。成功（completed）済み商品は再生成されない。
 * 契約 2.3: request_id は冪等性キー。同一 request_id の再送は再試行を重複登録せず
 * 初回応答（is_reused:true）を返す。応答を受け取れなかった再送では同じ request_id を使う。
 * 失敗商品が無い場合は success:false / NO_FAILED_ITEMS を返す（成功ではない）。
 */
export async function retryAiProductDraftBatch(params: {
  batchId: string;
  requestId: string;
}): Promise<AiBatchRetryResponse> {
  if (!PRODUCTS_READ_API_URL) {
    const data = await invokeAiRelay<AiBatchRetryResponse>(
      {
        action: AI_BATCH_ACTIONS.retry,
        batch_id: params.batchId,
        request_id: params.requestId,
      },
      AI_BATCH_RELAY_FUNCTION_NAME
    );
    if (!data) {
      throw new Error(
        "失敗分の再実行の応答を取得できませんでした。時間をおいて再度お試しください。"
      );
    }
    if (data.success !== true) {
      const info = extractRelayError(data, "失敗分の再実行に失敗しました。");
      throw new AiRelayError(info.message, info.code);
    }
    return data;
  }

  assertBackendConnectedForBatch();
  const response = await retryProductAiDraftBatchViaApi(params.batchId, {
    request_id: params.requestId,
  });
  const data = await parseCloudRunBatchJson<AiBatchRetryResponse>(response);
  if (!data) {
    throw new Error(
      "失敗分の再実行の応答を取得できませんでした。時間をおいて再度お試しください。"
    );
  }
  if (!response.ok || data.success !== true) {
    if (response.status >= 500 && !data.error_code) {
      throw new Error(
        data.message ||
          data.error ||
          `失敗分の再実行に失敗しました (HTTP ${response.status})。`
      );
    }
    const info = extractRelayError(data, "失敗分の再実行に失敗しました。");
    throw new AiRelayError(info.message, info.code);
  }
  return data;
}

/**
 * 「受付されなかったことが確定できる」応答の error_code。
 * 受付前に弾かれる検証・原価取得エラーと、再試行対象が無いエラーだけを列挙する。
 * これらは retry が登録されていないことが確定しているため、request_id を破棄してよい。
 *
 * 一覧に無いコード（未知コード・判定不能なエラー）は「受付済みか判断できない」ため保持する。
 */
const DEFINITIVE_REJECTION_CODES: ReadonlySet<string> = new Set([
  // retry 固有：失敗商品なし／対象バッチなし（＝再試行は登録されていない）
  "NO_FAILED_ITEMS",
  "BATCH_NOT_FOUND",
  // 受付前の入力・認証・確定原価解決バリデーション（＝キュー更新に到達していない）
  "BATCH_ID_REQUIRED",
  "REQUEST_ID_REQUIRED",
  "PRODUCT_COST_FETCH_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "UNAUTHORIZED_ADMIN_ACCESS",
  "NON_TEST_PRODUCT_INCLUDED",
  "TEST_PRODUCT_INCLUDED",
  "PRODUCT_NOT_FOUND",
  "PRODUCT_ALREADY_IN_ACTIVE_AI_BATCH",
  "INVALID_TEST_ONLY_FLAG",
  "INVALID_FORCE_REGENERATE_FLAG",
  "INVALID_PRODUCT_IDS",
  "INVALID_SCHEDULED_AT",
  "SCHEDULED_AT_IN_PAST",
  "SCHEDULE_NOT_FOUND",
  "SCHEDULE_ALREADY_STARTED",
  "BATCH_SIZE_EXCEEDED",
  "INVALID_MIN_COST_MARKUP_RATE",
]);

export type RetryFailureClass = "definitive_rejection" | "unknown";

export function classifyRetryFailure(err: unknown): RetryFailureClass {
  if (!(err instanceof AiRelayError)) return "unknown";
  const code = err.code ?? "";
  return DEFINITIVE_REJECTION_CODES.has(code)
    ? "definitive_rejection"
    : "unknown";
}

/**
 * AI解析に使う画像（Drive の file_id）を保存する（POST /products/:productId/ai-selected-images）。
 * 空配列 [] は指定解除。成功（success:true）を確認できない場合は例外にする
 * （保存されたように扱って生成を進めないため）。
 */
export async function saveProductAiSelectedImages(params: {
  productId: string;
  selectedImageIds: string[];
}): Promise<void> {
  if (params.selectedImageIds.length > MAX_AI_ANALYSIS_IMAGES) {
    throw new AiRelayError(
      `AI解析に使う画像は最大${MAX_AI_ANALYSIS_IMAGES}枚です。`,
      "TOO_MANY_SELECTED_IMAGES"
    );
  }
  if (!PRODUCTS_READ_API_URL) {
    const data = await invokeAiRelay<Record<string, unknown>>(
      {
        action: AI_BATCH_ACTIONS.saveSelectedImages,
        product_id: params.productId,
        selected_image_ids: params.selectedImageIds,
      },
      AI_BATCH_RELAY_FUNCTION_NAME
    );
    if (!data || data.success !== true) {
      const info = extractRelayError(
        data as { error?: string; message?: string; error_code?: string } | null,
        "AI解析用画像の保存に失敗しました。"
      );
      throw new AiRelayError(info.message, info.code);
    }
    await syncProductToReadDb(params.productId);
    return;
  }

  if (!isBackendConnected()) {
    throw new Error(
      "バックエンド（Readdy Backend / SaaS Supabase）に接続されていません。管理者に接続を依頼してください。"
    );
  }
  const response = await saveProductAiSelectedImagesViaApi(
    params.productId,
    params.selectedImageIds
  );
  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(await response.text()) as Record<string, unknown>;
  } catch {
    data = null;
  }
  if (!response.ok && (!data || data.success === undefined)) {
    throw new Error(`AI解析用画像の保存に失敗しました (HTTP ${response.status})。`);
  }
  if (!data || data.success !== true) {
    const info = extractRelayError(
      data as { error?: string; message?: string; error_code?: string } | null,
      "AI解析用画像の保存に失敗しました。"
    );
    throw new AiRelayError(info.message, info.code);
  }
  markDraftProductSyncedInSession(params.productId);
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 契約の items[] を画面表示用アイテムへ変換する。
 * product_name はサーバー返却値または受付時に保持した名前マップから復元する。
 */
export function toAiBatchDisplayItems(
  apiItems: AiBatchItem[] | undefined,
  previous: AiBatchDisplayItem[] | null,
  nameMap: Record<string, string>
): AiBatchDisplayItem[] {
  const prevMap = new Map(
    (previous ?? []).map((item) => [item.product_id, item])
  );
  return (apiItems ?? []).map((api) => {
    const productId = asString(api.product_id);
    const prev = prevMap.get(productId);
    const apiName = api.product_name ? asString(api.product_name).trim() : "";
    return {
      product_id: productId,
      product_name:
        apiName || nameMap[productId] || prev?.product_name || productId,
      status: normalizeBatchItemStatus(api.status),
      retry_count:
        typeof api.retry_count === "number" ? api.retry_count : 0,
      error_code: api.error_code ? asString(api.error_code) : null,
      error_message: api.error_message ? asString(api.error_message) : null,
      draft_id: api.draft_id ? asString(api.draft_id) : null,
      draft_version:
        typeof api.draft_version === "number" ? api.draft_version : null,
      proposed_price: asNumberOrNull(api.proposed_price),
      price_note: api.price_note ? asString(api.price_note) : null,
      price_basis: api.price_basis ? asString(api.price_basis) : null,
    };
  });
}

/**
 * 日時指定のAI一括生成予約を作成する（選択済み商品IDを固定保存）。
 */
export async function createAiBatchSchedule(params: {
  requestId: string;
  scheduledAtIso: string;
  productIds: string[];
  productNames?: Record<string, string>;
  minCostMarkupRate?: number;
  testOnly?: boolean;
  forceRegenerate?: boolean;
}): Promise<AiBatchScheduleDetailResponse> {
  if (!PRODUCTS_READ_API_URL) {
    throw new Error(
      "予約機能を利用するには Cloud Run 商品API（VITE_PRODUCTS_READ_API_URL）の設定が必要です。"
    );
  }
  assertBackendConnectedForBatch();

  const body: Record<string, unknown> = {
    request_id: params.requestId,
    scheduled_at: params.scheduledAtIso,
    product_ids: params.productIds,
    min_cost_markup_rate:
      params.minCostMarkupRate ?? DEFAULT_MIN_COST_MARKUP_RATE,
    test_only: params.testOnly === true,
  };
  if (params.forceRegenerate !== undefined) {
    body.force_regenerate = params.forceRegenerate;
  }
  if (params.productNames) {
    body.product_names = params.productNames;
  }

  const response = await createAiBatchScheduleViaApi(body);
  const data =
    await parseCloudRunBatchJson<AiBatchScheduleDetailResponse>(response);
  if (!data) {
    throw new Error(
      `AI一括生成の予約応答を取得できませんでした (HTTP ${response.status})。`
    );
  }
  if (!response.ok || data.success !== true || !asString(data.schedule_id)) {
    const info = extractRelayError(data, "AI一括生成の予約に失敗しました。");
    throw new AiRelayError(info.message, info.code);
  }
  return data;
}

/**
 * 即時実行・日時指定予約の両方を含む統合ジョブ一覧を取得する（マルチデバイス進捗・結果表示用）。
 */
export async function listAiBatchRuns(params: {
  testOnly?: boolean;
  limit?: number;
}): Promise<AiBatchRunListResponse> {
  if (!PRODUCTS_READ_API_URL || !isBackendConnected()) {
    return {
      success: true,
      test_only: params.testOnly === true,
      count: 0,
      runs: [],
    };
  }
  const response = await listAiBatchRunsViaApi(params);
  const data =
    await parseCloudRunBatchJson<AiBatchRunListResponse>(response);
  if (!data || !response.ok || data.success !== true) {
    const info = extractRelayError(
      data,
      "AI一括生成の実行履歴・予約一覧を取得できませんでした。"
    );
    throw new AiRelayError(info.message, info.code);
  }
  return data;
}

/**
 * サーバー側に保存されている予約一覧・進捗サマリーを取得する（ブラウザ再起動後の復元用）。
 */
export async function listAiBatchSchedules(params: {
  testOnly?: boolean;
  limit?: number;
}): Promise<AiBatchScheduleListResponse> {
  if (!PRODUCTS_READ_API_URL || !isBackendConnected()) {
    return {
      success: true,
      test_only: params.testOnly === true,
      count: 0,
      schedules: [],
    };
  }
  const response = await listAiBatchSchedulesViaApi(params);
  const data =
    await parseCloudRunBatchJson<AiBatchScheduleListResponse>(response);
  if (!data || !response.ok || data.success !== true) {
    const info = extractRelayError(
      data,
      "AI一括生成の予約一覧を取得できませんでした。"
    );
    throw new AiRelayError(info.message, info.code);
  }
  return data;
}

/**
 * 単一のAI一括生成予約の詳細・除外商品・商品別結果を取得する。
 */
export async function getAiBatchSchedule(
  scheduleId: string,
  testOnly?: boolean
): Promise<AiBatchScheduleDetailResponse> {
  if (!PRODUCTS_READ_API_URL) {
    throw new Error(
      "予約詳細を取得するには Cloud Run 商品APIの設定が必要です。"
    );
  }
  assertBackendConnectedForBatch();
  const response = await getAiBatchScheduleViaApi(scheduleId, testOnly);
  const data =
    await parseCloudRunBatchJson<AiBatchScheduleDetailResponse>(response);
  if (!data) {
    throw new Error(
      `AI一括生成の予約詳細を取得できませんでした (HTTP ${response.status})。`
    );
  }
  if (!response.ok || data.success !== true) {
    const info = extractRelayError(
      data,
      "AI一括生成の予約詳細を取得できませんでした。"
    );
    throw new AiRelayError(info.message, info.code);
  }
  return data;
}

/**
 * 開始前のAI一括生成予約を取り消す。
 */
export async function cancelAiBatchSchedule(
  scheduleId: string,
  testOnly?: boolean
): Promise<AiBatchScheduleDetailResponse> {
  if (!PRODUCTS_READ_API_URL) {
    throw new Error(
      "予約を取り消すには Cloud Run 商品APIの設定が必要です。"
    );
  }
  assertBackendConnectedForBatch();
  const response = await cancelAiBatchScheduleViaApi(scheduleId, testOnly);
  const data =
    await parseCloudRunBatchJson<AiBatchScheduleDetailResponse>(response);
  if (!data) {
    throw new Error(
      `予約取消の応答を取得できませんでした (HTTP ${response.status})。`
    );
  }
  if (!response.ok || data.success !== true) {
    const info = extractRelayError(data, "予約の取り消しに失敗しました。");
    throw new AiRelayError(info.message, info.code);
  }
  return data;
}
