import { useMemo } from "react";
import { useAiBatch } from "@/pages/products/context/AiBatchProvider";
import {
  AI_BATCH_STATUS_LABELS,
  deriveAiBatchDisplayStatus,
  isTerminalBatchStatus,
} from "@/pages/products/lib/aiBatch";

/**
 * AI一括生成の進捗を管理画面の上部に常時表示する帯。
 *
 * - バッチが無いときは何も描画しない（レイアウトを動かさない）
 * - ナビゲーションを隠さないよう、固定配置ではなくページ最上部のインライン帯にする
 * - 押すと結果モーダルを開く（どの画面からでも結果確認・再実行ができる）
 * - 通信エラー時は「完了」ではなく警告として表示する
 */
export default function AiBatchProgressBar() {
  const {
    items,
    batchStatus,
    isPolling,
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
      review: 0,
    };
    (items ?? []).forEach((item) => {
      const status = deriveAiBatchDisplayStatus(item);
      result.total += 1;
      if (status === "success") result.success += 1;
      else if (status === "processing") result.processing += 1;
      else if (status === "failed") result.failed += 1;
      else if (status === "contract_violation") result.review += 1;
      else result.waiting += 1;
    });
    return result;
  }, [items]);

  if (!items || items.length === 0) return null;

  const terminal = isTerminalBatchStatus(batchStatus);
  const stateLabel = pollError
    ? "進捗取得エラー"
    : batchStatus
      ? AI_BATCH_STATUS_LABELS[batchStatus]
      : "受付中";

  return (
    <div className="border-b border-accent-200 bg-accent-50">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1.5 md:px-6">
        <button
          type="button"
          onClick={openResult}
          className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-accent-900 transition-colors hover:bg-accent-100"
          aria-label="AI一括生成の進捗と結果を開く"
        >
          {isPolling ? (
            <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
          ) : terminal ? (
            <i className="ri-checkbox-circle-line w-3.5 h-3.5 flex items-center justify-center"></i>
          ) : (
            <i className="ri-sparkling-line w-3.5 h-3.5 flex items-center justify-center"></i>
          )}
          <span className="whitespace-nowrap font-bold">AI生成</span>
          <span className="whitespace-nowrap tabular-nums">
            {counts.success} / {counts.total}件
          </span>
          <span className="whitespace-nowrap text-accent-700">
            {stateLabel}
          </span>
        </button>

        {/* 内訳（受付待ち・処理中・完了・失敗）。モバイルでも折り返して表示する */}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 whitespace-nowrap text-[11px] text-foreground-600">
          <span className="tabular-nums">受付待ち {counts.waiting}</span>
          <span className="text-foreground-300">/</span>
          <span className="tabular-nums">処理中 {counts.processing}</span>
          <span className="text-foreground-300">/</span>
          <span className="tabular-nums">完了 {counts.success}</span>
          <span className="text-foreground-300">/</span>
          <span
            className={`tabular-nums ${counts.failed > 0 ? "font-bold text-red-700" : ""}`}
          >
            失敗 {counts.failed}
          </span>
        </span>

        {counts.review > 0 && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
            <i className="ri-error-warning-line w-3 h-3 flex items-center justify-center"></i>
            要確認 {counts.review}
          </span>
        )}

        {pollError && (
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800"
            title={pollError}
          >
            <i className="ri-error-warning-line w-3 h-3 flex items-center justify-center"></i>
            通信エラー（処理は継続中）
          </span>
        )}

        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={openResult}
            className="cursor-pointer whitespace-nowrap rounded-md border border-accent-300 bg-white px-2 py-0.5 text-[11px] font-medium text-accent-900 transition-colors hover:bg-accent-100"
          >
            結果を見る
          </button>
          {terminal && !isResultOpen && (
            <button
              type="button"
              onClick={dismiss}
              aria-label="進捗表示を閉じる"
              title="進捗表示を閉じる"
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-accent-900 transition-colors hover:bg-accent-100"
            >
              <i className="ri-close-line w-3.5 h-3.5 flex items-center justify-center"></i>
            </button>
          )}
        </span>
      </div>
    </div>
  );
}