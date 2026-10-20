// Drive Inbox 一括取込の表示用モデル。
//
// ここには「画面表示に必要な型と導出」だけを置く。
// 通信（Cloud Run Job の起動・結果取得）は lib/driveInboxBatchApi.ts に分離し、
// 画面用APIとしての実測確認が完了するまで通信しない。

// ファイル単位の状態（画面用APIの応答をこの6値に写像する）。
export type DriveInboxFileStatus =
  | "pending"
  | "processing"
  | "processed"
  | "needs_review"
  | "failed"
  | "skipped";

// バッチ全体の状態。
export type DriveInboxBatchStatus =
  | "queued"
  | "running"
  | "completed"
  | "partially_failed"
  | "failed"
  | "unknown";

export interface DriveInboxFileResult {
  file_id: string;
  file_name: string;
  // 原本が現在置かれているDriveフォルダ（01_inbox / 02_processed / 03_flagged など）
  folder?: string;
  // 画面用APIが返す状態
  status: DriveInboxFileStatus;
  // 失敗理由（failed のときのみ意味を持つ）
  error_reason?: string;
  // 台帳に登録された書類ID（処理済みのときのみ）
  document_id?: string;
  updated_at?: string;
}

export interface DriveInboxBatch {
  batch_id: string;
  status: DriveInboxBatchStatus;
  total_count: number;
  files: DriveInboxFileResult[];
  // 実測で進捗率が取得できた場合のみ数値が入る。取得できない場合は null。
  progress_percent?: number | null;
  started_at?: string;
  updated_at?: string;
}

// 画面の取得状態（ブラウザ内に進捗を保持しないため、毎回この状態から始まる）。
export type DriveInboxLoadState =
  | "loading"
  | "success"
  | "unavailable"
  | "error";

export const DRIVE_INBOX_STATUS_LABELS: Record<
  DriveInboxFileStatus,
  string
> = {
  pending: "未処理",
  processing: "処理中",
  processed: "処理済み",
  needs_review: "要確認",
  failed: "失敗",
  skipped: "スキップ",
};

export const DRIVE_INBOX_STATUS_ICONS: Record<DriveInboxFileStatus, string> = {
  pending: "ri-time-line",
  processing: "ri-loader-4-line",
  processed: "ri-checkbox-circle-line",
  needs_review: "ri-flag-line",
  failed: "ri-error-warning-line",
  skipped: "ri-skip-forward-line",
};

export const DRIVE_INBOX_BATCH_STATUS_LABELS: Record<
  DriveInboxBatchStatus,
  string
> = {
  queued: "開始待ち",
  running: "処理中",
  completed: "完了",
  partially_failed: "一部失敗",
  failed: "失敗",
  unknown: "状態不明",
};

// 03_flagged に移動済みのファイル（DBの status が pending_amount のままでも要確認とする）。
const FLAGGED_FOLDER_PATTERN = /03[_\-\s]?flagged/i;

export function isFlaggedFolder(folder?: string): boolean {
  return FLAGGED_FOLDER_PATTERN.test(folder ?? "");
}

/**
 * ファイルの表示状態を決める。
 *
 * フォルダが 03_flagged なら、DBの status が pending_amount のままでも「要確認」を優先する。
 * それ以外は画面用APIが返した状態をそのまま使う（推測で補完しない）。
 */
export function resolveDriveInboxFileStatus(
  file: DriveInboxFileResult
): DriveInboxFileStatus {
  if (isFlaggedFolder(file.folder)) return "needs_review";
  return file.status;
}

export interface DriveInboxStatusCounts {
  total: number;
  pending: number;
  processing: number;
  processed: number;
  needs_review: number;
  failed: number;
  skipped: number;
}

// 件数は実際に取得できたファイル結果だけを数える（ダミー補完はしない）。
export function countDriveInboxStatuses(
  files: DriveInboxFileResult[]
): DriveInboxStatusCounts {
  const counts: DriveInboxStatusCounts = {
    total: files.length,
    pending: 0,
    processing: 0,
    processed: 0,
    needs_review: 0,
    failed: 0,
    skipped: 0,
  };
  for (const file of files) {
    counts[resolveDriveInboxFileStatus(file)] += 1;
  }
  return counts;
}

// バッチがまだ動いているか（結果の再取得が必要か）。
export function isDriveInboxBatchRunning(
  batch: DriveInboxBatch | null
): boolean {
  if (!batch) return false;
  return batch.status === "queued" || batch.status === "running";
}

/**
 * 進捗率。画面用APIが 0〜100 の実数値を返したときだけ採用する。
 * 取得できない場合は null（不確定バー表示）。時間経過で増やす演出はしない。
 */
export function resolveDriveInboxProgress(
  batch: DriveInboxBatch | null
): number | null {
  const raw = batch?.progress_percent;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw < 0 || raw > 100) return null;
  return Math.round(raw);
}