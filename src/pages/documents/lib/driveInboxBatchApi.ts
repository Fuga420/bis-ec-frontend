import type { DriveInboxBatch } from "@/pages/documents/lib/driveInboxBatch";

/**
 * Drive Inbox 一括取込の「画面用API」アダプタ。
 *
 * 重要な前提:
 * - Cloud Run Job の起動APIと結果取得APIは、画面用APIとしての実測確認が完了していない。
 *   そのため本アダプタは通信を行わず、「未接続」を返すだけにしている。
 *   （未配信APIの成功を仮定した表示は行わない）
 * - Gitブランチの driveBatchImportApi.ts は、現行 documents-relay の項目・応答と
 *   一致することを確認できるまで採用しない。したがって本ファイルは別名・別実装。
 * - 既に配信済みの documents-relay には一切触れない。
 * - 実測確認が取れた時点で、下の fetchDriveInboxBatchResult の中身だけを
 *   実際の応答写像に差し替えればよい。
 */

// 画面用APIの実測確認が完了するまで false。
export const DRIVE_INBOX_API_READY: boolean = false;

export const DRIVE_INBOX_API_NOT_READY_REASON =
  "Cloud Run Job の起動API／結果取得APIは、画面用APIとしての実測確認が完了していません。未確認の応答を前提にした件数・結果表示は行いません。";

export type DriveInboxFetchResult =
  | { available: true; batch: DriveInboxBatch }
  | { available: false; reason: string };

/**
 * 一括取込の最新結果を取得する。
 * 画面を開き直したとき・再取得ボタン押下時に、毎回この関数を通す（ブラウザ内に進捗を残さない）。
 */
export async function fetchDriveInboxBatchResult(): Promise<DriveInboxFetchResult> {
  if (DRIVE_INBOX_API_READY !== true) {
    return {
      available: false,
      reason: DRIVE_INBOX_API_NOT_READY_REASON,
    };
  }

  // 実測確認後: 画面用APIの応答を DriveInboxBatch に写像して返す。
  return {
    available: false,
    reason: DRIVE_INBOX_API_NOT_READY_REASON,
  };
}