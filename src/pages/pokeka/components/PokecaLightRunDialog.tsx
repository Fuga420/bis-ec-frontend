interface PokecaLightRunDialogProps {
  open: boolean;
  count: number;
  isTestMode: boolean;
  isStarting: boolean;
  errorMessage: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * ライト版（旧裏ストレージ向け）の実行確認。
 * 対象はすべて旧裏ストレージ商品（このタブの表示対象）なので、通常商品の除外は起こらない。
 * 即時開始のみ（日時予約・原価・最低粗利率の入力は求めない）。
 */
export default function PokecaLightRunDialog({
  open,
  count,
  isTestMode,
  isStarting,
  errorMessage,
  onCancel,
  onConfirm,
}: PokecaLightRunDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ライト版AIの実行確認"
    >
      <div className="w-full max-w-lg rounded-lg border border-background-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <i className="ri-sparkling-line flex h-5 w-5 items-center justify-center text-[18px] text-primary-600"></i>
          <h3 className="admin-title text-[16px] font-semibold leading-[1.4] text-foreground-950">
            ライト版AIの実行確認
          </h3>
        </div>

        <p className="mt-3 text-sm text-foreground-700">
          選択中の{" "}
          <span className="admin-numeric font-bold text-foreground-950">
            {count}
          </span>{" "}
          件をライト版で処理します。
        </p>

        <ul className="mt-3 space-y-1.5 rounded-md bg-background-100 px-3 py-2.5 text-[12px] leading-relaxed text-foreground-600">
          <li className="flex items-start gap-1.5">
            <i className="ri-check-line mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[13px] text-primary-600"></i>
            対象はすべて旧裏ストレージ商品です（カード名・カード番号・イラストレーターを読み取り、短い説明文を生成します。価格は変更しません）。
          </li>
          <li className="flex items-start gap-1.5">
            <i className="ri-check-line mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[13px] text-primary-600"></i>
            即時開始のみ（日時指定の予約はできません）。原価・最低上乗せ率の入力はありません。
          </li>
          <li className="flex items-start gap-1.5">
            <i className="ri-check-line mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[13px] text-primary-600"></i>
            バックグラウンドで実行するため、画面を閉じても処理は継続します。進捗はこの画面と商品一覧の両方で確認できます。
          </li>
        </ul>

        {isTestMode && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            <i className="ri-flask-line mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[13px]"></i>
            テストモードのため、テスト商品だけを対象に実行します（実行結果は通常モードの表示には出ません）。
          </p>
        )}

        {errorMessage && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-700">
            <i className="ri-error-warning-line mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center"></i>
            {errorMessage}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isStarting}
            className="inline-flex h-10 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-background-300 bg-white px-4 text-[13px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isStarting || count === 0}
            className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary-500 px-4 text-[13px] font-semibold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStarting ? (
              <>
                <i className="ri-loader-4-line flex h-4 w-4 animate-spin items-center justify-center text-[15px]"></i>
                開始中...
              </>
            ) : (
              "ライト版で実行する"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}