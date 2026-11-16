interface DriveBulkImportConfirmDialogProps {
  open: boolean;
  targetCount: number | null;
  profileLabel: string;
  isTestMode: boolean;
  isStarting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DriveBulkImportConfirmDialog({
  open,
  targetCount,
  profileLabel,
  isTestMode,
  isStarting,
  onCancel,
  onConfirm,
}: DriveBulkImportConfirmDialogProps) {
  if (!open) return null;

  const countLabel =
    targetCount === null ? "—" : targetCount.toLocaleString("ja-JP");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-import-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-lg rounded-lg border border-background-200 bg-background-50 p-5">
        <div className="flex items-center gap-2">
          <i className="ri-play-circle-line flex h-5 w-5 items-center justify-center text-primary-600"></i>
          <h2
            id="drive-import-confirm-title"
            className="text-[16px] font-semibold leading-[1.4] text-foreground-950"
          >
            Drive一括取込の実行確認
          </h2>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-foreground-700">
          プロファイル「{profileLabel}」で、登録対象{" "}
          <span className="admin-numeric font-bold text-foreground-950">
            {countLabel}
          </span>{" "}
          件を取り込みます。
        </p>

        <p className="mt-2 text-[12px] leading-relaxed text-foreground-500">
          実行中は条件変更・再実行ができません。ジョブはサーバー側で継続するため、画面を閉じても処理は止まりません。
        </p>

        {isTestMode ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
            <i className="ri-flask-line mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center"></i>
            テストモードです。登録内容はテストデータ側に入り、実商品には反映されません。
          </p>
        ) : (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-400/80 bg-amber-100 px-3 py-2 text-[12px] font-medium leading-relaxed text-amber-900">
            <i className="ri-error-warning-line mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center"></i>
            本番モードです。実際の商品データとして登録されます。件数を確認してから実行してください。
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isStarting}
            className="whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-[13px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isStarting}
            className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-[13px] font-semibold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStarting ? (
              <>
                <i className="ri-loader-4-line flex h-4 w-4 animate-spin items-center justify-center"></i>
                開始しています...
              </>
            ) : (
              "実行する"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}