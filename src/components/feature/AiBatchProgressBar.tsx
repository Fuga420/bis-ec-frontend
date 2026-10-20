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
 * - AI生成の全体進捗はこの帯だけに表示する（商品選択アクションバーには出さない）
 * - 押せるボタンは「結果を見る」1つだけ。件数・状態はテキストとして表示する
 * - 商品のチェック状態とは独立して表示する（選択解除しても消えない）
 * - 通信エラー時は「完了」ではなく警告として表示する
 * - 完了数は実データの集計のみ。架空の進捗率は使わない
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

  // 実データ（完了件数 / 総件数）だけで帯の進み具合を表現する
  const completedRatio =
    counts.total > 0 ? Math.min(1, counts.success / counts.total) : 0;

  const stateClass = pollError
    ? "border-red-200 bg-red-50 text-red-700"
    : terminal
      ? "border-primary-200 bg-primary-50 text-primary-700"
      : "border-background-200 bg-background-100 text-foreground-700";

  const barClass = pollError
    ? "bg-red-400"
    : terminal
      ? "bg-primary-500"
      : "bg-primary-400";

  return (
    <div className="border-b border-background-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-2.5 gap-y-1 px-4 pt-1.5 pb-2 md:px-6">
        <span className="flex min-w-0 items-center gap-1.5">
          {isPolling ? (
            <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center text-primary-600"></i>
          ) : terminal ? (
            <i className="ri-checkbox-circle-line w-3.5 h-3.5 flex items-center justify-center text-primary-600"></i>
          ) : (
            <i className="ri-sparkling-line w-3.5 h-3.5 flex items-center justify-center text-primary-600"></i>
          )}
          <span className="whitespace-nowrap text-xs font-bold text-foreground-950">
            AI生成
          </span>
          <span className="whitespace-nowrap text-xs font-medium tabular-nums text-foreground-800">
            {counts.success} / {counts.total}件
          </span>
        </span>

        <span
          className={`inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${stateClass}`}
        >
          {stateLabel}
        </span>

        {/* 内訳（受付待ち・処理中・完了・失敗）。実データのみ */}
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 whitespace-nowrap text-[11px] text-foreground-500">
          <span className="tabular-nums">受付待ち {counts.waiting}</span>
          <span className="text-foreground-300">/</span>
          <span className="tabular-nums text-foreground-700">
            処理中 {counts.processing}
          </span>
          <span className="text-foreground-300">/</span>
          <span className="tabular-nums font-medium text-primary-700">
            完了 {counts.success}
          </span>
          <span className="text-foreground-300">/</span>
          <span
            className={`tabular-nums ${counts.failed > 0 ? "font-bold text-red-700" : ""}`}
          >
            失敗 {counts.failed}
          </span>
        </span>

        {counts.review > 0 && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-secondary-200 bg-secondary-100 px-1.5 py-0.5 text-[11px] font-medium text-secondary-900">
            <i className="ri-error-warning-line w-3 h-3 flex items-center justify-center"></i>
            要確認 {counts.review}
          </span>
        )}

        {pollError && (
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700"
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
            className="cursor-pointer whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 py-1 text-[11px] font-medium text-foreground-800 transition-colors hover:bg-background-100"
          >
            結果を見る
          </button>
          {terminal && !isResultOpen && (
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