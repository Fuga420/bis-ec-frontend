import { getSupabaseClient } from "@/lib/supabaseClient";
import type {
  DriveInboxBatch,
  DriveInboxBatchStatus,
  DriveInboxFileResult,
  DriveInboxFileStatus,
  DriveInboxSummaryCounts,
} from "@/pages/documents/lib/driveInboxBatch";

/**
 * Drive Inbox 一括取込の「画面用API」アダプタ。
 *
 * 実測済みの契約:
 * - 起動: action "start_inbox_import"（dry_run: true / false でドライランと通常取込を分ける）
 * - 結果照会: action "get_inbox_import_status"
 *
 * 現時点の制約:
 * - 起動APIは実画面での一連の動作確認が済むまで呼ばない（開始ボタンは無効固定）。
 * - 結果照会の応答には dry_run がまだ含まれていない。そのため「処理済み」を
 *   実保存済みと断定せず、モード未確認として控えめに表示する。
 * - 既に配信済みの documents-relay には一切触れない。
 */

const RELAY_FUNCTION = "documents-batch-relay";
const STATUS_ACTION = "get_inbox_import_status";

// 結果照会は実APIに接続済み。
export const DRIVE_INBOX_RESULT_API_READY: boolean = true;

// 開始は実画面での動作確認が完了するまで無効のまま。
export const DRIVE_INBOX_START_API_READY: boolean = false;

export const DRIVE_INBOX_START_DISABLED_REASON =
  "実画面で一括取込の一連の動作（開始→処理中→完了→要確認/失敗）を確認するまで、「一括取込を開始」は無効です。";

export type DriveInboxFetchResult =
  | { available: true; batch: DriveInboxBatch }
  | { available: false; reason: string };

type RelayRecord = Record<string, unknown>;

function asRecord(value: unknown): RelayRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RelayRecord;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asBoolean(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function normalizeBatchStatus(value: unknown): DriveInboxBatchStatus {
  const s = asString(value).toLowerCase();
  if (["queued", "pending", "accepted", "requested", "started"].includes(s)) {
    return "queued";
  }
  if (["running", "processing", "in_progress", "inprogress"].includes(s)) {
    return "running";
  }
  if (["completed", "complete", "done", "success", "succeeded"].includes(s)) {
    return "completed";
  }
  if (
    ["partially_failed", "partial_failed", "partial", "partially_completed"].includes(
      s
    )
  ) {
    return "partially_failed";
  }
  if (["failed", "error", "aborted"].includes(s)) return "failed";
  return "unknown";
}

function normalizeFileStatus(value: unknown): DriveInboxFileStatus {
  const s = asString(value).toLowerCase();
  if (["processing", "running", "in_progress"].includes(s)) return "processing";
  if (
    [
      "processed",
      "completed",
      "complete",
      "imported",
      "done",
      "success",
      "saved",
    ].includes(s)
  ) {
    return "processed";
  }
  if (
    ["needs_review", "need_review", "review", "flagged", "pending_amount"].includes(
      s
    )
  ) {
    return "needs_review";
  }
  if (["failed", "error"].includes(s)) return "failed";
  if (["skipped", "skip", "ignored"].includes(s)) return "skipped";
  // 未知の値は成功扱いせず、未処理として扱う（勝手に完了にしない）。
  return "pending";
}

// 応答の folders から、DriveのフォルダID→表示名の対応を作る。
const FOLDER_ID_KEYS: Array<[string, string]> = [
  ["inbox_folder_id", "01_inbox"],
  ["processed_folder_id", "02_processed"],
  ["flagged_folder_id", "03_flagged"],
];

function buildFolderLabels(folders: unknown): Record<string, string> {
  const raw = asRecord(folders);
  const labels: Record<string, string> = {};
  if (!raw) return labels;
  for (const [key, label] of FOLDER_ID_KEYS) {
    const id = asString(raw[key]);
    if (id) labels[id] = label;
  }
  return labels;
}

// 応答の summary（件数内訳）を写像する。解釈できない場合は null。
function mapSummary(raw: unknown): DriveInboxSummaryCounts | null {
  const summary = asRecord(raw);
  if (!summary) return null;

  const total = asNumber(
    summary.total_detected ?? summary.total_count ?? summary.total
  );
  const processed = asNumber(summary.processed_count ?? summary.processed);
  const failed = asNumber(summary.error_count ?? summary.failed_count);
  const needsReview = asNumber(
    summary.flagged_count ?? summary.needs_review_count
  );
  const skipped = asNumber(summary.skipped_count);
  const processing = asNumber(
    summary.processing_count ?? summary.in_progress_count
  );

  if (
    total === null &&
    processed === null &&
    failed === null &&
    needsReview === null &&
    skipped === null &&
    processing === null
  ) {
    return null;
  }

  return {
    total,
    processing,
    processed,
    needs_review: needsReview,
    failed,
    skipped,
  };
}

function mapFile(
  raw: RelayRecord,
  index: number,
  folderLabels: Record<string, string>
): DriveInboxFileResult {
  const fileId =
    asString(raw.file_id ?? raw.fileId ?? raw.id ?? raw.drive_file_id) ||
    `unknown-${index}`;
  const rawFolder = asString(
    raw.folder ??
      raw.drive_folder ??
      raw.folder_name ??
      raw.folder_id ??
      raw.drive_folder_id ??
      raw.destination
  );
  const folder = rawFolder ? folderLabels[rawFolder] ?? rawFolder : undefined;
  const errorReason =
    asString(
      raw.error_reason ??
        raw.error_message ??
        raw.reason ??
        raw.error ??
        raw.failure_reason
    ) || undefined;
  const documentId =
    asString(raw.document_id ?? raw.documentId ?? raw.ledger_document_id) ||
    undefined;
  const updatedAt =
    asString(raw.updated_at ?? raw.updatedAt ?? raw.processed_at ?? raw.finished_at) ||
    undefined;

  return {
    file_id: fileId,
    file_name:
      asString(raw.file_name ?? raw.fileName ?? raw.name ?? raw.filename) ||
      "（ファイル名なし）",
    folder,
    status: normalizeFileStatus(
      raw.status ?? raw.result_status ?? raw.state ?? raw.result
    ),
    error_reason: errorReason,
    document_id: documentId,
    updated_at: updatedAt,
    document_id_source: documentId ? "api" : undefined,
  };
}

/**
 * 応答を画面用の DriveInboxBatch に写像する。
 * 解釈できない応答は null（成功と仮定して表示しない）。
 *
 * 配信済み documents-batch-relay の実際の形:
 *   { success, action, current_job: { job_id, execution_name, status, runner,
 *     message, result_status, started_at, finished_at,
 *     summary: { total_detected, processed_count, error_count, flagged_count, skipped_count },
 *     file_results: [...] }, folders: {...}, document_ledger_summary: {...} }
 *
 * 注意: 応答内の document_ledger_summary は全件と一致しない（先頭20件での集計）ため
 * 台帳サマリーには使わない。台帳の全件集計は documents-relay の全ページ取得で行う。
 */
function mapBatch(payload: unknown): DriveInboxBatch | null {
  const root = asRecord(payload);
  if (!root) return null;

  if (root.success === false) {
    throw new Error(
      asString(root.message ?? root.reason ?? root.error) ||
        "一括取込の状態を取得できませんでした。"
    );
  }

  // 実応答は current_job 配下にジョブ情報が入る。
  const body =
    asRecord(root.current_job) ??
    asRecord(root.batch) ??
    asRecord(root.result) ??
    asRecord(root.data) ??
    root;

  const folderLabels = buildFolderLabels(root.folders);

  const filesRaw =
    body.file_results ??
    body.items ??
    body.files ??
    body.results ??
    root.file_results ??
    root.items ??
    root.files;
  const files = Array.isArray(filesRaw)
    ? filesRaw
        .map((item) => asRecord(item))
        .filter((item): item is RelayRecord => item !== null)
        .map((item, index) => mapFile(item, index, folderLabels))
    : [];

  const batchId = asString(
    body.job_id ??
      body.execution_name ??
      body.batch_id ??
      body.batchId ??
      body.jobId ??
      root.batch_id ??
      root.job_id
  );
  const status = normalizeBatchStatus(body.status ?? body.state ?? root.status);
  const summary = mapSummary(body.summary ?? root.summary);
  const total =
    asNumber(body.total_count ?? body.total ?? body.file_count ?? body.total_files) ??
    summary?.total ??
    null;
  const progress = asNumber(
    body.progress_percent ?? body.progress ?? body.percent ?? body.percentage
  );
  const dryRun =
    asBoolean(body.dry_run) ??
    asBoolean(root.dry_run) ??
    asBoolean(body.is_dry_run) ??
    asBoolean(root.is_dry_run);

  // 何も解釈できない応答は「取得できていない」扱いにする。
  if (!batchId && status === "unknown" && files.length === 0 && !summary) {
    return null;
  }

  return {
    batch_id: batchId,
    status,
    total_count: total ?? files.length,
    files,
    // 0〜100 の実値が返ったときだけ採用する（それ以外は不確定バー）。
    progress_percent:
      progress !== null && progress >= 0 && progress <= 100 ? progress : null,
    dry_run: dryRun,
    started_at:
      asString(body.started_at ?? body.created_at ?? root.started_at) || undefined,
    updated_at:
      asString(body.finished_at ?? body.updated_at ?? root.updated_at) || undefined,
    summary,
    job_message: asString(body.message ?? root.message) || undefined,
    runner: asString(body.runner ?? root.runner) || undefined,
    folder_labels: folderLabels,
  };
}

/**
 * 一括取込の最新結果を取得する（get_inbox_import_status）。
 * 画面を開き直したとき・再取得ボタン押下時に、毎回この関数を通す。
 * ブラウザ内に進捗を保持しない。
 */
export async function fetchDriveInboxBatchResult(): Promise<DriveInboxFetchResult> {
  if (DRIVE_INBOX_RESULT_API_READY !== true) {
    return {
      available: false,
      reason: "一括取込の結果照会APIはまだ接続されていません。",
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      available: false,
      reason: "バックエンドに接続されていません。",
    };
  }

  const { data, error } = await client.functions.invoke(RELAY_FUNCTION, {
    body: { action: STATUS_ACTION },
  });

  if (error) {
    const context = (error as { context?: Response }).context;
    let message = error.message || "一括取込の結果照会に失敗しました。";
    if (context && typeof context.json === "function") {
      try {
        const payload = (await context.json()) as RelayRecord;
        message =
          asString(payload.message) || asString(payload.error) || message;
      } catch {
        // 応答本文が読めない場合は既定メッセージを使う。
      }
    }
    throw new Error(message);
  }

  const batch = mapBatch(data);
  if (!batch) {
    return {
      available: false,
      reason:
        "結果照会の応答を解釈できませんでした。応答形式が確定するまで、推測で件数・結果を表示しません。",
    };
  }

  return { available: true, batch };
}