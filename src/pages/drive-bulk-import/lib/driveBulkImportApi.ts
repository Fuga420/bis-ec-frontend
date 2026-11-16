import { PRODUCTS_READ_API_URL } from "@/config/productsApi";
import { getBackendWriteAuthHeaders } from "@/lib/supabaseClient";
import type {
  DriveBulkImportCounts,
  DriveBulkImportFailure,
  DriveBulkImportProfile,
  DriveBulkImportRequest,
  DriveBulkImportRun,
  DriveBulkImportStatus,
} from "@/pages/drive-bulk-import/types";

/**
 * Drive一括取込 API（products-api）のアダプタ。
 *
 * - 認証は既存の書き込み系エンドポイントと同じ方式（getBackendWriteAuthHeaders）を使う。
 *   ジョブ実行は強い操作のため、独自の弱い経路は作らない。
 * - 応答に含まれる項目名の揺れはここで吸収し、画面側は正規化済みの型だけを扱う。
 */

const BASE_PATH = "/drive-bulk-imports";

export class DriveBulkImportApiError extends Error {
  readonly status: number;

  readonly code: string;

  constructor(message: string, status: number, code = "") {
    super(message);
    this.name = "DriveBulkImportApiError";
    this.status = status;
    this.code = code;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function pickString(
  source: Record<string, unknown> | null,
  keys: string[]
): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = asString(source[key]).trim();
    if (value) return value;
  }
  return null;
}

function toCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed));
  }
  return null;
}

function pickCount(
  sources: Array<Record<string, unknown> | null>,
  keys: string[]
): number | null {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = toCount(source[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function pickBoolean(
  sources: Array<Record<string, unknown> | null>,
  keys: string[]
): boolean | null {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "boolean") return value;
      if (value === "true") return true;
      if (value === "false") return false;
    }
  }
  return null;
}

function extractMessage(payload: Record<string, unknown> | null): string {
  if (!payload) return "";
  const direct = asString(
    payload.message ?? payload.error ?? payload.detail ?? payload.reason
  ).trim();
  if (direct) return direct;
  const meta = asRecord(payload.meta);
  if (meta) {
    const nested = asString(meta.message ?? meta.detail).trim();
    if (nested) return nested;
  }
  return "";
}

function extractCode(payload: Record<string, unknown> | null): string {
  if (!payload) return "";
  const direct = asString(
    payload.error_code ?? payload.code ?? payload.errorCode
  ).trim();
  if (direct) return direct;
  const meta = asRecord(payload.meta);
  if (meta) return asString(meta.code ?? meta.error_code).trim();
  return "";
}

async function requestJson(
  path: string,
  options: { method: "GET" | "POST"; body?: unknown }
): Promise<unknown> {
  const authHeaders = await getBackendWriteAuthHeaders();
  const response = await fetch(`${PRODUCTS_READ_API_URL}${path}`, {
    method: options.method,
    headers: {
      ...(options.body !== undefined
        ? { "Content-Type": "application/json; charset=utf-8" }
        : {}),
      ...authHeaders,
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  const record = asRecord(payload);

  if (!response.ok) {
    throw new DriveBulkImportApiError(
      extractMessage(record) ||
        `APIエラーが発生しました（HTTP ${response.status}）。`,
      response.status,
      extractCode(record)
    );
  }

  if (payload === null) {
    throw new DriveBulkImportApiError(
      "APIの応答を読み取れませんでした。",
      response.status
    );
  }

  if (record && record.success === false) {
    throw new DriveBulkImportApiError(
      extractMessage(record) || "処理を受け付けられませんでした。",
      response.status,
      extractCode(record)
    );
  }

  return payload;
}

function buildRequestBody(input: DriveBulkImportRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    profile_id: input.profileId,
    is_test: input.isTest,
  };
  if (input.folderId) body.folder_id = input.folderId;
  if (typeof input.includeArchived === "boolean") {
    body.include_archived = input.includeArchived;
  }
  if (input.subfolder) body.subfolder = input.subfolder;
  return body;
}

/** プロファイル一覧（profile_id / 説明 / 既定フォルダ）を取得する。 */
export async function fetchDriveBulkImportProfiles(): Promise<
  DriveBulkImportProfile[]
> {
  const payload = await requestJson(`${BASE_PATH}/profiles`, { method: "GET" });
  const root = asRecord(payload);
  if (!root) {
    throw new DriveBulkImportApiError(
      "プロファイル一覧の応答を解釈できませんでした。",
      200
    );
  }

  const candidates: unknown[] = [root.profiles, root.items, root.data, payload];
  let list: unknown[] = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      list = candidate;
      break;
    }
    const record = asRecord(candidate);
    if (record) {
      const nested = record.profiles ?? record.items ?? record.list;
      if (Array.isArray(nested)) {
        list = nested;
        break;
      }
    }
  }

  return list
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) return null;
      const profileId = pickString(record, [
        "profile_id",
        "profileId",
        "id",
        "key",
        "slug",
      ]);
      if (!profileId) return null;
      return {
        profileId,
        description:
          pickString(record, ["description", "label", "name", "title"]) ??
          profileId,
        rootFolderId:
          pickString(record, [
            "root_folder_id",
            "default_root_folder_id",
            "default_folder_id",
            "folder_id",
          ]) ?? "",
      };
    })
    .filter((profile): profile is DriveBulkImportProfile => profile !== null);
}

const FAILURE_KEYS = ["failures", "failed_items", "failure_list", "errors", "failed"];

function normalizeFailure(entry: unknown): DriveBulkImportFailure | null {
  if (typeof entry === "string") {
    const reason = entry.trim();
    return reason ? { key: "", reason } : null;
  }
  const record = asRecord(entry);
  if (!record) return null;
  const key =
    pickString(record, [
      "target_key",
      "file_id",
      "file_name",
      "drive_file_id",
      "name",
      "key",
      "product_key",
      "web_view_link",
    ]) ?? "";
  const reason =
    pickString(record, [
      "reason",
      "error_message",
      "message",
      "detail",
      "error",
      "failure_reason",
    ]) ?? "";
  if (!key && !reason) return null;
  return { key, reason: reason || "失敗" };
}

function collectFailures(
  sources: Array<Record<string, unknown> | null>
): DriveBulkImportFailure[] {
  const collected: DriveBulkImportFailure[] = [];
  sources.forEach((source) => {
    if (!source) return;
    FAILURE_KEYS.forEach((key) => {
      const list = source[key];
      if (!Array.isArray(list)) return;
      list.forEach((entry) => {
        const failure = normalizeFailure(entry);
        if (failure) collected.push(failure);
      });
    });
  });

  const seen = new Set<string>();
  return collected.filter((failure) => {
    const key = `${failure.key}::${failure.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveStatus(
  raw: string,
  source: Record<string, unknown> | null
): DriveBulkImportStatus {
  const value = raw.toLowerCase();
  if (
    [
      "running",
      "processing",
      "in_progress",
      "inprogress",
      "started",
      "queued",
      "pending",
      "accepted",
      "requested",
    ].includes(value)
  ) {
    return "running";
  }
  if (
    ["succeeded", "success", "completed", "complete", "done", "finished"].includes(
      value
    )
  ) {
    return "succeeded";
  }
  if (
    ["failed", "error", "aborted", "cancelled", "canceled", "timeout"].includes(
      value
    )
  ) {
    return "failed";
  }
  const finished = pickBoolean([source], ["is_finished", "finished"]);
  if (finished === true) return "succeeded";
  return "unknown";
}

function normalizeCounts(
  sources: Array<Record<string, unknown> | null>
): DriveBulkImportCounts {
  const registeredActive = pickCount(sources, [
    "registered_active_count",
    "active_registered_count",
    "registered_active",
    "active_count",
  ]);
  const registeredArchived = pickCount(sources, [
    "registered_archived_count",
    "archived_registered_count",
    "registered_archived",
    "archived_count",
  ]);
  let registered = pickCount(sources, [
    "registered_count",
    "already_registered_count",
    "registered_total",
    "registered",
  ]);
  if (
    registered === null &&
    (registeredActive !== null || registeredArchived !== null)
  ) {
    registered = (registeredActive ?? 0) + (registeredArchived ?? 0);
  }

  return {
    detected: pickCount(sources, [
      "detected_total",
      "total_detected",
      "detected_count",
      "scanned_count",
      "total_files",
      "total_count",
      "total",
    ]),
    registered,
    registeredActive,
    registeredArchived,
    target: pickCount(sources, [
      "target_count",
      "import_target_count",
      "importable_count",
      "to_import_count",
      "pending_import_count",
      "pending_count",
    ]),
    failed: pickCount(sources, [
      "failed_count",
      "error_count",
      "failure_count",
      "errors_count",
    ]),
  };
}

function normalizeRun(
  payload: unknown,
  fallbackRunId: string,
  fallbackDryRun: boolean
): DriveBulkImportRun {
  const root = asRecord(payload);
  if (!root) {
    throw new DriveBulkImportApiError(
      "実行状態の応答を解釈できませんでした。",
      200
    );
  }

  const source =
    asRecord(root.run) ??
    asRecord(root.job) ??
    asRecord(root.data) ??
    asRecord(root.result) ??
    root;
  const summary = asRecord(source.summary) ?? asRecord(root.summary);
  const counters = asRecord(source.counters);

  const runId =
    pickString(source, ["run_id", "runId", "id", "execution_name"]) ??
    pickString(root, ["run_id", "runId", "id", "execution_name"]) ??
    fallbackRunId;

  if (!runId) {
    throw new DriveBulkImportApiError(
      "実行IDを取得できませんでした。",
      200
    );
  }

  const rawStatus =
    pickString(source, ["status", "state", "run_status", "job_status"]) ?? "";
  const totalCount =
    pickCount([source, counters, summary], [
      "total_count",
      "total",
      "target_count",
    ]) ?? 0;
  const successCount =
    pickCount([source, counters], ["success_count", "succeeded_count", "success"]) ??
    0;
  const skippedCount =
    pickCount([source, counters], ["skipped_count", "skip_count", "skipped"]) ?? 0;
  const failedCount =
    pickCount([source, counters], ["failed_count", "failure_count", "failed"]) ?? 0;
  const processedCount =
    pickCount([source, counters], [
      "processed_count",
      "processed",
      "done_count",
      "finished_count",
    ]) ?? Math.min(totalCount, successCount + skippedCount + failedCount);

  const failures = collectFailures([source, summary]);

  return {
    runId,
    status: resolveStatus(rawStatus, source),
    rawStatus,
    dryRun:
      pickBoolean([source, root], ["dry_run", "is_dry_run"]) ?? fallbackDryRun,
    profileId:
      pickString([source, root], ["profile_id", "profileId", "profile"]) ?? "",
    totalCount,
    processedCount,
    successCount,
    skippedCount,
    failedCount,
    counts: normalizeCounts([summary, source]),
    failures,
    message: pickString(source, ["message", "detail", "summary_message"]) ?? "",
    createdAt:
      pickString(source, ["created_at", "started_at", "start_at"]) ?? null,
    finishedAt:
      pickString(source, ["finished_at", "completed_at", "end_at"]) ?? null,
  };
}

/** ドライランを開始し、受け付けた run_id を返す（列挙に時間がかかるため非同期）。 */
export async function createDriveBulkImportDryRun(
  input: DriveBulkImportRequest
): Promise<DriveBulkImportRun> {
  const payload = await requestJson(`${BASE_PATH}/dry-runs`, {
    method: "POST",
    body: buildRequestBody(input),
  });
  const created = normalizeRun(payload, "", true);
  // 受付応答に状態が含まれない場合は「実行中」として扱い、進捗取得を開始する。
  return created.status === "unknown" ? { ...created, status: "running" } : created;
}

/** 本実行を開始する。同一プロファイルで実行中の場合は 409 が返る。 */
export async function createDriveBulkImportRun(
  input: DriveBulkImportRequest
): Promise<DriveBulkImportRun> {
  const payload = await requestJson(BASE_PATH, {
    method: "POST",
    body: buildRequestBody(input),
  });
  const created = normalizeRun(payload, "", false);
  return created.status === "unknown" ? { ...created, status: "running" } : created;
}

/** 実行状態（進捗カウンタ・終了時サマリ）を取得する。 */
export async function fetchDriveBulkImportRun(
  runId: string
): Promise<DriveBulkImportRun> {
  const payload = await requestJson(
    `${BASE_PATH}/${encodeURIComponent(runId)}`,
    { method: "GET" }
  );
  return normalizeRun(payload, runId, false);
}