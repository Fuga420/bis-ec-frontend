interface BulkArchiveConfirmModalProps {
  open: boolean;
  count: number;
  isRunning: boolean;
  progress: { done: number; total: number };
  onCancel: () => void;
  onConfirm: () => void;
}

// 一括アーカイブの確認ダイアログ。対象件数を必ず示し、実行中は連打できないようにする。
export default function BulkArchiveConfirmModal({
  open,
  count,
  isRunning,
  progress,
  onCancel,
  onConfirm,
}: BulkArchiveConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-background-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <i className="ri-archive-line w-5 h-5 flex items-center justify-center text-red-600"></i>
          <h3 className="text-base font-bold text-foreground-950">
            一括アーカイブの確認
          </h3>
        </div>
        <p className="mt-3 text-sm text-foreground-700">
          選択中の <span className="font-bold">{count}</span> 件をアーカイブします。
          内容を確認してください。
        </p>

        <p className="mt-3 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          <i className="ri-information-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
          <span>
            アーカイブに成功した商品は通常の商品一覧・公開サイトから消え、「アーカイブ済み」一覧に表示されます。Square連携済みの商品はSquare側でも販売停止・アーカイブされます。商品データと画像は削除されません（完全削除は行いません）。
          </span>
        </p>

        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-background-100 px-3 py-2 text-xs leading-relaxed text-foreground-600">
          <i className="ri-information-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
          <span>
            アーカイブ後に商品を復元（active に戻す）しても、Square側は自動では再開されません。Squareで再開・再連携が必要です。
          </span>
        </p>

        <p className="mt-2 text-xs text-foreground-500">
          1件ずつ順番に処理します。成功した商品は再送せず、失敗した商品だけを後から再試行できます。通信断などで結果を確認できない商品は「受付結果不明・要確認」として表示し、成功・失敗を確定しません。
        </p>

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

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isRunning}
            className="whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isRunning}
            className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                処理中...
              </>
            ) : (
              "アーカイブする"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}