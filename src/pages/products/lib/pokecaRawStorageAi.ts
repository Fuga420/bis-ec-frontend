import { PRODUCTS_READ_API_URL } from "@/config/productsApi";
import { getBackendWriteAuthHeaders } from "@/lib/supabaseClient";
import { getAdminReadHeaders, notifyAdminUnauthorized } from "@/lib/adminAuth";

/**
 * ライト版（旧裏ストレージ向け）AI生成の Cloud Run API 接続。
 *
 * - 開始: POST /pokeca-raw-storage-ai/run（product_ids / background / is_test）… 書込認証
 * - 進捗: GET  /pokeca-raw-storage-ai/status の worker_state … 管理読み取り認証（X-Admin-Password）
 *
 * 通常版（/ai-batches）とは別のジョブとして扱う。
 * status は一覧取得と同じ管理読み取り認証が必須（書込認証では401になる）。
 */

export const POKECA_LIGHT_RUN_PATH = "/pokeca-raw-storage-ai/run";
export const POKECA_LIGHT_STATUS_PATH = "/pokeca-raw-storage-ai/status";

export type PokecaLightJobStatus = "idle" | "running" | "completed" | "failed";

export interface PokecaLightFailure {
  product_id: string;
  product_name?: string;
  error_code?: string;
  error_message: string;
}

export interface PokecaLightProductInfo {
  product_id: string;
  product_name?: string;
  status: string;
  /** 読み取ったカード名（取得できない場合は空文字） */
  cardName: string;
  /** 読み取ったカード番号（取得できない場合は空文字） */
  cardNumber: string;
  /** 読み取ったイラストレーター（取得できない場合は空文字） */
  illustrator: string;
  /** 参考価格（取得できない場合は null） */
  candidatePrice: number | null;
  errorMessage?: string;
}

export interface PokecaLightIllustratorCount {
  illustrator: string;
  count: number;
}

export interface PokecaLightWorkerState {
  /** 実行時のテストモード（画面モードと一致する実行だけを表示する） */
  isTest: boolean;
  /**
   * worker_state.active（実行中フラグ）。
   * status 文字列を返さない応答では、この値だけで実行中を判定する。
   */
  isActive: boolean;
  status: PokecaLightJobStatus;
  /** 生のステータス文字列（表示の補助） */
  rawStatus: string;
  totalCount: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  productIds: string[];
  failures: PokecaLightFailure[];
  /** 商品別の読み取り結果（card_name / card_number / illustrator / candidate_price） */
  items: PokecaLightProductInfo[];
  /**
   * 価格が取得できた件数（worker_state の集計値 price_found_count）。
   * 商品別の items[] が返らない応答では、この集計値で整備状況を表示する。
   */
  priceFoundCount: number | null;
  /**
   * 作家別件数（worker_state の集計値 illustrator_counts）。
   * illustrator_counts はオブジェクト（名前→件数）でも配列でも受ける。
   */
  illustratorCounts: PokecaLightIllustratorCount[];
  jobId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string | null;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** 複数の項目名候補から非負の整数を取り出す（APIの命名ゆれを吸収する）。 */
function pickCount(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed));
    }
  }
  return null;
}

/** 小数点を含む数値（参考価格など）を取り出す。 */
function pickNumberValue(
  obj: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value.replace(/[^0-9.\-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function pickFirstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(obj[key]).trim();
    if (value) return value;
  }
  return null;
}

function pickFirstStringWithFallback(
  sources: Record<string, unknown>[],
  keys: string[]
): string | null {
  for (const source of sources) {
    const value = pickFirstString(source, keys);
    if (value) return value;
  }
  return null;
}

function pickBoolean(obj: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

const FAILURE_ARRAY_KEYS = ["failed_items", "failures", "errors", "failed_products"];

function normalizeFailure(entry: unknown): PokecaLightFailure | null {
  const obj = asObject(entry);
  if (!obj) return null;
  const productId =
    pickFirstString(obj, ["product_id", "productId", "id"]) ?? "";
  const errorCode = pickFirstString(obj, ["error_code", "code"]);
  const errorMessage =
    pickFirstString(obj, [
      "error_message",
      "message",
      "error",
      "reason",
      "detail",
    ]) ?? "";
  if (!productId && !errorMessage && !errorCode) return null;
  return {
    product_id: productId,
    product_name: pickFirstString(obj, ["product_name", "name"]) ?? undefined,
    error_code: errorCode ?? undefined,
    error_message: errorMessage || errorCode || "失敗",
  };
}

function normalizeFailures(obj: Record<string, unknown>): PokecaLightFailure[] {
  const result: PokecaLightFailure[] = [];
  FAILURE_ARRAY_KEYS.forEach((key) => {
    const list = obj[key];
    if (!Array.isArray(list)) return;
    list.forEach((entry) => {
      const failure = normalizeFailure(entry);
      if (failure) result.push(failure);
    });
  });

  // items[] 形式（status が failed / error のもの）にも対応する
  const items = obj.items;
  if (Array.isArray(items)) {
    items.forEach((entry) => {
      const item = asObject(entry);
      if (!item) return;
      const status = asString(item.status).toLowerCase();
      if (status !== "failed" && status !== "error") return;
      const failure = normalizeFailure(item);
      if (failure) result.push(failure);
    });
  }

  // 同じ商品の重複を除く（先に見つかったものを優先）
  const seen = new Set<string>();
  return result.filter((failure) => {
    const key = failure.product_id || failure.error_message;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const ITEM_ARRAY_KEYS = ["items", "products", "results", "targets"];

function normalizeProductInfo(entry: unknown): PokecaLightProductInfo | null {
  const obj = asObject(entry);
  if (!obj) return null;
  const productId =
    pickFirstString(obj, ["product_id", "productId", "id"]) ?? "";
  if (!productId) return null;

  // カード情報が入れ子（card / ai / result）で返る場合にも対応する
  const nestedKeys = ["card", "ai", "result", "generated", "draft"];
  const nested: Record<string, unknown>[] = [obj];
  nestedKeys.forEach((key) => {
    const child = asObject(obj[key]);
    if (child) nested.push(child);
  });

  const readString = (keys: string[]): string => {
    for (const source of nested) {
      const value = pickFirstString(source, keys);
      if (value) return value;
    }
    return "";
  };
  const readNumber = (keys: string[]): number | null => {
    for (const source of nested) {
      const value = pickNumberValue(source, keys);
      if (value !== null) return value;
    }
    return null;
  };

  return {
    product_id: productId,
    product_name:
      pickFirstString(obj, ["product_name", "name", "title"]) ?? undefined,
    status: asString(obj.status ?? obj.state).trim().toLowerCase(),
    cardName: readString(["card_name", "cardName", "card"]),
    cardNumber: readString([
      "card_number",
      "cardNumber",
      "collector_number",
      "number",
    ]),
    illustrator: readString([
      "illustrator",
      "illustrator_name",
      "artist",
      "illustratorName",
    ]),
    candidatePrice: readNumber([
      "candidate_price",
      "candidatePrice",
      "proposed_price",
      "suggested_price",
      "price",
    ]),
    errorMessage:
      pickFirstString(obj, ["error_message", "message", "error", "reason"]) ??
      undefined,
  };
}

function normalizeProductInfos(
  obj: Record<string, unknown>
): PokecaLightProductInfo[] {
  const result: PokecaLightProductInfo[] = [];
  const seen = new Set<string>();
  ITEM_ARRAY_KEYS.forEach((key) => {
    const list = obj[key];
    if (!Array.isArray(list)) return;
    list.forEach((entry) => {
      const info = normalizeProductInfo(entry);
      if (!info || seen.has(info.product_id)) return;
      seen.add(info.product_id);
      result.push(info);
    });
  });
  return result;
}

function resolveStatus(
  obj: Record<string, unknown>,
  counts: {
    total: number;
    processed: number;
    failed: number;
    attempted: number | null;
  },
  isActive: boolean,
  finishedAt: string | null
): PokecaLightJobStatus {
  const raw = (
    pickFirstString(obj, ["status", "worker_status", "state", "phase"]) ?? ""
  ).toLowerCase();
  const isRunning = pickBoolean(obj, ["is_running", "running"]);
  const isFinished = pickBoolean(obj, ["is_finished", "finished"]);

  const settled: PokecaLightJobStatus =
    counts.failed > 0 ? "failed" : "completed";

  // 1) worker_state.active が唯一の実行中シグナルの応答があるため最優先で扱う
  if (isActive) return "running";

  // 2) ジョブ生命周期の完了合図を、件数推定より先に判定する。
  //    processed_count は「下書きができた商品数」で、スキップされた商品が
  //    常に target との差として残るため、件数比較では完了にならない。
  //    - active が false かつ finished_at が設定済み → 終了
  //    - attempted_count が target_count に到達 → 全件試行済み（終了）
  if (finishedAt) return settled;
  if (isFinished === true) return settled;
  if (
    counts.total > 0 &&
    counts.attempted !== null &&
    counts.attempted >= counts.total
  ) {
    return settled;
  }

  if (isRunning === true) return "running";
  if (raw === "running" || raw === "processing" || raw === "in_progress") {
    return "running";
  }
  if (raw === "failed" || raw === "error") return "failed";
  if (
    raw === "completed" ||
    raw === "done" ||
    raw === "finished" ||
    raw === "success" ||
    raw === "succeeded"
  ) {
    return settled;
  }
  // 3) 生命周期の合図が無い応答向けのフォールバック（件数から推定）
  if (counts.total > 0 && counts.processed >= counts.total) {
    return settled;
  }
  if (counts.total > 0) return "running";
  return "idle";
}

/** illustrator_counts（オブジェクト形式・配列形式の両方）を配列に正規化する。 */
function parseIllustratorCounts(value: unknown): PokecaLightIllustratorCount[] {
  const result: PokecaLightIllustratorCount[] = [];
  const pushEntry = (name: unknown, count: unknown) => {
    const label = asString(name).trim();
    if (!label) return;
    const parsed =
      typeof count === "number"
        ? count
        : Number(asString(count).replace(/[^0-9.\-]/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    result.push({ illustrator: label, count: Math.trunc(parsed) });
  };

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      const obj = asObject(entry);
      if (!obj) return;
      pushEntry(
        obj.illustrator ?? obj.name ?? obj.artist,
        obj.count ?? obj.value ?? obj.total
      );
    });
  } else {
    const obj = asObject(value);
    if (obj) {
      Object.keys(obj).forEach((key) => pushEntry(key, obj[key]));
    }
  }

  return result.sort(
    (a, b) => b.count - a.count || a.illustrator.localeCompare(b.illustrator)
  );
}

/**
 * worker_state を画面表示用に正規化する（ジョブが無い場合は null）。
 *
 * status 応答の集計値（processed_count / total_target_products / price_found_count /
 * illustrator_counts など）は worker_state の外（応答トップレベル）に置かれる場合がある。
 * worker_state 側に同名の項目が無いときだけ、aggregateFallbacks から補う。
 * worker_state.items は最大500件までしか返らないため、集計は items ではなくこの値から作る。
 */
export function normalizePokecaLightWorkerState(
  value: unknown,
  aggregateFallbacks?: unknown[]
): PokecaLightWorkerState | null {
  const obj = asObject(value);
  if (!obj) return null;

  const fallbackSources = (Array.isArray(aggregateFallbacks) ? aggregateFallbacks : [])
    .map((source) => asObject(source))
    .filter((source): source is Record<string, unknown> => source !== null)
    .filter((source) => source !== obj);

  /** worker_state に値が無いときだけ、トップレベルの値を返す。 */
  const pickBooleanWithFallback = (keys: string[]): boolean | null => {
    const local = pickBoolean(obj, keys);
    if (local !== null) return local;
    for (const source of fallbackSources) {
      const value = pickBoolean(source, keys);
      if (value !== null) return value;
    }
    return null;
  };

  const isActive =
    pickBooleanWithFallback(["active", "is_active", "worker_active"]) === true;

  /** worker_state に値が無いときだけ、トップレベルの集計値を返す。 */
  const pickCountWithFallback = (keys: string[]): number | null => {
    const local = pickCount(obj, keys);
    if (local !== null) return local;
    for (const source of fallbackSources) {
      const value = pickCount(source, keys);
      if (value !== null) return value;
    }
    return null;
  };

  const total =
    pickCountWithFallback([
      "total_target_products",
      "total_target_products_count",
      "total_count",
      "total",
      "target_count",
      "product_count",
      "target_total",
    ]) ?? 0;
  const processed =
    pickCountWithFallback([
      "processed_count",
      "processed",
      "done_count",
      "finished_count",
    ]) ?? null;
  const success =
    pickCount(obj, [
      "success_count",
      "succeeded_count",
      "completed_count",
      "success",
    ]) ?? 0;
  const failed =
    pickCount(obj, ["failed_count", "failure_count", "failed", "error_count"]) ?? 0;
  const skipped =
    pickCount(obj, ["skipped_count", "skipped", "skip_count"]) ?? 0;

  // 生命周期の合図（未試行のまま残っている商品を件数差として扱わないために使う）
  const attempted =
    pickCountWithFallback([
      "attempted_count",
      "attempted",
      "tried_count",
      "processed_target_count",
    ]) ?? null;
  const finishedAt = pickFirstStringWithFallback(
    [obj, ...fallbackSources],
    ["finished_at", "completed_at", "end_at"]
  );

  const failures = normalizeFailures(obj);
  const resolvedProcessed =
    processed ?? Math.min(total, success + failed + skipped);

  // 商品別の items[] が返らない応答向けの集計値（worker_state に無ければトップレベルから補う）
  const priceFoundCount = pickCountWithFallback([
    "price_found_count",
    "priced_count",
    "price_count",
    "candidate_price_count",
  ]);
  let illustratorCounts = parseIllustratorCounts(
    obj.illustrator_counts ?? obj.illustrators ?? obj.illustrator_breakdown
  );
  if (illustratorCounts.length === 0) {
    for (const source of fallbackSources) {
      const parsed = parseIllustratorCounts(
        source.illustrator_counts ?? source.illustrators ?? source.illustrator_breakdown
      );
      if (parsed.length > 0) {
        illustratorCounts = parsed;
        break;
      }
    }
  }

  const status = resolveStatus(
    obj,
    {
      total,
      processed: resolvedProcessed,
      failed,
      attempted,
    },
    isActive,
    finishedAt
  );

  // 実行予定も結果も無い空の状態は「ジョブなし」として扱う
  const hasAnySignal =
    isActive ||
    total > 0 ||
    resolvedProcessed > 0 ||
    success > 0 ||
    failed > 0 ||
    skipped > 0 ||
    failures.length > 0 ||
    priceFoundCount !== null ||
    illustratorCounts.length > 0 ||
    attempted !== null ||
    finishedAt !== null ||
    pickFirstString(obj, ["job_id", "run_id", "worker_id", "id"]) !== null ||
    status !== "idle";
  if (!hasAnySignal) return null;

  const productIds = Array.isArray(obj.product_ids)
    ? obj.product_ids
        .map((id) => asString(id).trim())
        .filter((id) => id !== "")
    : [];

  return {
    isTest: pickBooleanWithFallback(["is_test", "test_mode"]) === true,
    isActive,
    status,
    rawStatus:
      pickFirstString(obj, ["status", "worker_status", "state", "phase"]) ?? "",
    totalCount: total,
    processedCount: resolvedProcessed,
    successCount: success,
    failedCount: failed,
    skippedCount: skipped,
    productIds,
    failures,
    items: normalizeProductInfos(obj),
    priceFoundCount,
    illustratorCounts,
    jobId: pickFirstString(obj, ["job_id", "run_id", "worker_id", "id"]),
    startedAt: pickFirstString(obj, ["started_at", "start_at"]),
    finishedAt,
    updatedAt: pickFirstString(obj, ["updated_at", "last_updated_at"]),
  };
}

function extractMessage(data: Record<string, unknown> | null): string {
  if (!data) return "";
  const direct = asString(data.message ?? data.error ?? data.detail).trim();
  if (direct) return direct;
  const meta = asObject(data.meta);
  if (meta) {
    const nested = asString(meta.message ?? meta.detail).trim();
    if (nested) return nested;
  }
  return "";
}

async function parseJsonObject(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const text = await response.text();
    if (!text) return null;
    const parsed = JSON.parse(text);
    return asObject(parsed);
  } catch {
    return null;
  }
}

/**
 * 応答から worker_state の実体を取り出す。
 * `{worker_state:{...}}` / `{worker:{...}}` / `{data:{worker_state:{...}}}` /
 * 応答自体が worker_state の項目を持つフラット形式のいずれも受け付ける。
 */
function pickWorkerStatePayload(
  data: Record<string, unknown> | null
): unknown {
  if (!data) return null;
  const direct = data.worker_state ?? data.worker;
  if (direct !== undefined && direct !== null) return direct;
  const nested = asObject(data.data);
  if (nested) {
    const nestedState = nested.worker_state ?? nested.worker;
    if (nestedState !== undefined && nestedState !== null) return nestedState;
    // data の中身がそのまま worker_state の項目を持つ場合
    if (
      nested.active !== undefined ||
      nested.processed_count !== undefined ||
      nested.total_target_products !== undefined
    ) {
      return nested;
    }
  }
  return data;
}

/**
 * 応答から、worker_state の外側にある集計値の入れ物を集める。
 * `{...集計値, worker_state:{...}}` と `{data:{...集計値, worker_state:{...}}}` の両方に対応する。
 */
function buildAggregateFallbacks(
  data: Record<string, unknown> | null
): Record<string, unknown>[] {
  const sources: Record<string, unknown>[] = [];
  if (!data) return sources;
  sources.push(data);
  const nested = asObject(data.data);
  if (nested) sources.push(nested);
  return sources;
}

export interface PokecaLightRunResult {
  alreadyRunning: boolean;
  workerState: PokecaLightWorkerState | null;
  message: string;
}

/**
 * ライト版の開始（即時・バックグラウンド実行のみ）。
 * 応答の success を確認できない場合は成功扱いにしない。
 */
export async function runPokecaLight(params: {
  productIds: string[];
  isTest: boolean;
}): Promise<PokecaLightRunResult> {
  const authHeaders = await getBackendWriteAuthHeaders();
  const response = await fetch(`${PRODUCTS_READ_API_URL}${POKECA_LIGHT_RUN_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...authHeaders,
    },
    body: JSON.stringify({
      product_ids: params.productIds,
      background: true,
      is_test: params.isTest,
    }),
  });

  const data = await parseJsonObject(response);
  const message = extractMessage(data);

  if (!response.ok) {
    throw new Error(
      message || `ライト版の開始に失敗しました (HTTP ${response.status})。`
    );
  }
  if (!data || data.success !== true) {
    throw new Error(message || "ライト版の開始に失敗しました。");
  }

  return {
    alreadyRunning: data.already_running === true,
    workerState: normalizePokecaLightWorkerState(
      pickWorkerStatePayload(data),
      buildAggregateFallbacks(data)
    ),
    message,
  };
}

export interface PokecaLightStatusResult {
  workerState: PokecaLightWorkerState | null;
  message: string;
}

/**
 * ライト版の進捗取得（worker_state）。
 * 失敗を成功扱いにせず例外にする（呼び出し側は最後に取得できた状態を保持する）。
 */
export async function fetchPokecaLightStatus(): Promise<PokecaLightStatusResult> {
  // status は管理読み取りAPI。一覧取得と同じ X-Admin-Password で認証する。
  const response = await fetch(
    `${PRODUCTS_READ_API_URL}${POKECA_LIGHT_STATUS_PATH}`,
    {
      method: "GET",
      headers: { ...getAdminReadHeaders() },
    }
  );

  // 401 は「ジョブが無い」ではなく認証失敗。保持を消してロック画面へ戻す。
  if (response.status === 401) {
    notifyAdminUnauthorized();
  }

  const data = await parseJsonObject(response);
  const message = extractMessage(data);

  if (!response.ok) {
    throw new Error(
      message || `ライト版の進捗を取得できませんでした (HTTP ${response.status})。`
    );
  }
  if (data && data.success === false) {
    throw new Error(message || "ライト版の進捗を取得できませんでした。");
  }

  return {
    workerState: normalizePokecaLightWorkerState(
      pickWorkerStatePayload(data),
      buildAggregateFallbacks(data)
    ),
    message,
  };
}