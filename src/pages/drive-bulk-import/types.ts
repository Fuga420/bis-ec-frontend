/**
 * Drive一括取込（Cloud Run Job）の画面用の型。
 *
 * バックエンドは products-api に追加された
 *   GET  /drive-bulk-imports/profiles
 *   POST /drive-bulk-imports/dry-runs
 *   POST /drive-bulk-imports
 *   GET  /drive-bulk-imports/:runId
 * を利用する。応答項目名の細かな揺れは API アダプタ側で吸収する。
 */

export interface DriveBulkImportProfile {
  profileId: string;
  description: string;
  /** プロファイル既定の取り込みルートフォルダID（空のこともある） */
  rootFolderId: string;
}

export type DriveBulkImportStatus = "running" | "succeeded" | "failed" | "unknown";

/** ドライラン結果（検出・登録済み・登録対象・失敗）の件数。不明な項目は null。 */
export interface DriveBulkImportCounts {
  /** 検出総数 */
  detected: number | null;
  /** 登録済み合計 */
  registered: number | null;
  /** 登録済み（active） */
  registeredActive: number | null;
  /** 登録済み（archived） */
  registeredArchived: number | null;
  /** 登録対象件数 */
  target: number | null;
  /** 失敗件数 */
  failed: number | null;
}

export interface DriveBulkImportFailure {
  /** 対象キー（ファイルID・ファイル名など） */
  key: string;
  /** 失敗理由 */
  reason: string;
}

export interface DriveBulkImportRun {
  runId: string;
  status: DriveBulkImportStatus;
  /** 応答に含まれる生のステータス文字列（表示の補助） */
  rawStatus: string;
  /** ドライランかどうか */
  dryRun: boolean;
  profileId: string;
  totalCount: number;
  processedCount: number;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  counts: DriveBulkImportCounts;
  failures: DriveBulkImportFailure[];
  message: string;
  createdAt: string | null;
  finishedAt: string | null;
}

/** ドライラン・本実行の開始時に送る条件。 */
export interface DriveBulkImportRequest {
  profileId: string;
  /** 空ならプロファイル既定のフォルダを使う */
  folderId?: string;
  isTest: boolean;
  includeArchived?: boolean;
  /** 対象を絞るフィルタ（ポケカは箱番など） */
  subfolder?: string;
}