import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AiBatchResultModal from "@/pages/products/components/AiBatchResultModal";
import { useAiBatchGeneration } from "@/pages/products/hooks/useAiBatchGeneration";
import { isTerminalBatchStatus } from "@/pages/products/lib/aiBatch";
import type {
  AiBatchDisplayItem,
  AiBatchOverallStatus,
  AiBatchTarget,
} from "@/pages/products/types";

/**
 * AI一括生成のバッチ状態を「管理画面全体」で共有するためのコンテキスト。
 *
 * これまで商品一覧ページのローカルフックだったため、別画面へ移動すると
 * 進捗ポーリングがアンマウントされて途切れていた。プロバイダーをアプリ直下に
 * 1つだけ置くことで、
 *   - ポーリングは常に1系統（二重ポーリングしない）
 *   - 画面移動しても進捗が継続する
 *   - タブを閉じて開き直しても localStorage の batch_id / request_id から復帰する
 * を満たす。フック本体（useAiBatchGeneration）のロジックは変更しない。
 */
export interface AiBatchContextValue {
  items: AiBatchDisplayItem[] | null;
  batchStatus: AiBatchOverallStatus | null;
  batchId: string | null;
  isSubmitting: boolean;
  isPolling: boolean;
  isBusy: boolean;
  hasActiveBatch: boolean;
  errorMessage: string;
  pollError: string;
  /** 結果モーダルが開いているか */
  isResultOpen: boolean;
  /** 一括生成を開始する（受付直後だけ結果モーダルを自動表示する） */
  start: (targets: AiBatchTarget[]) => Promise<void>;
  /** 失敗分のみ再実行 */
  retryFailed: () => Promise<void>;
  /** バッチ状態を破棄する（保存済みIDも削除） */
  dismiss: () => void;
  /** 結果モーダルを開く */
  openResult: () => void;
  /** 結果モーダルを閉じる（終了状態なら破棄する） */
  closeResult: () => void;
}

const AiBatchContext = createContext<AiBatchContextValue | null>(null);

export function AiBatchProvider({ children }: { children: ReactNode }) {
  const {
    items,
    batchStatus,
    batchId,
    isSubmitting,
    isPolling,
    isBusy,
    hasActiveBatch,
    errorMessage,
    pollError,
    start: startBatch,
    retryFailed,
    dismiss,
  } = useAiBatchGeneration();

  const [isResultOpen, setIsResultOpen] = useState(false);

  // 受付開始時だけ結果モーダルを自動表示する。
  // 画面移動や再読込で復帰したときは自動で開かない（上部の進捗表示から開ける）。
  const start = useCallback(
    async (targets: AiBatchTarget[]) => {
      // items は start 内で同期的に用意されるため、先に開いても空表示にはならない。
      // 受付に失敗した場合もモーダル内で理由を確認できる。
      setIsResultOpen(true);
      await startBatch(targets);
    },
    [startBatch]
  );

  const openResult = useCallback(() => {
    setIsResultOpen(true);
  }, []);

  const closeResult = useCallback(() => {
    setIsResultOpen(false);
    // 終了状態ならバッチ状態を破棄する。処理中は破棄せず裏で継続させる
    // （保存済み batch_id から再読込でも復帰できる）。
    if (isTerminalBatchStatus(batchStatus)) {
      dismiss();
    }
  }, [batchStatus, dismiss]);

  const value = useMemo<AiBatchContextValue>(
    () => ({
      items,
      batchStatus,
      batchId,
      isSubmitting,
      isPolling,
      isBusy,
      hasActiveBatch,
      errorMessage,
      pollError,
      isResultOpen,
      start,
      retryFailed,
      dismiss,
      openResult,
      closeResult,
    }),
    [
      items,
      batchStatus,
      batchId,
      isSubmitting,
      isPolling,
      isBusy,
      hasActiveBatch,
      errorMessage,
      pollError,
      isResultOpen,
      start,
      retryFailed,
      dismiss,
      openResult,
      closeResult,
    ]
  );

  return (
    <AiBatchContext.Provider value={value}>
      {children}
      {/* 進捗・結果モーダルは共通化し、どの管理画面からでも開けるようにする */}
      <AiBatchResultModal
        open={isResultOpen}
        items={items}
        batchStatus={batchStatus}
        isPolling={isPolling}
        isSubmitting={isSubmitting}
        pollError={pollError}
        errorMessage={errorMessage}
        onRetryFailed={retryFailed}
        onClose={closeResult}
      />
    </AiBatchContext.Provider>
  );
}

export function useAiBatch(): AiBatchContextValue {
  const ctx = useContext(AiBatchContext);
  if (!ctx) {
    throw new Error("useAiBatch は AiBatchProvider の中で使用してください。");
  }
  return ctx;
}