import { useMemo } from "react";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import { adminThemeClass } from "@/lib/adminTheme";
import { useAiBatch } from "@/pages/products/context/AiBatchProvider";
import {
  AI_BATCH_STATUS_LABELS,
  deriveAiBatchDisplayStatus,
  formatJstDateTime,
  isTerminalBatchStatus,
} from "@/pages/products/lib/aiBatch";

/**
 * AI一括生成の進捗・予約状況を管理画面の上部に常時表示する帯。
 *
 * - バッチ・予約が無いときは何も描画しない（レイアウトを動かさない）
 * - AI生成の全体進捗はこの帯だけに表示する（商品選択アクションバーには出さない）
 * - 押せるボタンは「結果を見る／予約内容を見る」と「×（追跡を破棄）」の2つ
 * - 商品のチェック状態とは独立して表示する（選択解除しても消えない）
 * - 通信エラー時は「完了」ではなく警告として表示する
 * - 完了数は実データの集計のみ。架空の進捗率は使わない
 * - 復元直後（初回取得前）は件数を確定値として出さず「確認中」と表示する
 * - 連続失敗が続いた場合は「状態不明」と表示し、×でいつでも破棄できる
 */
export default function AiBatchProgressBar() {
  const { isTestMode } = useOperatingMode();
  const {
    items,
    batchStatus,
    scheduleId,
    scheduledAt,
    dispatchErrorMessage,
    isPolling,
    isTrackingUnknown,
    countsConfirmed,
    pollError,
    openResult,
    dismiss,
    isResultOpen,
  } = useAiBatch();

  const counts = useMemo(() => {
    const result = {
      total: 0,
      waiting: 0,
      processing: 0,
      success: 0,
      failed: 0,
      excluded: 0,
      cancelled: 0,
      review: 0,
    };
    (items ?? []).forEach((item) => {
      const status = deriveAiBatchDisplayStatus(item);
      result.total += 1;
      if (status === "success") result.success += 1;
      else if (status === "processing") result.processing += 1;
      else if (status === "failed") result.failed += 1;
      else if (status === "excluded") result.excluded += 1;
      else if (status === "cancelled") result.cancelled += 1;
      else if (status === "contract_violation") result.review += 1;
      else result.waiting += 1;
    });
    return result;
  }, [items]);

  if (!items || items.length === 0) return null;

  const terminal = isTerminalBatchStatus(batchStatus);
  const isWaitingSchedule =
    batchStatus === "scheduled" ||
    batchStatus === "starting" ||
    batchStatus === "dispatch_retry";
  const isCancelled = batchStatus === "cancelled";

  // 状態不明は「通信エラー」よりも上位の表示（追跡は続けているが断定できない）
  const stateLabel = isTrackingUnknown
    ? "状態不明"
    : pollError
      ? "進捗取得エラー"
      : batchStatus
        ? AI_BATCH_STATUS_LABELS[batchStatus]
        : "受付中";

  // 実データ（完了件数 / 総件数）だけで帯の進み具合を表現する
  const completedRatio =
    counts.total > 0 ? Math.min(1, counts.success / counts.total) : 0;

  // AI の識別色は金（accent）で統一し、状態（完了・失敗）はグレー／緑／アンバーの意味色で表す。
  const stateClass =
    isTrackingUnknown || pollError || batchStatus === "dispatch_retry"
      ? "border-amber-200 tone-warning"
      : isCancelled
        ? "border-background-200 tone-neutral"
        : terminal
          ? counts.failed > 0 || batchStatus === "failed"
            ? "border-amber-200 tone-warning"
            : "border-primary-200 tone-success"
          : "border-background-200 tone-neutral";

  const barClass =
    isTrackingUnknown || pollError || batchStatus === "dispatch_retry"
      ? "bg-amber-400"
      : isCancelled
        ? "bg-background-300"
        : terminal
          ? "bg-accent-500"
          : "bg-accent-400";

  const formattedScheduledAt = scheduledAt
    ? formatJstDateTime(scheduledAt)
    : "";

  return (
    <div
      className={`${adminThemeClass(
        isTestMode
      )} border-b border-background-200 bg-white`}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-2.5 gap-y-1 px-4 pt-1.5 pb-2 md:px-6">
        <span className="flex min-w-0 items-center gap-1.5">
          {isPolling && !isTrackingUnknown && !isWaitingSchedule ? (
            <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center text-accent-600"></i>
          ) : isTrackingUnknown ? (
            <i className="ri-question-line w-3.5 h-3.5 flex items-center justify-center text-amber-600"></i>
          ) : isWaitingSchedule ? (
            <i className="ri-calendar-schedule-line w-3.5 h-3.5 flex items-center justify-center text-accent-600"></i>
          ) : terminal ? (
            <i className="ri-checkbox-circle-line w-3.5 h-3.5 flex items-center justify-center text-accent-600"></i>
          ) : (
            <i className="ri-sparkling-line w-3.5 h-3.5 flex items-center justify-center text-accent-600"></i>
          )}
          <span className="whitespace-nowrap text-[13px] font-semibold text-foreground-950">
            {scheduleId
              ? isWaitingSchedule || isCancelled
                ? "AI生成予約"
                : "AI生成（予約）"
              : "AI生成"}
          </span>
          {countsConfirmed ? (
            <span className="admin-numeric whitespace-nowrap text-[12px] font-medium text-foreground-800">
              {isWaitingSchedule
                ? `${counts.total}件`
                : `${counts.success} / ${counts.total}件`}
            </span>
          ) : (
            <span className="whitespace-nowrap text-[12px] font-medium text-foreground-500">
              確認中
            </span>
          )}
        </span>

        <span
          className={`inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${stateClass}`}
        >
          {stateLabel}
        </span>

        {scheduleId && formattedScheduledAt && (
          <span className="whitespace-nowrap text-[11px] font-medium text-foreground-700">
            開始予定: {formattedScheduledAt}
          </span>
        )}

        {/* 内訳（予約待機中は予約件数、実行開始後は実データ集計のみ）。
            復元直後の初回確認が済むまでは件数を確定値として出さない。 */}
        {!isWaitingSchedule && !isCancelled && (
          countsConfirmed ? (
            <span className="admin-numeric flex flex-wrap items-center gap-x-1.5 gap-y-0.5 whitespace-nowrap text-[12px] text-foreground-500">
              <span>受付待ち {counts.waiting}</span>
              <span className="text-foreground-300">/</span>
              <span className="text-foreground-700">
                処理中 {counts.processing}
              </span>
              <span className="text-foreground-300">/</span>
              <span className="font-medium text-primary-700">
                完了 {counts.success}
              </span>
              <span className="text-foreground-300">/</span>
              <span
                className={`${counts.failed > 0 ? "font-semibold text-red-700" : ""}`}
              >
                失敗 {counts.failed}
              </span>
              {counts.excluded > 0 && (
                <>
                  <span className="text-foreground-300">/</span>
                  <span className="font-medium text-foreground-700">
                    対象外 {counts.excluded}
                  </span>
                </>
              )}
            </span>
          ) : (
            <span className="whitespace-nowrap text-[12px] text-foreground-500">
              進捗を確認しています
            </span>
          )
        )}

        {counts.review > 0 && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-amber-200 px-1.5 py-0.5 text-[11px] font-medium tone-warning">
            <i className="ri-error-warning-line w-3 h-3 flex items-center justify-center"></i>
            要確認 {counts.review}
          </span>
        )}

        {dispatchErrorMessage && (
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-amber-200 px-1.5 py-0.5 text-[11px] font-medium tone-warning"
            title={dispatchErrorMessage}
          >
            <i className="ri-error-warning-line w-3 h-3 flex items-center justify-center"></i>
            開始時エラー（要確認）
          </span>
        )}

        {isTrackingUnknown ? (
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-amber-200 px-1.5 py-0.5 text-[11px] font-medium tone-warning"
            title="進捗を取得できない状態が続いています。処理は継続している可能性があります。"
          >
            <i className="ri-error-warning-line w-3 h-3 flex items-center justify-center"></i>
            取得できない状態が続いています
          </span>
        ) : (
          pollError && (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-amber-200 px-1.5 py-0.5 text-[11px] font-medium tone-warning"
              title={pollError}
            >
              <i className="ri-error-warning-line w-3 h-3 flex items-center justify-center"></i>
              通信エラー（処理は継続中）
            </span>
          )
        )}

        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={openResult}
            className="cursor-pointer whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 py-1 text-[11px] font-medium text-foreground-800 transition-colors hover:bg-background-100"
          >
            {isWaitingSchedule ? "予約内容を見る" : "結果を見る"}
          </button>
          {/* 追跡の破棄は状態によらず常に行える（サーバー側の処理は継続する） */}
          {!isResultOpen && (
            <button
              type="button"
              onClick={dismiss}
              aria-label="進捗表示を閉じる"
              title="進捗表示を閉じる"
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-800"
            >
              <i className="ri-close-line w-3.5 h-3.5 flex items-center justify-center"></i>
            </button>
          )}
        </span>

        {/* 高さを抑えた細いバー（完了件数 / 総件数の実データのみ） */}
        <span className="h-0.5 w-full overflow-hidden rounded-full bg-background-200">
          <span
            className={`block h-full rounded-full transition-[width] duration-300 ${barClass}`}
            style={{ width: `${completedRatio * 100}%` }}
          ></span>
        </span>
      </div>
    </div>
  );
}
