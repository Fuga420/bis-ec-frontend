import type {
  BulkArchiveStatus,
  BulkArchiveResultItem,
  BulkArchiveCounts,
} from "@/pages/products/hooks/useBulkArchive";

interface BulkArchiveResultModalProps {
  results: BulkArchiveResultItem[] | null;
  counts: BulkArchiveCounts | null;
  isRunning: boolean;
  progress: { done: number; total: number };
  onRetryFailed: () => void;
  onReverifyUnknown: () => void;
  onClose: () => void;
}

const STATUS_LABELS: Record<BulkArchiveStatus, string> = {
  success: "成功",
  failed: "失敗",
  skipped: "スキップ",
  unknown: "要確認",
};

const STATUS_STYLES: Record<BulkArchiveStatus, string> = {
  success: "bg-primary-100 text-primary-500",
  failed: "bg-red-100 text-red-800",
  skipped: "bg-background-100 text-foreground-600",
  unknown: "bg-amber-100 text-amber-800",
};

const STATUS_ORDER: BulkArchiveStatus[] = [
  "success",
  "failed",
  "skipped",
  "unknown",
];

// 一括アーカイブの結果。成功／失敗／スキップ／要確認を独立表示し、途中失敗を全件成功と見せない。
// - 失敗（確定失敗）がある場合のみ「失敗のみ再試行」を表示する（成功・スキップ・要確認分は再送しない）。
// - 受付結果不明（要確認）がある場合は「要確認分を再確認」で現在の状態を再取得できる。
export default function BulkArchiveResultModal({
  results,
  counts,
  isRunning,
  progress,
  onRetryFailed,
  onReverifyUnknown,
  onClose,
}: BulkArchiveResultModalProps) {
  if (!results || !counts) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-background-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <i className="ri-archive-line w-5 h-5 flex items-center justify-center text-red-600"></i>
          <h3 className="text-base font-bold text-foreground-950">
            一括アーカイブの結果
          </h3>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STATUS_ORDER.map((status) => (
            <div
              key={status}
              className="rounded-md bg-background-100 px-3 py-2 text-center"
            >
              <p className="text-[11px] text-foreground-500">
                {STATUS_LABELS[status]}
              </p>
              <p className="text-sm font-bold text-foreground-950">
                {counts[status]} 件
              </p>
            </div>
          ))}
        </div>

        {counts.failed > 0 && !isRunning && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
            <span>
              失敗した商品があります。「失敗のみ再試行」は失敗した
              <span className="font-bold">{counts.failed}</span>
              件だけを再実行します（成功・スキップ・要確認分は再送しません）。
            </span>
          </p>
        )}

        {counts.unknown > 0 && !isRunning && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            <i className="ri-question-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
            <span>
              <span className="font-bold">受付結果不明・要確認</span>
              の商品が{counts.unknown}件あります。通信エラー等で結果を確認できないため、成功・確定失敗のどちらにも決めていません。「要確認分を再確認」で現在の状態を再取得できます（成功・失敗が確定した商品は再送しません）。
            </span>
          </p>
        )}

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-md border border-background-200">
          {results.map((item) => (
            <div
              key={item.product_id}
              className="flex items-start gap-3 border-b border-background-200 px-3 py-2.5 last:border-b-0"
            >
              <span
                className={`mt-0.5 inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-md px-2 text-[11px] font-medium leading-none ${
                  STATUS_STYLES[item.status]
                }`}
              >
                {STATUS_LABELS[item.status]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground-950">
                  {item.product_name}
                </p>
                <p className="truncate font-mono text-xs text-foreground-500">
                  {item.product_id}
                </p>
                {item.reason && (
                  <p className="mt-0.5 text-xs text-foreground-600">
                    {item.reason}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {isRunning && (
          <div className="mt-3 rounded-md bg-background-100 px-3 py-2">
            <div className="flex items-center gap-2">
              <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center text-primary-600"></i>
              <span className="text-xs font-bold text-foreground-700">
                処理中 {progress.done} / {progress.total}件
              </span>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {counts.unknown > 0 && (
            <button
              type="button"
              onClick={onReverifyUnknown}
              disabled={isRunning}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="ri-question-line w-4 h-4 flex items-center justify-center"></i>
              要確認分を再確認
            </button>
          )}
          {counts.failed > 0 && (
            <button
              type="button"
              onClick={onRetryFailed}
              disabled={isRunning}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-bold text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
              失敗のみ再試行
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}