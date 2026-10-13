import { MAX_AI_BATCH_SIZE } from "@/pages/products/lib/aiBatch";

interface AiBatchConfirmModalProps {
  open: boolean;
  count: number;
  isBusy: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function AiBatchConfirmModal({
  open,
  count,
  isBusy,
  errorMessage,
  onCancel,
  onConfirm,
}: AiBatchConfirmModalProps) {
  if (!open) return null;

  const tooMany = count > MAX_AI_BATCH_SIZE;
  const canRun = count > 0 && !tooMany && !isBusy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-background-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <i className="ri-sparkling-line w-5 h-5 flex items-center justify-center text-accent-600"></i>
          <h3 className="text-base font-bold text-foreground-950">
            一括AI生成の確認
          </h3>
        </div>
        <p className="mt-3 text-sm text-foreground-700">
          選択中の <span className="font-bold">{count}</span> 件を一括で受付します。サーバー側が順次生成し、画面を閉じても処理は継続します。
        </p>

        {tooMany ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
            <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
            一度に受付できるのは最大 {MAX_AI_BATCH_SIZE} 件です。選択を減らしてください。
          </p>
        ) : (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-background-100 px-3 py-2 text-xs leading-relaxed text-foreground-600">
            <i className="ri-information-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
            生成結果は候補として保存されます（確定・公開・Square登録は行いません）。約5秒間隔で進捗を確認し、失敗した商品のみ後から再実行できます。
          </p>
        )}

        {errorMessage && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
            <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
            {errorMessage}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canRun}
            className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-accent-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? (
              <>
                <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                受付中...
              </>
            ) : (
              "受付する"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}