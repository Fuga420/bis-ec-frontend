import { useEffect, useMemo, useState } from "react";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import { adminThemeClass } from "@/lib/adminTheme";
import type {
  AiBatchDisplayItem,
  AiBatchDisplayStatus,
  AiBatchOverallStatus,
  AiBatchRunSummary,
} from "@/pages/products/types";
import {
  AI_BATCH_STATUS_LABELS,
  deriveAiBatchDisplayStatus,
  isTerminalBatchStatus,
} from "@/pages/products/lib/aiBatch";
import AiBatchResultRow from "@/pages/products/components/AiBatchResultRow";
import AiBatchRunSelector from "@/pages/products/components/AiBatchRunSelector";
import AiBatchProgressSummary from "@/pages/products/components/AiBatchProgressSummary";

interface AiBatchResultModalProps {
  open: boolean;
  items: AiBatchDisplayItem[] | null;
  batchStatus: AiBatchOverallStatus | null;
  batchId: string | null;
  scheduleId: string | null;
  activeRunKey: string | null;
  scheduledAt: string | null;
  createdAt: string | null;
  canCancelSchedule: boolean;
  dispatchErrorMessage: string;
  runs: AiBatchRunSummary[];
  isPolling: boolean;
  isSubmitting: boolean;
  isCancelling: boolean;
  pollError: string;
  errorMessage: string;
  onSelectRun: (runKey: string) => Promise<void> | void;
  onCancelSchedule: () => Promise<void> | void;
  onRetryFailed: () => void;
  onClose: () => void;
}

type ResultFilter = "all" | "success" | "failed" | "excluded" | "review";

function createEmptyCounts(): Record<AiBatchDisplayStatus, number> {
  return {
    pending: 0,
    retry_wait: 0,
    processing: 0,
    success: 0,
    failed: 0,
    excluded: 0,
    cancelled: 0,
    contract_violation: 0,
  };
}

/**
 * AI一括生成の「履歴・進捗・結果」モーダル。
 *
 * 情報設計は「履歴選択 → 全体結果 → 対応が必要な商品 → 詳細・再実行」の順。
 *  - ヘッダー（固定）：タイトル・全体状態・閉じる
 *  - 履歴＋進捗（固定）：実行日時と種別をまとめた履歴選択、処理済み件数中心のサマリー
 *  - 結果リスト（この領域だけスクロール）：商品名・商品ID・状態・エラー概要・商品詳細への導線
 *  - フッター（固定）：予約取消／失敗のみ再実行／閉じる
 *
 * 件数・割合はすべて API 応答（items[] の状態）の集計のみで、架空の進捗は使わない。
 * 取得・再実行・予約のロジックには関与しない。
 */
export default function AiBatchResultModal({
  open,
  items,
  batchStatus,
  batchId,
  scheduleId,
  activeRunKey,
  scheduledAt,
  createdAt,
  canCancelSchedule,
  dispatchErrorMessage,
  runs,
  isPolling,
  isSubmitting,
  isCancelling,
  pollError,
  errorMessage,
  onSelectRun,
  onCancelSchedule,
  onRetryFailed,
  onClose,
}: AiBatchResultModalProps) {
  const { isTestMode } = useOperatingMode();
  const [filter, setFilter] = useState<ResultFilter>("all");

  // 開き直したとき・表示対象ジョブを切り替えたときは絞り込みを解除する（前回の絞り込みで商品が見えない誤解を防ぐ）
  useEffect(() => {
    if (!open) setFilter("all");
  }, [open, activeRunKey]);

  // モーダル表示中は背景のページスクロールを止める（モーダル内の結果リストだけをスクロールさせる）
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const counts = useMemo(() => {
    const result = createEmptyCounts();
    (items ?? []).forEach((item) => {
      result[deriveAiBatchDisplayStatus(item)] += 1;
    });
    return result;
  }, [items]);

  const total = items?.length ?? 0;

  const terminal = isTerminalBatchStatus(batchStatus);
  const isWaitingSchedule =
    batchStatus === "scheduled" ||
    batchStatus === "starting" ||
    batchStatus === "dispatch_retry";
  const isCancelled = batchStatus === "cancelled";
  const hasFailure = counts.failed > 0 || batchStatus === "failed";
  const hasExcluded = counts.excluded > 0;
  const needsReview = counts.contract_violation > 0;
  const warning = dispatchErrorMessage || pollError || errorMessage;

  // 絞り込みは表示だけに作用し、元の配列順（処理順）は変えない。
  const visibleItems = useMemo(() => {
    const source = items ?? [];
    if (filter === "all") return source;
    return source.filter((item) => {
      const status = deriveAiBatchDisplayStatus(item);
      if (filter === "success") return status === "success";
      if (filter === "failed") return status === "failed";
      if (filter === "excluded") return status === "excluded";
      return status === "contract_violation";
    });
  }, [items, filter]);

  if (!open) return null;

  // 実行履歴が無い（または表示できるジョブが無い）場合の空状態。
  // ヘッダーの入口からは常に開けるようにするため、専用の画面は増やさず同じモーダル内で扱う。
  if (!items || items.length === 0) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="AI生成の履歴・結果"
      >
        <div
          className={`products-theme admin-font ${adminThemeClass(
            isTestMode
          )} w-full max-w-[440px] overflow-hidden rounded-[10px] border border-background-200 bg-white`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-background-200 px-6 py-3">
            <h3 className="admin-title text-[15px] font-semibold leading-[1.4] text-foreground-950">
              AI生成の履歴・結果
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              title="閉じる"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[16px] leading-none text-foreground-400 transition-colors hover:bg-background-100 hover:text-foreground-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-200"
            >
              <i className="ri-close-line"></i>
            </button>
          </div>

          <div className="px-6 py-9 text-center">
            <i className="ri-list-check-2 mx-auto flex h-8 w-8 items-center justify-center text-[26px] text-foreground-300"></i>
            <p className="mt-2 text-[13px] font-medium text-foreground-800">
              実行履歴はまだありません
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-foreground-500">
              商品一覧で商品を選択し「一括AI生成」を実行すると、進捗・結果・実行履歴がここに表示されます。
            </p>
            {errorMessage && (
              <p className="mt-2 text-[11px] leading-relaxed text-amber-800">
                {errorMessage}
              </p>
            )}
          </div>

          <div className="flex justify-end border-t border-background-200 px-6 py-3">
            <button
              type="button"
              onClick={onClose}
              className="h-8 cursor-pointer whitespace-nowrap rounded-md border border-background-300 bg-white px-3.5 text-[12px] font-semibold text-foreground-700 transition-colors hover:bg-background-100"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    );
  }

  const overallChipClass =
    batchStatus === "dispatch_retry"
      ? "tone-warning"
      : isCancelled
        ? "tone-neutral"
        : terminal
          ? hasFailure || needsReview
            ? "tone-warning"
            : "tone-success"
          : "tone-ai";

  const filterChips: { key: ResultFilter; label: string; count: number }[] = [
    { key: "all", label: "すべて", count: total },
    { key: "success", label: "反映完了", count: counts.success },
    { key: "failed", label: "失敗", count: counts.failed },
  ];
  if (hasExcluded) {
    filterChips.push({
      key: "excluded",
      label: "対象外",
      count: counts.excluded,
    });
  }
  if (needsReview) {
    filterChips.push({
      key: "review",
      label: "要確認",
      count: counts.contract_violation,
    });
  }

  // 状態に応じた短い補足（長い説明はサマリー内の折りたたみへ移動済み）
  const stateNote = isWaitingSchedule
    ? "開始予定時刻になると、サーバー側で順次生成します。"
    : isCancelled
      ? "この予約は開始前に取り消されました（AI生成は実行されていません）。"
      : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="AI生成の履歴・結果"
    >
      <div
        className={`products-theme admin-font ${adminThemeClass(
          isTestMode
        )} flex max-h-[88vh] w-full max-w-[960px] flex-col overflow-hidden rounded-[10px] border border-background-200 bg-white`}
      >
        {/* ヘッダー（固定） */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-background-200 px-6">
          <h3 className="admin-title min-w-0 truncate text-[15px] font-semibold leading-[1.4] text-foreground-950">
            AI生成の履歴・結果
          </h3>
          <div className="flex shrink-0 items-center gap-2">
            {batchStatus && (
              <span className={`st-badge ${overallChipClass}`}>
                {AI_BATCH_STATUS_LABELS[batchStatus]}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              title="閉じる"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[16px] leading-none text-foreground-400 transition-colors hover:bg-background-100 hover:text-foreground-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-200"
            >
              <i className="ri-close-line"></i>
            </button>
          </div>
        </div>

        {/* 履歴選択＋進捗サマリー（固定） */}
        <div className="shrink-0 border-b border-background-200 bg-background-50 px-6 py-3">
          <AiBatchRunSelector
            runs={runs}
            activeRunKey={activeRunKey}
            batchId={batchId}
            scheduleId={scheduleId}
            scheduledAt={scheduledAt}
            createdAt={createdAt}
            onSelectRun={onSelectRun}
          />
          {stateNote && (
            <p className="mt-2 text-[11px] leading-relaxed text-foreground-500">
              {stateNote}
            </p>
          )}
          <div className="mt-3 border-t border-background-200/80 pt-3">
            <AiBatchProgressSummary
              counts={counts}
              total={total}
              isWaitingSchedule={isWaitingSchedule}
              isTerminal={terminal}
              isCancelled={isCancelled}
              isPolling={isPolling}
              hasFailure={hasFailure}
              needsReview={needsReview}
              hasExcluded={hasExcluded}
              warning={warning}
              pollError={pollError}
            />
          </div>
        </div>

        {/* 結果フィルター（固定） */}
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-background-200 px-6 py-2">
          {filterChips.map((chip) => {
            const active = filter === chip.key;
            const isFailedChip = chip.key === "failed" && chip.count > 0;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilter(chip.key)}
                aria-pressed={active}
                className={`h-7 cursor-pointer whitespace-nowrap rounded-md border px-2.5 text-[11px] transition-colors ${
                  active
                    ? isFailedChip
                      ? "border-amber-300 bg-amber-50 font-medium text-amber-800"
                      : "border-primary-300 bg-primary-50 font-medium text-primary-700"
                    : "border-background-200 bg-white text-foreground-600 hover:bg-background-50"
                }`}
              >
                {chip.label}
                <span className="admin-numeric ml-1 text-foreground-400">
                  {chip.count}
                </span>
              </button>
            );
          })}
          <span className="admin-numeric ml-auto whitespace-nowrap text-[10px] leading-none text-foreground-400">
            {visibleItems.length}件を表示
          </span>
        </div>

        {/* 結果リスト（この領域だけスクロールする） */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {visibleItems.length === 0 ? (
            <p className="px-6 py-10 text-center text-[12px] text-foreground-500">
              該当する商品はありません。
            </p>
          ) : (
            visibleItems.map((item) => (
              <AiBatchResultRow key={item.product_id} item={item} />
            ))
          )}
        </div>

        {/* フッター（固定） */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-background-200 px-6 py-3">
          <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-foreground-400">
            {terminal
              ? "閉じても結果は保持され、いつでもこの画面から再確認できます。"
              : "この画面を閉じても処理はサーバー側で継続します。"}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {canCancelSchedule && (
              <button
                type="button"
                onClick={() => void onCancelSchedule()}
                disabled={isCancelling || isSubmitting}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-red-200 bg-white px-3 text-[12px] font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCancelling ? (
                  <i className="ri-loader-4-line flex h-3.5 w-3.5 animate-spin items-center justify-center text-[13px]"></i>
                ) : (
                  <i className="ri-close-circle-line flex h-3.5 w-3.5 items-center justify-center text-[13px]"></i>
                )}
                予約を取り消す
              </button>
            )}
            {terminal && (
              <button
                type="button"
                onClick={onRetryFailed}
                disabled={isSubmitting || counts.failed === 0}
                title={
                  counts.failed === 0
                    ? "再実行できる失敗商品がありません"
                    : "失敗した商品のみ再実行します"
                }
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-white px-3 text-[12px] font-semibold text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <i className="ri-loader-4-line flex h-3.5 w-3.5 animate-spin items-center justify-center text-[13px]"></i>
                ) : (
                  <i className="ri-refresh-line flex h-3.5 w-3.5 items-center justify-center text-[13px]"></i>
                )}
                失敗のみ再実行
                {counts.failed > 0 && (
                  <span className="admin-numeric text-[11px] text-foreground-500">
                    {counts.failed}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`h-8 cursor-pointer whitespace-nowrap rounded-md px-3.5 text-[12px] font-semibold transition-colors ${
                terminal && counts.failed === 0
                  ? "bg-primary-500 text-white hover:bg-primary-600"
                  : "border border-background-300 bg-white text-foreground-700 hover:bg-background-100"
              }`}
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}