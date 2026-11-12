import { useMemo } from "react";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import { adminThemeClass } from "@/lib/adminTheme";
import { useAiBatch } from "@/pages/products/context/AiBatchProvider";
import {
  deriveAiBatchDisplayStatus,
  formatJstDateTime,
  isTerminalBatchStatus,
} from "@/pages/products/lib/aiBatch";

/**
 * AI一括生成の状態を管理画面上部に表示する、高さ44pxの1行バー。
 *
 * - 表示するのは「AI生成 / 実行種別 / 全体状態 / 主要な件数 / 結果を見る」だけ
 * - 開始予定日時・バッチID・状態の内訳は既存の履歴・結果モーダルで確認する
 *   （予約待ちのときだけ「予約日時」ボタンから同じモーダルを開ける導線を残す）
 * - バッチ・予約が無いときは何も描画しない（レイアウトを動かさない）
 * - 集計は既存の items[] の状態からのみ行い、推定値・ダミーは使わない
 * - 復元直後（初回取得前）は件数を確定値として出さず「確認中」と表示する
 * - 通信エラー・状態不明は「完了」と誤認させず、状態ラベルで示す
 */
function BarCount({
  label,
  value,
  tone = "default",
  className = "",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "success";
  className?: string;
}) {
  const toneClass =
    tone === "warning"
      ? "text-amber-700"
      : tone === "success"
        ? "text-primary-700"
        : "text-foreground-900";

  return (
    <span
      className={`inline-flex items-baseline gap-1 whitespace-nowrap ${className}`}
    >
      <span className="text-[11px] leading-none text-foreground-500">
        {label}
      </span>
      <span
        className={`admin-numeric text-[12px] font-semibold leading-none ${toneClass}`}
      >
        {value}
      </span>
      <span className="text-[11px] leading-none text-foreground-400">件</span>
    </span>
  );
}

const OUTLINE_BUTTON_CLASS =
  "inline-flex h-7 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 text-[12px] font-medium text-foreground-700 transition-colors hover:bg-background-300/60";

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

  const total = counts.total;
  // 確定済み（結果が確定している件数）。処理中はこの値だけを進捗として使う。
  const processed =
    counts.success +
    counts.failed +
    counts.excluded +
    counts.cancelled +
    counts.review;

  const terminal = isTerminalBatchStatus(batchStatus);
  const isCancelled = batchStatus === "cancelled";
  const isWaitingSchedule =
    batchStatus === "scheduled" ||
    batchStatus === "starting" ||
    batchStatus === "dispatch_retry";
  const isRunning = !terminal && !isWaitingSchedule;
  const hasTrouble = isTrackingUnknown || Boolean(pollError);

  const runTypeLabel = scheduleId ? "予約" : "即時";
  const formattedScheduledAt = scheduledAt ? formatJstDateTime(scheduledAt) : "";

  // 全体状態ラベル。既存のジョブ状態から導き、失敗と対象外は混同しない。
  let stateLabel = "受付中";
  if (isTrackingUnknown) {
    stateLabel = "状態不明";
  } else if (pollError) {
    stateLabel = "進捗取得エラー";
  } else if (batchStatus === "dispatch_retry") {
    stateLabel = "開始再試行待ち";
  } else if (isWaitingSchedule) {
    stateLabel = "予約待ち";
  } else if (isCancelled) {
    stateLabel = "予約取消済み";
  } else if (batchStatus === "queued") {
    stateLabel = "開始待ち";
  } else if (terminal) {
    if (batchStatus === "partially_failed") {
      stateLabel = "一部失敗";
    } else if (batchStatus === "failed") {
      stateLabel = counts.success > 0 ? "一部失敗" : "失敗";
    } else if (counts.failed > 0 || counts.review > 0) {
      stateLabel = counts.success > 0 ? "一部失敗" : "失敗";
    } else if (counts.success === 0 && counts.excluded > 0) {
      stateLabel = "対象外";
    } else {
      stateLabel = "完了";
    }
  } else {
    stateLabel = "処理中";
  }

  const isFailureState = stateLabel === "失敗" || stateLabel === "一部失敗";
  const isExcludedState = stateLabel === "対象外";
  const isSuccessState = stateLabel === "完了";

  // 予約待ちの開始予定を「11/13 23:00」の簡潔な形で表示するための短縮表記。
  // 正確な日時（日本時間）は title / aria-describedby で補う。
  const shortScheduledAt = (() => {
    if (!scheduledAt) return "";
    const full = formatJstDateTime(scheduledAt, { withSuffix: false });
    const matched = full.match(/^\d{4}\/(\d{2})\/(\d{2})\(\D\) (\d{2}:\d{2})$/);
    return matched ? `${matched[1]}/${matched[2]} ${matched[3]}` : full;
  })();

  /**
   * 自動で帯を閉じてよい「確定しており、確認・操作を促す必要が無い」状態。
   *
   * - 完了（全件反映）・対象外のみ・予約取消済み は、履歴モーダルからいつでも確認できるため
   *   常時表示しない（失敗・要確認は残す）。
   * - 状態を取得できていない（復元直後・通信エラー・状態不明）場合は
   *   「完了」と決めつけず、自動では消さない。
   */
  const isSettledWithoutAction =
    terminal &&
    countsConfirmed &&
    !hasTrouble &&
    !isFailureState &&
    !isRunning;

  if (isSettledWithoutAction) return null;

  // 状態アイコン（小さなアイコン＋テキストだけで意味を伝える）
  const iconBase = "w-4 h-4 flex items-center justify-center text-[15px]";
  let stateIcon = (
    <i className={`ri-sparkling-line ${iconBase} text-foreground-500`} aria-hidden="true"></i>
  );
  if (hasTrouble) {
    stateIcon = (
      <i
        className={`ri-question-line ${iconBase} text-amber-600`}
        aria-hidden="true"
      ></i>
    );
  } else if (isWaitingSchedule) {
    stateIcon = (
      <i
        className={`ri-calendar-schedule-line ${iconBase} text-foreground-500`}
        aria-hidden="true"
      ></i>
    );
  } else if (isCancelled) {
    stateIcon = (
      <i className={`ri-forbid-line ${iconBase} text-foreground-400`} aria-hidden="true"></i>
    );
  } else if (isRunning) {
    stateIcon = isPolling ? (
      <i
        className={`ri-loader-4-line animate-spin ${iconBase} text-foreground-400`}
        aria-hidden="true"
      ></i>
    ) : (
      <i className={`ri-time-line ${iconBase} text-foreground-500`} aria-hidden="true"></i>
    );
  } else if (isFailureState) {
    stateIcon = (
      <i
        className={`ri-error-warning-line ${iconBase} text-amber-600`}
        aria-hidden="true"
      ></i>
    );
  } else if (isSuccessState) {
    stateIcon = (
      <i
        className={`ri-checkbox-circle-line ${iconBase} text-primary-600`}
        aria-hidden="true"
      ></i>
    );
  } else if (isExcludedState) {
    stateIcon = (
      <i
        className={`ri-indeterminate-circle-line ${iconBase} text-foreground-500`}
        aria-hidden="true"
      ></i>
    );
  }

  const processedRatio =
    total > 0 ? Math.min(1, processed / total) : 0;

  return (
    <div className={adminThemeClass(isTestMode)}>
      <div className="ai-batch-bar border-b border-background-200 bg-white">
        <div className="relative flex h-11 w-full items-center gap-2 overflow-hidden px-4 md:px-6 lg:px-8">
          {/* 状態：AI生成 · 処理中 */}
          <span className="flex min-w-0 shrink items-center gap-1.5">
            {stateIcon}
            <span className="whitespace-nowrap text-[13px] font-semibold text-foreground-950">
              AI生成
            </span>
            <span
              aria-hidden="true"
              className="hidden text-[11px] leading-none text-foreground-300 sm:inline"
            >
              ·
            </span>
            <span
              className={`truncate text-[12px] font-medium leading-none sm:font-semibold ${
                hasTrouble || isFailureState
                  ? "text-amber-700"
                  : "text-foreground-800"
              }`}
            >
              {stateLabel}
            </span>
            <span className="hidden whitespace-nowrap text-[11px] leading-none text-foreground-400 md:inline">
              {runTypeLabel}
            </span>
          </span>

          {/* 狭い画面では件数だけを短く表示する（状態と「結果を見る」は常に残す） */}
          {countsConfirmed && (
            <span className="admin-numeric whitespace-nowrap text-[11px] leading-none text-foreground-600 sm:hidden">
              {isWaitingSchedule || isCancelled || !batchStatus
                ? `${total}件`
                : isRunning
                  ? `${processed}/${total}`
                  : isFailureState
                    ? `失敗 ${counts.failed}件`
                    : isExcludedState
                      ? `対象外 ${counts.excluded}件`
                      : `完了 ${counts.success}件`}
            </span>
          )}

          {/* 主要な件数（初回取得前は確定値として出さない） */}
          {countsConfirmed ? (
            <span className="hidden min-w-0 items-center gap-2.5 overflow-hidden pl-1 sm:flex">
              {isWaitingSchedule || isCancelled ? (
                <BarCount label="予約" value={total} />
              ) : !batchStatus ? (
                <BarCount label="対象" value={total} />
              ) : isRunning ? (
                <>
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
                  {counts.success > 0 && (
                    <BarCount
                      label="反映完了"
                      value={counts.success}
                      tone="success"
                      className="hidden lg:inline-flex"
                    />
                  )}
                </>
              ) : (
                <>
                  {isFailureState && (
                    <BarCount
                      label="失敗"
                      value={counts.failed}
                      tone="warning"
                    />
                  )}
                  {counts.success > 0 && (
                    <BarCount label="完了" value={counts.success} />
                  )}
                  {counts.excluded > 0 && (
                    <BarCount
                      label="対象外"
                      value={counts.excluded}
                      className={isFailureState ? "hidden md:inline-flex" : ""}
                    />
                  )}
                  {counts.review > 0 && (
                    <BarCount
                      label="要確認"
                      value={counts.review}
                      tone="warning"
                      className="hidden md:inline-flex"
                    />
                  )}
                  {!isFailureState && !isExcludedState && !isSuccessState && (
                    <BarCount label="処理済み" value={processed} />
                  )}
                </>
              )}
            </span>
          ) : (
            <span className="whitespace-nowrap text-[12px] text-foreground-500">
              確認中
            </span>
          )}

          {/* 開始できなかった場合の控えめな注意表示（詳細は履歴モーダルで確認） */}
          {dispatchErrorMessage && (
            <i
              className="ri-error-warning-line hidden w-4 h-4 shrink-0 items-center justify-center text-[15px] text-amber-600 sm:flex"
              title={dispatchErrorMessage}
              aria-label="開始時のエラーがあります（AI生成履歴で確認できます）"
            ></i>
          )}

          {/* 操作：予約日時の確認導線（予約待ちのみ）・結果を見る・閉じる */}
          <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
            {isWaitingSchedule && scheduledAt && (
              <button
                type="button"
                onClick={openResult}
                title={
                  formattedScheduledAt
                    ? `開始予定: ${formattedScheduledAt}`
                    : "予約日時を確認"
                }
                aria-label={
                  formattedScheduledAt
                    ? `予約日時を確認（開始予定: ${formattedScheduledAt}）`
                    : "予約日時を確認"
                }
                className={OUTLINE_BUTTON_CLASS}
              >
                <i
                  className="ri-calendar-schedule-line w-3.5 h-3.5 flex items-center justify-center text-[13px]"
                  aria-hidden="true"
                ></i>
                <span className="hidden whitespace-nowrap md:inline">
                  {shortScheduledAt}
                </span>
                <span className="whitespace-nowrap md:hidden">予約日時</span>
              </button>
            )}
            <button
              type="button"
              onClick={openResult}
              className={OUTLINE_BUTTON_CLASS}
            >
              結果を見る
            </button>
            {/* 追跡の破棄は状態によらず常に行える（サーバー側の処理は継続する） */}
            {!isResultOpen && (
              <button
                type="button"
                onClick={dismiss}
                aria-label="進捗表示を閉じる"
                title="進捗表示を閉じる"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-foreground-500 transition-colors hover:bg-background-200 hover:text-foreground-800"
              >
                <i className="ri-close-line w-3.5 h-3.5 flex items-center justify-center"></i>
              </button>
            )}
          </span>

          {/* 処理中だけの控えめな進捗ライン（確定済み件数 / 全件数の実データのみ） */}
          {isRunning && (
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-[2px] bg-background-200"
            >
              <span
                className="block h-full bg-foreground-400/60 transition-[width] duration-500 ease-out"
                style={{ width: `${processedRatio * 100}%` }}
              ></span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}