import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import { adminThemeClass } from "@/lib/adminTheme";
import AiBatchResultModal from "@/pages/products/components/AiBatchResultModal";
import { useAiBatchGeneration } from "@/pages/products/hooks/useAiBatchGeneration";
import { isTerminalBatchStatus } from "@/pages/products/lib/aiBatch";
import type {
  AiBatchDisplayItem,
  AiBatchOverallStatus,
  AiBatchRunSummary,
  AiBatchTarget,
} from "@/pages/products/types";

export interface AiBatchContextValue {
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
  isSubmitting: boolean;
  isCancelling: boolean;
  isPolling: boolean;
  isBusy: boolean;
  /** 進捗を取得できず状態を断定できない（ポーリングは継続中） */
  isTrackingUnknown: boolean;
  /** items の件数がサーバーの実データに基づくか（復元直後は false） */
  countsConfirmed: boolean;
  /** 追跡を終了したことを一度だけ知らせるメッセージ */
  noticeMessage: string;
  hasActiveBatch: boolean;
  errorMessage: string;
  pollError: string;
  isResultOpen: boolean;
  clearError: () => void;
  /** 通知メッセージを閉じる */
  clearNoticeMessage: () => void;
  start: (
    targets: AiBatchTarget[],
    minCostMarkupRate?: number,
    options?: { testOnly?: boolean; forceRegenerate?: boolean }
  ) => Promise<boolean>;
  schedule: (
    targets: AiBatchTarget[],
    scheduledAtIso: string,
    minCostMarkupRate?: number,
    options?: { testOnly?: boolean; forceRegenerate?: boolean }
  ) => Promise<boolean>;
  cancelSchedule: (targetScheduleId?: string) => Promise<void>;
  selectRun: (runKey: string) => Promise<void>;
  openRunHistory: () => Promise<void>;
  retryFailed: () => Promise<void>;
  dismiss: () => void;
  openResult: () => void;
  closeResult: () => void;
}

const AiBatchContext = createContext<AiBatchContextValue | null>(null);

export function AiBatchProvider({ children }: { children: ReactNode }) {
  const { isTestMode } = useOperatingMode();
  const {
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
    isSubmitting,
    isCancelling,
    isPolling,
    isBusy,
    isTrackingUnknown,
    countsConfirmed,
    noticeMessage,
    hasActiveBatch,
    errorMessage,
    pollError,
    clearError,
    clearNoticeMessage,
    start: startBatch,
    schedule: scheduleBatch,
    cancelSchedule,
    selectRun,
    refreshRuns,
    retryFailed,
    dismiss,
  } = useAiBatchGeneration(isTestMode);

  const [isResultOpen, setIsResultOpen] = useState(false);

  const start = useCallback(
    async (
      targets: AiBatchTarget[],
      minCostMarkupRate?: number,
      options?: { testOnly?: boolean; forceRegenerate?: boolean }
    ): Promise<boolean> => {
      const ok = await startBatch(targets, minCostMarkupRate, options);
      if (ok) {
        setIsResultOpen(true);
      }
      return ok;
    },
    [startBatch]
  );

  const schedule = useCallback(
    async (
      targets: AiBatchTarget[],
      scheduledAtIso: string,
      minCostMarkupRate?: number,
      options?: { testOnly?: boolean; forceRegenerate?: boolean }
    ): Promise<boolean> => {
      const ok = await scheduleBatch(
        targets,
        scheduledAtIso,
        minCostMarkupRate,
        options
      );
      if (ok) {
        setIsResultOpen(true);
      }
      return ok;
    },
    [scheduleBatch]
  );

  const openResult = useCallback(() => {
    setIsResultOpen(true);
  }, []);

  // ヘッダーの入口からは、履歴が1件も無い場合でも同じモーダルを開いて空状態を表示する
  // （新しい履歴保存や新しい取得APIは追加せず、既存の一覧取得だけを使う）。
  const openRunHistory = useCallback(async () => {
    const list = await refreshRuns(isTestMode);
    const targetKey = activeRunKey || list[0]?.run_key;
    if (targetKey) {
      await selectRun(targetKey);
    }
    setIsResultOpen(true);
  }, [refreshRuns, isTestMode, activeRunKey, selectRun]);

  // 完了後に閉じたら上部の進捗帯を閉じ、「AI生成履歴・予約」からいつでも再閲覧可能にする
  const closeResult = useCallback(() => {
    setIsResultOpen(false);
    if (isTerminalBatchStatus(batchStatus)) {
      dismiss();
    }
  }, [batchStatus, dismiss]);

  const value = useMemo<AiBatchContextValue>(
    () => ({
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
      isSubmitting,
      isCancelling,
      isPolling,
      isBusy,
      isTrackingUnknown,
      countsConfirmed,
      noticeMessage,
      hasActiveBatch,
      errorMessage,
      pollError,
      isResultOpen,
      clearError,
      clearNoticeMessage,
      start,
      schedule,
      cancelSchedule,
      selectRun,
      openRunHistory,
      retryFailed,
      dismiss,
      openResult,
      closeResult,
    }),
    [
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
      isSubmitting,
      isCancelling,
      isPolling,
      isBusy,
      isTrackingUnknown,
      countsConfirmed,
      noticeMessage,
      hasActiveBatch,
      errorMessage,
      pollError,
      isResultOpen,
      clearError,
      clearNoticeMessage,
      start,
      schedule,
      cancelSchedule,
      selectRun,
      openRunHistory,
      retryFailed,
      dismiss,
      openResult,
      closeResult,
    ]
  );

  return (
    <AiBatchContext.Provider value={value}>
      {children}
      {/* モーダルはアプリ直下に1つだけ置き、どの画面・どのデバイスからでも即時実行と予約の両方を開ける */}
      <AiBatchResultModal
        open={isResultOpen}
        items={items}
        batchStatus={batchStatus}
        batchId={batchId}
        scheduleId={scheduleId}
        activeRunKey={activeRunKey}
        scheduledAt={scheduledAt}
        createdAt={createdAt}
        canCancelSchedule={canCancelSchedule}
        dispatchErrorMessage={dispatchErrorMessage}
        runs={runs}
        isPolling={isPolling}
        isSubmitting={isSubmitting}
        isCancelling={isCancelling}
        pollError={pollError}
        errorMessage={errorMessage}
        onSelectRun={selectRun}
        onCancelSchedule={cancelSchedule}
        onRetryFailed={retryFailed}
        onClose={closeResult}
      />
      {/* 追跡を終了した理由を一度だけ控えめに知らせる（進捗バーは既に消えているため） */}
      {noticeMessage && (
        <div
          className={`products-theme admin-font ${adminThemeClass(
            isTestMode
          )} pointer-events-none fixed bottom-4 left-1/2 z-40 w-[min(92vw,460px)] -translate-x-1/2`}
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-auto flex items-start gap-2 rounded-lg border border-background-200 bg-white px-3 py-2">
            <i className="ri-information-line mt-0.5 flex h-4 w-4 items-center justify-center text-[15px] text-foreground-400"></i>
            <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-foreground-700">
              {noticeMessage}
            </p>
            <button
              type="button"
              onClick={clearNoticeMessage}
              aria-label="通知を閉じる"
              title="通知を閉じる"
              className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-foreground-400 transition-colors hover:bg-background-100 hover:text-foreground-700"
            >
              <i className="ri-close-line flex h-3.5 w-3.5 items-center justify-center text-[13px]"></i>
            </button>
          </div>
        </div>
      )}
    </AiBatchContext.Provider>
  );
}

export function useAiBatch(): AiBatchContextValue {
  const ctx = useContext(AiBatchContext);
  if (!ctx) {
    throw new Error("useAiBatch must be used within AiBatchProvider");
  }
  return ctx;
}
