import { useMemo } from "react";
import DriveInboxFileResults from "./DriveInboxFileResults";
import DriveInboxStatusSummary from "./DriveInboxStatusSummary";
import SaveStatusMessage from "@/components/base/SaveStatusMessage";
import { useDriveInboxBatch } from "@/pages/documents/hooks/useDriveInboxBatch";
import {
  DRIVE_INBOX_RESULT_API_READY,
  DRIVE_INBOX_START_API_READY,
  DRIVE_INBOX_START_DISABLED_REASON,
} from "@/pages/documents/lib/driveInboxBatchApi";
import {
  enrichDriveInboxFilesWithLedger,
  resolveBatchModeLabel,
  resolveProcessedLabel,
} from "@/pages/documents/lib/driveInboxBatch";
import type { DocumentLedgerSummary } from "@/pages/documents/lib/ledgerSummary";
import type { DocumentLedgerDocument } from "@/pages/documents/types";

interface DriveInboxImportSectionProps {
  // 書類台帳の全件サマリー（一覧の絞り込みとは独立）。
  // 未取得のときは null。
  ledgerSummary: DocumentLedgerSummary | null;
  // 台帳の全書類（ファイル別結果に明細数・台帳リンクを補うために使う）。
  ledgerDocuments: DocumentLedgerDocument[];
}

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
export default function DriveInboxImportSection({ ledgerSummary, ledgerDocuments }: DriveInboxImportSectionProps) {
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
  const startDisabled = DRIVE_INBOX_START_API_READY !== true;
  const lastUpdated = formatDateTime(batch?.updated_at);

  const dryRun = batch?.dry_run ?? null;
  const processedLabel = resolveProcessedLabel(dryRun);
  const modeLabel = resolveBatchModeLabel(dryRun);
  // 結果照会の応答に dry_run が無い間は、実保存済みと断定しない。
  const modeUnknown = state === "success" && dryRun === null;
  const modeChipClass =
    dryRun === false
      ? "bg-primary-100 text-primary-700"
      : dryRun === true
      ? "bg-amber-100 text-amber-800"
      : "bg-background-100 text-foreground-600";

  const filesWithLedger = useMemo(
    () =>
      enrichDriveInboxFilesWithLedger(
        batch?.files ?? [],
        ledgerDocuments,
        batch?.folder_labels
      ),
    [batch?.files, batch?.folder_labels, ledgerDocuments]
  );
  const jobStartedAt = formatDateTime(batch?.started_at);
  const jobFinishedAt = formatDateTime(batch?.updated_at);

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
              <i className="ri-database-2-line w-3 h-3 flex items-center justify-center"></i>
              結果取得 {DRIVE_INBOX_RESULT_API_READY ? "接続済み" : "未接続"}
            </span>
            {state === "success" && (
              <span
                className={`inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium ${modeChipClass}`}
              >
                <i className="ri-route-line w-3 h-3 flex items-center justify-center"></i>
                {modeLabel}
              </span>
            )}
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
        {ledgerSummary && (
          <div className="mb-3 rounded-lg border border-background-200 bg-background-50 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-[11px] font-medium text-foreground-600">
                台帳サマリー（全件）
              </p>
              <p className="text-[10px] text-foreground-400">
                一覧の絞り込みとは独立して集計
              </p>
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-[12px] text-foreground-500">
                合計{" "}
                <span className="font-semibold tabular-nums text-foreground-950">
                  {ledgerSummary.total}
                </span>
                件
              </span>
              <span className="text-[12px] text-foreground-500">
                照合済み{" "}
                <span className="font-semibold tabular-nums text-primary-700">
                  {ledgerSummary.matched}
                </span>
              </span>
              <span className="text-[12px] text-foreground-500">
                一部照合{" "}
                <span className="font-semibold tabular-nums text-amber-800">
                  {ledgerSummary.partial}
                </span>
              </span>
              <span className="text-[12px] text-foreground-500">
                未照合{" "}
                <span className="font-semibold tabular-nums text-foreground-800">
                  {ledgerSummary.unmatched}
                </span>
              </span>
            </div>
          </div>
        )}

        {startDisabled && (
          <SaveStatusMessage
            tone="warning"
            text={DRIVE_INBOX_START_DISABLED_REASON}
            className="mb-3"
          />
        )}

        {modeUnknown && (
          <p className="mb-3 flex items-start gap-1.5 rounded-lg border border-background-200 bg-background-50 px-3 py-2 text-[11px] leading-relaxed text-foreground-500">
            <i className="ri-information-line mt-0.5 h-3.5 w-3.5 shrink-0 flex items-center justify-center"></i>
            <span>
              結果照会の応答に実行モード（dry_run）がまだ含まれていません。そのため「処理結果」と表示し、台帳への実保存は断定しません。応答が更新されたら、ドライランは「処理見込み」、通常取込は「処理済み」として区別します。
            </span>
          </p>
        )}

        <DriveInboxStatusSummary
          counts={counts}
          running={running}
          progressPercent={progressPercent}
          processedLabel={processedLabel}
        />

        {state === "success" && batch && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-background-200 bg-background-50 px-3 py-2">
            <span className="text-[11px] font-medium text-foreground-500">
              最新ジョブ
            </span>
            <span className="min-w-0 max-w-full truncate font-mono text-[10px] text-foreground-700">
              {batch.batch_id || "—"}
            </span>
            {batch.runner && (
              <span className="inline-flex h-[20px] items-center whitespace-nowrap rounded border border-background-200 bg-white px-1.5 text-[10px] text-foreground-600">
                {batch.runner}
              </span>
            )}
            {batch.job_message && (
              <span className="text-[11px] text-foreground-600">
                {batch.job_message}
              </span>
            )}
            {(jobStartedAt || jobFinishedAt) && (
              <span className="whitespace-nowrap text-[10px] tabular-nums text-foreground-400">
                {jobStartedAt}
                {jobStartedAt && jobFinishedAt ? " → " : ""}
                {jobFinishedAt}
              </span>
            )}
          </div>
        )}

        <DriveInboxFileResults
          state={state}
          files={filesWithLedger}
          message={message}
          onRetry={refresh}
          processedLabel={processedLabel}
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
          <li className="flex items-start gap-1.5 text-[11px] leading-relaxed text-foreground-500">
            <i className="ri-play-circle-line mt-0.5 w-3.5 h-3.5 shrink-0 flex items-center justify-center"></i>
            <span>
              開始は「start_inbox_import」を dry_run の値で呼び分けます（ドライラン＝処理見込み、通常取込＝処理済み）。実画面で一連の動作を確認するまで開始ボタンは無効です。
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}