import { useMemo, useState } from "react";
import type { PokecaLightWorkerState } from "@/pages/products/lib/pokecaRawStorageAi";

interface PokecaLightProgressBarProps {
  worker: PokecaLightWorkerState;
  isRefreshing: boolean;
  noticeMessage: string;
  onRefresh: () => void;
  onClose: () => void;
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-primary-700"
      : tone === "warning"
        ? "text-amber-700"
        : "text-foreground-900";
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[11px] leading-none text-foreground-500">
        {label}
      </span>
      <span
        className={`admin-numeric text-[12px] font-semibold leading-none ${toneClass}`}
      >
        {value}
      </span>
    </span>
  );
}

/**
 * ライト版（旧裏ストレージ向け）の進捗バー。
 *
 * worker_state の実データのみを表示し、推定値は使わない。
 * 画面を開き直した場合・別デバイスで開いた場合も同じジョブを表示する。
 */
export default function PokecaLightProgressBar({
  worker,
  isRefreshing,
  noticeMessage,
  onRefresh,
  onClose,
}: PokecaLightProgressBarProps) {
  const [isFailureOpen, setIsFailureOpen] = useState(false);

  const total = worker.totalCount;
  const processed = Math.min(worker.processedCount, total > 0 ? total : worker.processedCount);
  const ratio = total > 0 ? Math.min(1, processed / total) : 0;
  const isRunning = worker.status === "running";
  const isFailed = worker.status === "failed";

  const stateLabel = useMemo(() => {
    if (isRunning) return "実行中";
    if (isFailed) return worker.successCount > 0 ? "一部失敗" : "失敗";
    if (worker.status === "completed") return "完了";
    return "待機";
  }, [isRunning, isFailed, worker.status, worker.successCount]);

  let stateIcon = (
    <i
      className="ri-flashlight-line flex h-4 w-4 items-center justify-center text-[15px] text-foreground-500"
      aria-hidden="true"
    ></i>
  );
  if (isRunning) {
    stateIcon = (
      <i
        className="ri-loader-4-line flex h-4 w-4 animate-spin items-center justify-center text-[15px] text-foreground-400"
        aria-hidden="true"
      ></i>
    );
  } else if (isFailed) {
    stateIcon = (
      <i
        className="ri-error-warning-line flex h-4 w-4 items-center justify-center text-[15px] text-amber-600"
        aria-hidden="true"
      ></i>
    );
  } else if (worker.status === "completed") {
    stateIcon = (
      <i
        className="ri-checkbox-circle-line flex h-4 w-4 items-center justify-center text-[15px] text-primary-600"
        aria-hidden="true"
      ></i>
    );
  }

  return (
    <div className="mb-3 rounded-lg border border-background-200 bg-white">
      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
        <span className="flex items-center gap-1.5">
          {stateIcon}
          <span className="whitespace-nowrap text-[13px] font-semibold text-foreground-950">
            ライト版
          </span>
          <span className="text-[11px] leading-none text-foreground-300" aria-hidden="true">
            ·
          </span>
          <span
            className={`whitespace-nowrap text-[12px] font-medium leading-none ${
              isFailed ? "text-amber-700" : "text-foreground-800"
            }`}
          >
            {stateLabel}
          </span>
        </span>

        <span className="admin-numeric flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-[11px] leading-none text-foreground-500">
              処理済み
            </span>
            <span className="admin-numeric text-[12px] font-semibold leading-none text-foreground-900">
              {processed}
            </span>
            <span className="admin-numeric whitespace-nowrap text-[11px] leading-none text-foreground-400">
              / {total}件
            </span>
          </span>
          <Stat label="成功" value={worker.successCount} tone="success" />
          <Stat
            label="失敗"
            value={worker.failedCount}
            tone={worker.failedCount > 0 ? "warning" : "default"}
          />
          <Stat label="スキップ" value={worker.skippedCount} />
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {worker.failures.length > 0 && (
            <button
              type="button"
              onClick={() => setIsFailureOpen((v) => !v)}
              aria-expanded={isFailureOpen}
              className="inline-flex h-7 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 text-[12px] font-medium text-foreground-700 transition-colors hover:bg-background-100"
            >
              <i
                className={`${
                  isFailureOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"
                } flex h-3.5 w-3.5 items-center justify-center text-[13px]`}
                aria-hidden="true"
              ></i>
              失敗内容
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="ライト版の進捗を再取得"
            title="ライト版の進捗を再取得"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i
              className={`ri-refresh-line flex h-3.5 w-3.5 items-center justify-center text-[14px] ${
                isRefreshing ? "animate-spin" : ""
              }`}
            ></i>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="ライト版の進捗表示を閉じる"
            title="ライト版の進捗表示を閉じる"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-800"
          >
            <i className="ri-close-line flex h-3.5 w-3.5 items-center justify-center text-[14px]"></i>
          </button>
        </span>

        {isRunning && (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-background-200"
          >
            <span
              className="block h-full bg-primary-400 transition-[width] duration-500 ease-out"
              style={{ width: `${ratio * 100}%` }}
            ></span>
          </span>
        )}
      </div>

      {noticeMessage && (
        <p className="flex items-start gap-1.5 border-t border-background-200 px-4 py-2 text-[11px] leading-relaxed text-foreground-600">
          <i className="ri-information-line mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[13px]"></i>
          {noticeMessage}
        </p>
      )}

      {isFailureOpen && worker.failures.length > 0 && (
        <div className="max-h-40 overflow-y-auto overscroll-contain border-t border-background-200 px-4 py-2">
          {worker.failures.map((failure, index) => (
            <div
              key={`${failure.product_id}-${index}`}
              className="flex flex-wrap items-baseline gap-x-2 py-0.5 text-[11px] leading-snug"
            >
              <span className="admin-numeric shrink-0 font-medium text-foreground-800">
                {failure.product_id || "-"}
              </span>
              {failure.product_name && (
                <span className="min-w-0 max-w-[240px] truncate text-foreground-500">
                  {failure.product_name}
                </span>
              )}
              <span className="min-w-0 flex-1 break-words text-amber-800">
                {failure.error_message}
                {failure.error_code ? `（${failure.error_code}）` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}