import { Link } from "react-router-dom";
import type {
  AiBatchDisplayItem,
  AiBatchDisplayStatus,
  AiBatchOverallStatus,
} from "@/pages/products/types";
import {
  AI_BATCH_STATUS_LABELS,
  deriveAiBatchDisplayStatus,
  explainAiBatchError,
  isCostMarkupFloorBasis,
  isTerminalBatchStatus,
} from "@/pages/products/lib/aiBatch";

interface AiBatchResultModalProps {
  open: boolean;
  items: AiBatchDisplayItem[] | null;
  batchStatus: AiBatchOverallStatus | null;
  isPolling: boolean;
  isSubmitting: boolean;
  pollError: string;
  errorMessage: string;
  onRetryFailed: () => void;
  onClose: () => void;
}

const DISPLAY_STATUS_LABELS: Record<AiBatchDisplayStatus, string> = {
  pending: "待機中",
  retry_wait: "再試行待ち",
  processing: "処理中",
  // 契約上 completed は「生成および下書き自動反映完了」を意味する
  success: "反映完了",
  failed: "失敗",
  // GAS 契約外応答（completed と error_code の同時返却）
  contract_violation: "要確認（契約外）",
};

const DISPLAY_STATUS_STYLES: Record<AiBatchDisplayStatus, string> = {
  pending: "bg-background-100 text-foreground-600",
  retry_wait: "bg-amber-100 text-amber-800",
  processing: "bg-background-100 text-foreground-700",
  success: "bg-primary-100 text-primary-500",
  failed: "bg-red-100 text-red-800",
  contract_violation: "bg-amber-100 text-amber-900",
};

const DISPLAY_STATUS_ORDER: AiBatchDisplayStatus[] = [
  "pending",
  "retry_wait",
  "processing",
  "success",
  "failed",
  "contract_violation",
];

export default function AiBatchResultModal({
  open,
  items,
  batchStatus,
  isPolling,
  isSubmitting,
  pollError,
  errorMessage,
  onRetryFailed,
  onClose,
}: AiBatchResultModalProps) {
  if (!open || !items) return null;

  const counts: Record<AiBatchDisplayStatus, number> = {
    pending: 0,
    retry_wait: 0,
    processing: 0,
    success: 0,
    failed: 0,
    contract_violation: 0,
  };
  items.forEach((item) => {
    counts[deriveAiBatchDisplayStatus(item)] += 1;
  });

  const terminal = isTerminalBatchStatus(batchStatus);
  const warning = pollError || errorMessage;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-background-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <i className="ri-sparkling-line w-5 h-5 flex items-center justify-center text-accent-600"></i>
            <h3 className="text-base font-bold text-foreground-950">
              一括AI生成の進捗・結果
            </h3>
          </div>
          {batchStatus && (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-background-100 px-3 py-1 text-xs font-medium text-foreground-700">
              {isPolling && (
                <i className="ri-loader-4-line animate-spin w-3 h-3 flex items-center justify-center"></i>
              )}
              {AI_BATCH_STATUS_LABELS[batchStatus]}
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {DISPLAY_STATUS_ORDER.map((status) => (
            <div
              key={status}
              className="rounded-md bg-background-100 px-3 py-2 text-center"
            >
              <p className="text-[11px] text-foreground-500">
                {DISPLAY_STATUS_LABELS[status]}
              </p>
              <p className="text-sm font-bold text-foreground-950">
                {counts[status]} 件
              </p>
            </div>
          ))}
        </div>

        <p className="mt-3 flex items-start gap-1.5 rounded-md bg-background-100 px-3 py-2 text-xs leading-relaxed text-foreground-600">
          <i className="ri-information-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
          完了した商品は、GAS側で同じ商品の下書き（商品情報・英文翻訳など）へ自動反映されます。商品ごとの確定操作は不要で、修正は商品詳細の「商品情報を編集」から行えます。
        </p>

        {warning && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
            {warning}
          </p>
        )}

        {counts.contract_violation > 0 && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
            <span>
              {counts.contract_violation}件が「status:completed と error_code
              の同時返却（GAS の契約外応答）」です。成功表示はしていませんが、
              GAS 側では completed 扱いのため「失敗のみ再実行」の対象に含まれない
              可能性があります。各商品を開いて下書きの内容を確認してください。
            </span>
          </p>
        )}

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-md border border-background-200">
          {items.map((item) => {
            const display = deriveAiBatchDisplayStatus(item);
            return (
              <div
                key={item.product_id}
                className="flex items-start gap-3 border-b border-background-200 px-3 py-2.5 last:border-b-0"
              >
                <span
                  className={`mt-0.5 inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium leading-none ${
                    DISPLAY_STATUS_STYLES[display]
                  }`}
                >
                  {display === "processing" && (
                    <i className="ri-loader-4-line animate-spin w-3 h-3 flex items-center justify-center"></i>
                  )}
                  {DISPLAY_STATUS_LABELS[display]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground-950">
                    {item.product_name}
                  </p>
                  <p className="truncate font-mono text-xs text-foreground-500">
                    {item.product_id}
                  </p>
                  {(item.proposed_price != null || item.price_note) && (
                    <div className="mt-1 rounded-md bg-background-100 px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.proposed_price != null && (
                          <p className="text-xs font-semibold tabular-nums text-foreground-900">
                            提案価格 ¥{item.proposed_price.toLocaleString("ja-JP")}
                          </p>
                        )}
                        {isCostMarkupFloorBasis(item.price_basis) && (
                          <span className="inline-flex h-[18px] items-center whitespace-nowrap rounded-md bg-secondary-100 px-1.5 text-[10px] font-medium text-secondary-900">
                            原価上乗せ下限
                          </span>
                        )}
                      </div>
                      {item.price_note && (
                        <p className="mt-0.5 break-words text-[11px] leading-relaxed text-foreground-600">
                          {item.price_note}
                        </p>
                      )}
                      <p className="mt-0.5 break-words text-[10px] leading-relaxed text-foreground-500">
                        原価は確定済みの仕入明細からの概算です（税額未確認の明細を含む場合があります）。
                      </p>
                    </div>
                  )}
                  {display === "failed" &&
                    (item.error_code || item.error_message) && (
                      <p className="mt-0.5 break-words text-xs text-red-700">
                        {explainAiBatchError(item.error_code, item.error_message)}
                        {item.error_code ? `（コード: ${item.error_code}）` : ""}
                      </p>
                    )}
                  {display === "contract_violation" && (
                    <>
                      {(item.error_code || item.error_message) && (
                        <p className="mt-0.5 break-words text-xs text-amber-900">
                          {explainAiBatchError(
                            item.error_code,
                            item.error_message
                          )}
                          {item.error_code ? `（コード: ${item.error_code}）` : ""}
                        </p>
                      )}
                      <p className="mt-1 break-words text-[11px] leading-relaxed text-amber-800">
                        GAS側は completed のため「失敗のみ再実行」に含まれない場合があります。商品詳細で下書きを確認してください。
                      </p>
                    </>
                  )}
                  {display === "success" && (
                    <Link
                      to={`/products/${item.product_id}`}
                      className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
                    >
                      <i className="ri-article-line w-3.5 h-3.5 flex items-center justify-center"></i>
                      商品を開く
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          {terminal && counts.failed > 0 && (
            <button
              type="button"
              onClick={onRetryFailed}
              disabled={isSubmitting}
              className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-accent-300 bg-accent-50 px-4 py-2 text-sm font-bold text-accent-900 transition-colors hover:bg-accent-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
              失敗のみ再実行
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}