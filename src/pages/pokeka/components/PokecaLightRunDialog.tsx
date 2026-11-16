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
        <h3 className="admin-title text-[16px] font-semibold leading-[1.4] text-foreground-950">
          ライト版AIの実行確認
        </h3>

        <p className="mt-3 text-sm text-foreground-700">
          選択中の{" "}
          <span className="admin-numeric font-bold text-foreground-950">
            {count}
          </span>{" "}
          件をライト版で処理します。
        </p>

        <ul className="mt-3 space-y-1.5 rounded-md bg-background-100 px-3 py-2.5 text-[12px] leading-relaxed text-foreground-600">
          <li>
            対象はすべて旧裏ストレージ商品です（カード名・カード番号・イラストレーターを読み取り、短い説明文を生成します。価格は変更しません）。
          </li>
          <li>
            即時開始のみ（日時指定の予約はできません）。原価・最低上乗せ率の入力はありません。
          </li>
          <li>
            バックグラウンドで実行するため、画面を閉じても処理は継続します。進捗はこの画面と商品一覧の両方で確認できます。
          </li>
        </ul>

        {isTestMode && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            テストモードのため、テスト商品だけを対象に実行します（実行結果は通常モードの表示には出ません）。
          </p>
        )}

        {errorMessage && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-700">
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
            className="inline-flex h-10 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-foreground-950 bg-foreground-950 px-4 text-[13px] font-semibold text-background-50 transition-colors hover:bg-foreground-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isStarting ? "開始中" : "実行"}
          </button>
        </div>
      </div>
    </div>
  );
}