import type { DriveBulkImportRun } from "@/pages/drive-bulk-import/types";

interface DriveBulkImportDryRunPanelProps {
  dryRun: DriveBulkImportRun | null;
  isStarting: boolean;
  errorMessage: string | null;
  pollError: string | null;
  onRetry: () => void;
}

function formatCount(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("ja-JP");
}

function StatTile({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-background-200 bg-background-50 px-3 py-2.5">
      <p className="whitespace-nowrap text-[11px] leading-none text-foreground-500">
        {label}
      </p>
      <p
        className={`admin-numeric mt-1.5 text-[20px] font-semibold leading-none ${
          emphasis ? "text-primary-700" : "text-foreground-950"
        }`}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1.5 break-words text-[11px] leading-relaxed text-foreground-400">
          {hint}
        </p>
      )}
    </div>
  );
}

function statusLabel(status: DriveBulkImportRun["status"]): string {
  if (status === "running") return "調査中";
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

export default function DriveBulkImportDryRunPanel({
  dryRun,
  isStarting,
  errorMessage,
  pollError,
  onRetry,
}: DriveBulkImportDryRunPanelProps) {
  if (!dryRun && !isStarting && !errorMessage) return null;

  const registeredHint =
    dryRun &&
    (dryRun.counts.registeredActive !== null ||
      dryRun.counts.registeredArchived !== null)
      ? `active ${formatCount(dryRun.counts.registeredActive)} / archived ${formatCount(
          dryRun.counts.registeredArchived
        )}`
      : "内訳は取得できませんでした";

  return (
    <section className="ui-card mt-4 rounded-lg p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold leading-none text-foreground-950">
          <i className="ri-search-eye-line flex h-4 w-4 items-center justify-center text-foreground-500"></i>
          ドライラン結果
          <span className="ml-0.5 text-[11px] font-normal leading-none text-foreground-400">
            登録は行わない調査
          </span>
        </h2>
        {dryRun && (
          <span
            className={`inline-flex h-[22px] select-none items-center whitespace-nowrap rounded-md px-2 text-[11px] font-medium leading-none ${statusClass(
              dryRun.status
            )}`}
          >
            {statusLabel(dryRun.status)}
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
            もう一度ドライランを実行
          </button>
        </div>
      )}

      {isStarting && !dryRun && (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] leading-relaxed text-foreground-600">
          <i className="ri-loader-4-line flex h-4 w-4 animate-spin items-center justify-center"></i>
          ドライランを開始しています（Driveの列挙には数分かかることがあります）。
        </p>
      )}

      {dryRun && dryRun.status === "running" && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-foreground-700">
              <i className="ri-loader-4-line flex h-4 w-4 animate-spin items-center justify-center"></i>
              調査中
            </span>
            <span className="admin-numeric text-[12px] text-foreground-500">
              {formatCount(dryRun.processedCount)} / {formatCount(dryRun.totalCount)} 件
            </span>
            <span className="text-[11px] text-foreground-400">約5秒間隔で自動更新</span>
          </div>
          <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-background-200">
            {dryRun.totalCount > 0 ? (
              <div
                className="h-full rounded-full bg-primary-500 transition-[width] duration-300 ease-out"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((dryRun.processedCount / dryRun.totalCount) * 100)
                  )}%`,
                }}
              ></div>
            ) : (
              <div className="indeterminate-progress-bar h-full w-1/3 rounded-full bg-primary-400"></div>
            )}
          </div>
        </div>
      )}

      {dryRun && dryRun.status !== "running" && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <StatTile
              label="検出総数"
              value={formatCount(dryRun.counts.detected)}
            />
            <StatTile
              label="登録済み"
              value={formatCount(dryRun.counts.registered)}
              hint={registeredHint}
            />
            <StatTile
              label="登録対象件数"
              value={formatCount(dryRun.counts.target)}
              emphasis
            />
            <StatTile
              label="失敗件数"
              value={formatCount(dryRun.counts.failed)}
            />
          </div>

          {dryRun.status === "succeeded" && dryRun.counts.target === 0 && (
            <p className="mt-3 rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-[12px] leading-relaxed text-foreground-600">
              登録対象は0件です。取込が完了しているフォルダでは、これが正しい結果です。
            </p>
          )}

          {dryRun.status !== "succeeded" && (
            <p className="mt-3 break-words rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-[12px] leading-relaxed text-foreground-700">
              {dryRun.message ||
                "ドライランを正常に完了できませんでした。条件を確認して再実行してください。"}
            </p>
          )}

          {dryRun.status === "succeeded" && dryRun.counts.target === null && (
            <p className="mt-3 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
              登録対象件数を応答から取得できませんでした。件数が確認できるまで実行はしないでください。
            </p>
          )}
        </>
      )}

      {pollError && dryRun && dryRun.status === "running" && (
        <p className="mt-2 break-words text-[11px] leading-relaxed text-amber-800">
          {pollError}
        </p>
      )}
    </section>
  );
}