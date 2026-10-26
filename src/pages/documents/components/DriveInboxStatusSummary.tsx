import IndeterminateProgressBar from "@/components/base/IndeterminateProgressBar";
import type { DriveInboxStatusCounts } from "@/pages/documents/lib/driveInboxBatch";

interface DriveInboxStatusSummaryProps {
  // 取得できていない場合は null（「—」表示にする）
  counts: DriveInboxStatusCounts | null;
  running: boolean;
  progressPercent: number | null;
  // 「処理済み」/「処理見込み」/「処理結果」をモードに応じて切り替える。
  processedLabel: string;
}

const CARDS: Array<{
  key: keyof Pick<
    DriveInboxStatusCounts,
    "processing" | "processed" | "needs_review" | "failed" | "skipped"
  >;
  label: string;
  icon: string;
  // 状態の区別は必要な範囲だけ色分けする
  valueClass: string;
  iconClass: string;
}> = [
  {
    key: "processing",
    label: "処理中",
    icon: "ri-loader-4-line",
    valueClass: "text-foreground-950",
    iconClass: "text-secondary-700",
  },
  {
    key: "processed",
    label: "処理済み",
    icon: "ri-checkbox-circle-line",
    valueClass: "text-primary-700",
    iconClass: "text-primary-600",
  },
  {
    key: "needs_review",
    label: "要確認",
    icon: "ri-flag-line",
    valueClass: "text-amber-800",
    iconClass: "text-amber-700",
  },
  {
    key: "failed",
    label: "失敗",
    icon: "ri-error-warning-line",
    valueClass: "text-red-700",
    iconClass: "text-red-600",
  },
  {
    key: "skipped",
    label: "スキップ",
    icon: "ri-skip-forward-line",
    valueClass: "text-foreground-600",
    iconClass: "text-foreground-400",
  },
];

/**
 * 一括取込の件数サマリー。
 * 数値は取得済みの結果だけを数えたもの。未取得（null）のときは「—」を出し、
 * 0件と区別できるようにする。
 */
export default function DriveInboxStatusSummary({
  counts,
  running,
  progressPercent,
  processedLabel,
}: DriveInboxStatusSummaryProps) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {CARDS.map((card) => {
          const value = counts ? counts[card.key] : null;
          const emphasize =
            card.key === "processing" && (value ?? 0) > 0 ? true : false;
          const label = card.key === "processed" ? processedLabel : card.label;
          return (
            <div
              key={card.key}
              className={`rounded-lg border px-3 py-2 ${
                emphasize
                  ? "border-secondary-300 bg-secondary-50"
                  : "border-background-200 bg-background-50"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <i
                  className={`${card.icon} w-3.5 h-3.5 flex items-center justify-center text-xs ${card.iconClass} ${
                    card.key === "processing" && emphasize
                      ? "animate-spin"
                      : ""
                  }`}
                ></i>
                <span className="truncate text-[11px] font-medium text-foreground-500">
                  {label}
                </span>
              </div>
              <p
                className={`mt-1 text-lg font-semibold leading-none tabular-nums ${card.valueClass}`}
              >
                {value === null ? "—" : value}
                {value !== null && (
                  <span className="ml-0.5 text-[10px] font-normal text-foreground-400">
                    件
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      {running && (
        <div className="mt-3">
          {progressPercent !== null ? (
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-foreground-500">
                <span>進捗</span>
                <span className="font-medium tabular-nums text-foreground-800">
                  {progressPercent}%
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Drive一括取込の進捗"
                aria-valuenow={progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1 w-full overflow-hidden rounded-full bg-background-200"
              >
                <span
                  className="block h-full rounded-full bg-primary-500"
                  style={{ width: `${progressPercent}%` }}
                ></span>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-1 text-[11px] text-foreground-500">
                進捗率は取得できません（処理中）
              </p>
              <IndeterminateProgressBar label="Drive一括取込の処理状況" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}