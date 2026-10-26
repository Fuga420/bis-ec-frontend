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
  // 書類IDの解決元（api=結果照会が返した値 / ledger=台帳のファイル名一致から確認）
  document_id_source?: "api" | "ledger";
  // 明細数（台帳の集計値。取得できたときのみ）
  line_count?: number;
}

// バッチ全体の集計（結果照会の summary）。取得できない項目は null。
export interface DriveInboxSummaryCounts {
  total: number | null;
  processing: number | null;
  processed: number | null;
  needs_review: number | null;
  failed: number | null;
  skipped: number | null;
}

export interface DriveInboxBatch {
  batch_id: string;
  status: DriveInboxBatchStatus;
  total_count: number;
  files: DriveInboxFileResult[];
  // 実測で進捗率が取得できた場合のみ数値が入る。取得できない場合は null。
  progress_percent?: number | null;
  // 実行モード。true=ドライラン（処理見込み）、false=通常取込（処理済み）。
  // 結果照会の応答に dry_run が無い場合は null（モード未確認）。
  dry_run?: boolean | null;
  started_at?: string;
  updated_at?: string;
  // 結果照会が返す件数内訳（files の件数より優先して表示する）
  summary?: DriveInboxSummaryCounts | null;
  // ジョブ側のメッセージ（例: ジョブ完了（実績取得済み））
  job_message?: string;
  // 実行主体（例: cloud_run_job）
  runner?: string;
  // DriveのフォルダID→表示名（応答の folders から作る）
  folder_labels?: Record<string, string>;
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

// 件数は実際に取得できた結果だけを数える（ダミー補完はしない）。
// 結果照会が summary を返す場合は、その内訳を優先して使う（files が一部しか
// 返らない応答でも件数がずれないようにするため）。
export function countDriveInboxStatuses(
  files: DriveInboxFileResult[],
  summary?: DriveInboxSummaryCounts | null
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

  if (!summary) return counts;

  const pick = (value: number | null | undefined, fallback: number): number =>
    typeof value === "number" ? value : fallback;

  counts.processed = pick(summary.processed, counts.processed);
  counts.needs_review = pick(summary.needs_review, counts.needs_review);
  counts.failed = pick(summary.failed, counts.failed);
  counts.skipped = pick(summary.skipped, counts.skipped);
  // 処理中の件数は summary に無いことがあるので、files から数えた値をそのまま使う。
  counts.processing = pick(summary.processing, counts.processing);
  counts.total = pick(
    summary.total,
    counts.processed + counts.needs_review + counts.failed + counts.skipped
  );
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

/**
 * 「処理済み」の表示ラベル。
 * - 通常取込（dry_run=false）だけ「処理済み」と表示する。
 * - ドライラン（dry_run=true）は「処理見込み」。
 * - モード未確認（null）は実保存済みと断定せず「処理結果」。
 */
export function resolveProcessedLabel(dryRun?: boolean | null): string {
  if (dryRun === true) return "処理見込み";
  if (dryRun === false) return "処理済み";
  return "処理結果";
}

// 実行モードの表示ラベル（モード未確認を明示する）。
export function resolveBatchModeLabel(dryRun?: boolean | null): string {
  if (dryRun === true) return "ドライラン（処理見込み）";
  if (dryRun === false) return "通常取込（処理済み）";
  return "実行モード未確認";
}

// 台帳へ実保存されたと確認できるのは通常取込（dry_run=false）のときだけ。
export function canConfirmSaved(dryRun?: boolean | null): boolean {
  return dryRun === false;
}

// ファイル名の照合用に、フォルダを除いた小文字のベース名を作る。
function normalizeFileName(name: string): string {
  const base = (name || "").split("/").pop() ?? name;
  return base.trim().toLowerCase();
}

// 台帳の書類（照合用に必要な項目だけ）。
export interface DriveInboxLedgerDoc {
  document_id: string;
  file_name: string;
  line_count?: number;
  drive_folder_id?: string;
  drive_file_id?: string;
}

const NO_FILE_NAME = "（ファイル名なし）";

/**
 * ファイル別結果を台帳の情報で補う。
 *
 * 結果照会が document_id を返さない場合でも、ファイル名が台帳の書類と完全一致
 * すれば台帳リンクと明細数を出せる（推測ではなく一致した実データのみ）。
 * 一致しなければ何も足さない。
 */
export function enrichDriveInboxFilesWithLedger(
  files: DriveInboxFileResult[],
  documents: DriveInboxLedgerDoc[],
  folderLabels?: Record<string, string>
): DriveInboxFileResult[] {
  if (documents.length === 0) return files;

  const byId = new Map<string, DriveInboxLedgerDoc>();
  const byName = new Map<string, DriveInboxLedgerDoc>();
  const byDriveId = new Map<string, DriveInboxLedgerDoc>();
  for (const doc of documents) {
    byId.set(doc.document_id, doc);
    const key = normalizeFileName(doc.file_name);
    if (key && !byName.has(key)) byName.set(key, doc);
    if (doc.drive_file_id && !byDriveId.has(doc.drive_file_id)) {
      byDriveId.set(doc.drive_file_id, doc);
    }
  }

  return files.map((file) => {
    const matched =
      (file.document_id ? byId.get(file.document_id) : undefined) ??
      byName.get(normalizeFileName(file.file_name)) ??
      (file.file_id ? byDriveId.get(file.file_id) : undefined);
    if (!matched) return file;

    const folder =
      file.folder ??
      (matched.drive_folder_id && folderLabels
        ? folderLabels[matched.drive_folder_id]
        : undefined);

    return {
      ...file,
      // 結果照会がファイル名を返さない場合は、台帳のファイル名で補う。
      file_name:
        file.file_name && file.file_name !== NO_FILE_NAME
          ? file.file_name
          : matched.file_name,
      folder,
      document_id: file.document_id ?? matched.document_id,
      document_id_source: file.document_id ? "api" : "ledger",
      line_count:
        typeof matched.line_count === "number" ? matched.line_count : file.line_count,
    };
  });
}