import type { AiBatchRunSummary } from "@/pages/products/types";
import {
  AI_BATCH_STATUS_LABELS,
  formatJstDateTime,
} from "@/pages/products/lib/aiBatch";

interface AiBatchRunSelectorProps {
  runs: AiBatchRunSummary[];
  activeRunKey: string | null;
  batchId: string | null;
  scheduleId: string | null;
  scheduledAt: string | null;
  createdAt: string | null;
  onSelectRun: (runKey: string) => Promise<void> | void;
}

function runTypeLabel(runType: AiBatchRunSummary["run_type"]): string {
  return runType === "scheduled" ? "日時予約" : "即時実行";
}

/**
 * 実行日時＋実行種別をまとめたコンパクトな履歴選択。
 *
 * 選択肢の並び順・選択時のデータ取得は既存仕様のまま（runs[] をそのまま使う）。
 * バッチIDは補助情報として小さく添えるだけにして、履歴の選択操作を主役にする。
 */
export default function AiBatchRunSelector({
  runs,
  activeRunKey,
  batchId,
  scheduleId,
  scheduledAt,
  createdAt,
  onSelectRun,
}: AiBatchRunSelectorProps) {
  const activeRun = runs.find((r) => r.run_key === activeRunKey) ?? null;
  const runType = activeRun?.run_type ?? (scheduleId ? "scheduled" : "immediate");

  const primaryTime = scheduleId
    ? scheduledAt
      ? formatJstDateTime(scheduledAt, { withSuffix: false })
      : ""
    : createdAt
      ? formatJstDateTime(createdAt, { withSuffix: false })
      : "";

  const refId = scheduleId ?? batchId ?? "";

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="inline-flex h-[20px] items-center rounded border border-background-300 px-1.5 text-[11px] font-medium leading-none text-foreground-600">
          {runTypeLabel(runType)}
        </span>
        <span className="admin-numeric text-[12px] font-medium leading-none text-foreground-900">
          {primaryTime || "日時情報なし"}
        </span>
        {refId && (
          <span className="truncate font-mono text-[11px] leading-none text-foreground-400">
            {scheduleId ? "予約ID" : "バッチID"} {refId.slice(0, 12)}
          </span>
        )}
      </div>

      {runs.length > 1 && (
        <div className="flex shrink-0 items-center gap-1.5">
          <label
            htmlFor="ai-run-history-select"
            className="whitespace-nowrap text-[11px] text-foreground-500"
          >
            履歴
          </label>
          <select
            id="ai-run-history-select"
            value={activeRunKey ?? ""}
            onChange={(e) => {
              if (e.target.value) {
                void onSelectRun(e.target.value);
              }
            }}
            className="h-7 max-w-[300px] cursor-pointer rounded border border-background-300 bg-white px-2 text-[11px] text-foreground-900 focus:border-primary-500 focus:outline-none"
          >
            {runs.map((r) => {
              const timeStr =
                r.run_type === "scheduled" && r.scheduled_at
                  ? formatJstDateTime(r.scheduled_at, { withSuffix: false })
                  : formatJstDateTime(r.created_at, { withSuffix: false });
              return (
                <option key={r.run_key} value={r.run_key}>
                  [{runTypeLabel(r.run_type)}] {timeStr} ·{" "}
                  {AI_BATCH_STATUS_LABELS[r.overall_status]}（{r.total_count}
                  件）
                </option>
              );
            })}
          </select>
        </div>
      )}
    </div>
  );
}