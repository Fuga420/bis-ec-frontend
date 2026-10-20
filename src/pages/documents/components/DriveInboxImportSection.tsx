import DriveInboxFileResults from "./DriveInboxFileResults";
import DriveInboxStatusSummary from "./DriveInboxStatusSummary";
import SaveStatusMessage from "@/components/base/SaveStatusMessage";
import { useDriveInboxBatch } from "@/pages/documents/hooks/useDriveInboxBatch";
import { DRIVE_INBOX_API_READY } from "@/pages/documents/lib/driveInboxBatchApi";

function formatDateTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 01_inbox のPDFをまとめて取り込む領域。
 *
 * スタッフは商品ごと・書類ごとに操作しない想定。
 * - 起動ボタンは、Cloud Run Job の起動API／結果取得APIが
 *   画面用APIとして実測確認できるまで無効のまま固定する。
 * - 結果はブラウザ内に保持せず、画面を開き直すたびにサーバーから取得し直す。
 */
export default function DriveInboxImportSection() {
  const {
    state,
    batch,
    counts,
    running,
    progressPercent,
    message,
    isRefreshing,
    refresh,
  } = useDriveInboxBatch();

  // 実測確認が取れるまで起動は不可（API未確認の成功を仮定しない）。
  const startDisabled = DRIVE_INBOX_API_READY !== true;
  const lastUpdated = formatDateTime(batch?.updated_at);

  return (
    <section className="rounded-lg border border-background-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-background-200 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground-950">
              <i className="ri-inbox-archive-line w-4 h-4 flex items-center justify-center text-primary-600"></i>
              Inbox一括取込
            </h2>
            <span className="inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-md bg-secondary-100 px-2 text-[11px] font-medium text-secondary-900">
              <i className="ri-plug-line w-3 h-3 flex items-center justify-center"></i>
              {startDisabled ? "接続待ち" : "接続済み"}
            </span>
            {lastUpdated && (
              <span className="whitespace-nowrap text-[11px] text-foreground-400">
                最終更新 {lastUpdated}
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-foreground-500">
            Google Drive の 01_inbox に置いたPDFをまとめて取り込みます。商品ごと・書類ごとの操作は不要です。
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={isRefreshing}
            className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-white px-3 py-2 text-[12px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i
              className={`ri-refresh-line w-3.5 h-3.5 flex items-center justify-center ${
                isRefreshing ? "animate-spin" : ""
              }`}
            ></i>
            結果を再取得
          </button>
          <button
            type="button"
            disabled={startDisabled}
            aria-disabled={startDisabled}
            title={
              startDisabled
                ? "Cloud Run Job の起動APIの実測確認が完了するまで無効です"
                : "01_inbox のPDFをまとめて取り込みます"
            }
            className="inline-flex min-w-[132px] items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary-600 px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-background-200 disabled:text-foreground-400"
          >
            <i className="ri-play-circle-line w-4 h-4 flex items-center justify-center"></i>
            一括取込を開始
          </button>
        </div>
      </div>

      <div className="px-4 py-3 md:px-5">
        {startDisabled && (
          <SaveStatusMessage
            tone="warning"
            text="Cloud Run Job の起動API／結果取得APIは、画面用APIとしての実測確認が完了していません。確認が取れるまで「一括取込を開始」は無効です。"
            className="mb-3"
          />
        )}

        <DriveInboxStatusSummary
          counts={counts}
          running={running}
          progressPercent={progressPercent}
        />

        <DriveInboxFileResults
          state={state}
          files={batch?.files ?? []}
          message={message}
          onRetry={refresh}
        />

        <ul className="mt-3 flex flex-col gap-1 border-t border-background-100 pt-2.5">
          <li className="flex items-start gap-1.5 text-[11px] leading-relaxed text-foreground-500">
            <i className="ri-folder-shield-2-line mt-0.5 w-3.5 h-3.5 shrink-0 flex items-center justify-center"></i>
            <span>
              03_flagged に移動したファイルは、DBの status が pending_amount
              のままでも、フォルダ情報から「要確認」として表示します。
            </span>
          </li>
          <li className="flex items-start gap-1.5 text-[11px] leading-relaxed text-foreground-500">
            <i className="ri-refresh-line mt-0.5 w-3.5 h-3.5 shrink-0 flex items-center justify-center"></i>
            <span>
              進捗はブラウザ内に保持しません。この画面を開き直すたびに、サーバー側の結果を取得し直します。
            </span>
          </li>
          <li className="flex items-start gap-1.5 text-[11px] leading-relaxed text-foreground-500">
            <i className="ri-forbid-2-line mt-0.5 w-3.5 h-3.5 shrink-0 flex items-center justify-center"></i>
            <span>
              画面を閉じても自動で再送・再開は行いません。処理状況は結果の再取得で確認してください。
            </span>
          </li>
          <li className="flex items-start gap-1.5 text-[11px] leading-relaxed text-foreground-500">
            <i className="ri-shield-check-line mt-0.5 w-3.5 h-3.5 shrink-0 flex items-center justify-center"></i>
            <span>
              結果が取得できない場合は成功として扱いません。件数・ファイル別結果は取得できた分だけを表示します。
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}