import { Link } from "react-router-dom";
import type { DriveBulkImportRun } from "@/pages/drive-bulk-import/types";

interface DriveBulkImportRunPanelProps {
  run: DriveBulkImportRun | null;
  isStarting: boolean;
  errorMessage: string | null;
  pollError: string | null;
  onRetry: () => void;
}

function formatCount(value: number): string {
  return value.toLocaleString("ja-JP");
}

function statusLabel(status: DriveBulkImportRun["status"]): string {
  if (status === "running") return "実行中";
  if (status === "succeeded") return "完了";
  if (status === "failed") return "失敗";
  return "状態不明";
}

function statusClass(status: DriveBulkImportRun["status"]): string {
  if (status === "running") return "bg-amber-100 text-amber-900";
  if (status === "succeeded") return "bg-primary-100 text-primary-800";
  if (status === "failed") return "bg-amber-100 text-amber-900";
  return "bg-background-200 text-foreground-700";
}

function MiniStat({
  label,
  value,
  tone = "foreground",
}: {
  label: string;
  value: number;
  tone?: "foreground" | "primary" | "warning";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary-700"
      : tone === "warning"
        ? "text-amber-800"
        : "text-foreground-700";
  return (
    <div className="min-w-0">
      <p className="whitespace-nowrap text-[11px] leading-none text-foreground-500">
        {label}
      </p>
      <p
        className={`admin-numeric mt-1 text-[15px] font-semibold leading-none ${toneClass}`}
      >
        {formatCount(value)} 件
      </p>
    </div>
  );
}

export default function DriveBulkImportRunPanel({
  run,
  isStarting,
  errorMessage,
  pollError,
  onRetry,
}: DriveBulkImportRunPanelProps) {
  if (!run && !isStarting && !errorMessage) return null;

  const percent =
    run && run.totalCount > 0
      ? Math.min(100, Math.round((run.processedCount / run.totalCount) * 100))
      : null;
  const isTerminal =
    run !== null && (run.status === "succeeded" || run.status === "failed");

  return (
    <section className="ui-card mt-4 rounded-lg p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold leading-none text-foreground-950">
          <i className="ri-play-circle-line flex h-4 w-4 items-center justify-center text-foreground-500"></i>
          実行状況
          {run && (
            <span className="admin-numeric ml-0.5 text-[11px] font-normal leading-none text-foreground-400">
              {run.runId}
            </span>
          )}
        </h2>
        {run && (
          <span
            className={`inline-flex h-[22px] select-none items-center whitespace-nowrap rounded-md px-2 text-[11px] font-medium leading-none ${statusClass(
              run.status
            )}`}
          >
            {statusLabel(run.status)}
          </span>
        )}
      </div>

      {errorMessage && (
        <div className="mt-3 rounded-lg border border-background-300 bg-background-50 px-3 py-2.5">
          <p className="break-words text-[12px] leading-relaxed text-foreground-700">
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex h-8 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-background-50 px-2.5 text-[12px] font-medium text-foreground-700 transition-colors hover:bg-background-100"
          >
            <i className="ri-refresh-line flex h-3.5 w-3.5 items-center justify-center"></i>
            画面を更新
          </button>
        </div>
      )}

      {isStarting && !run && (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] leading-relaxed text-foreground-600">
          <i className="ri-loader-4-line flex h-4 w-4 animate-spin items-center justify-center"></i>
          ジョブを開始しています。
        </p>
      )}

      {run && (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p className="flex items-baseline gap-1">
                <span className="admin-numeric text-[26px] font-semibold leading-none tracking-tight text-foreground-950">
                  {formatCount(run.processedCount)}
                </span>
                <span className="admin-numeric text-[12px] leading-none text-foreground-400">
                  / {formatCount(run.totalCount)}
                </span>
              </p>
              <p className="mt-1.5 text-[11px] leading-none text-foreground-500">
                処理済み
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-0.5">
              <MiniStat label="成功" value={run.successCount} tone="primary" />
              <MiniStat label="スキップ" value={run.skippedCount} />
              <MiniStat
                label="失敗"
                value={run.failedCount}
                tone={run.failedCount > 0 ? "warning" : "foreground"}
              />
            </div>

            <p className="ml-auto pb-1 text-right text-[10px] leading-none text-foreground-400">
              {run.status === "running" ? "自動更新中（約5秒）" : ""}
            </p>
          </div>

          {run.status === "running" && (
            <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-background-200">
              {percent !== null ? (
                <div
                  className="h-full rounded-full bg-primary-500 transition-[width] duration-300 ease-out"
                  style={{ width: `${percent}%` }}
                ></div>
              ) : (
                <div className="indeterminate-progress-bar h-full w-1/3 rounded-full bg-primary-400"></div>
              )}
            </div>
          )}

          {run.status === "running" && (
            <p className="mt-2 text-[11px] leading-relaxed text-foreground-500">
              この画面を閉じてもジョブは継続します。進捗は再度この画面を開くと確認できます。
            </p>
          )}

          {isTerminal && (
            <div className="mt-4 border-t border-background-200 pt-3">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-relaxed text-foreground-700">
                <span className="font-semibold text-foreground-950">最終結果</span>
                <span className="admin-numeric">
                  成功 {formatCount(run.successCount)}件・スキップ{" "}
                  {formatCount(run.skippedCount)}件・失敗{" "}
                  {formatCount(run.failedCount)}件
                </span>
              </p>
              {run.message && (
                <p className="mt-1.5 break-words text-[12px] leading-relaxed text-foreground-600">
                  {run.message}
                </p>
              )}

              {run.failures.length > 0 ? (
                <div className="mt-2.5 overflow-hidden rounded-lg border border-background-200">
                  <div className="flex items-center justify-between gap-2 border-b border-background-200 bg-background-100 px-3 py-1.5">
                    <span className="text-[11px] font-medium leading-none text-foreground-600">
                      失敗した対象
                    </span>
                    <span className="admin-numeric text-[11px] leading-none text-foreground-500">
                      {run.failures.length}件
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {run.failures.map((failure, index) => (
                      <div
                        key={`${failure.key}-${index}`}
                        className="flex flex-col gap-0.5 border-b border-background-200 px-3 py-2 last:border-b-0 sm:flex-row sm:items-start sm:gap-3"
                      >
                        <span className="min-w-0 break-all text-[12px] font-medium text-foreground-900 sm:w-[45%] sm:shrink-0">
                          {failure.key || "（対象キーなし）"}
                        </span>
                        <span className="min-w-0 break-words text-[12px] leading-relaxed text-foreground-600">
                          {failure.reason}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                run.status === "succeeded" && (
                  <p className="mt-2 text-[11px] leading-relaxed text-foreground-500">
                    失敗した対象はありません。
                  </p>
                )
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  to="/products"
                  className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-3.5 text-[13px] font-semibold text-background-50 transition-colors hover:bg-primary-600"
                >
                  <i className="ri-list-check-2 flex h-4 w-4 items-center justify-center"></i>
                  商品一覧を見る
                </Link>
              </div>
            </div>
          )}

          {pollError && (
            <p className="mt-2 break-words text-[11px] leading-relaxed text-amber-800">
              {pollError}（処理はサーバー側で継続しています）
            </p>
          )}
        </>
      )}
    </section>
  );
}