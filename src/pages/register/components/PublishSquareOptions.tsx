interface PublishSquareOptionsProps {
  publishChecked: boolean;
  squareChecked: boolean;
  disabled?: boolean;
  onPublishChange: (checked: boolean) => void;
  onSquareChange: (checked: boolean) => void;
}

export default function PublishSquareOptions({
  publishChecked,
  squareChecked,
  disabled = false,
  onPublishChange,
  onSquareChange,
}: PublishSquareOptionsProps) {
  // 既存の連動条件は変更しない（公開OFF時はSquare連携できない）。
  const squareDisabled = disabled || !publishChecked;

  return (
    <div className="rounded-[10px] border border-background-200 bg-white">
      {/* 公開する */}
      <label
        className={`flex items-start gap-3 p-4 transition-colors ${
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:bg-background-50"
        }`}
      >
        <input
          type="checkbox"
          checked={publishChecked}
          disabled={disabled}
          onChange={(e) => onPublishChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary-500 disabled:cursor-not-allowed"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground-950">
              公開する
            </span>
            {publishChecked ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-700">
                <i className="ri-check-line text-[10px] flex items-center justify-center"></i>
                公開中として登録
              </span>
            ) : (
              <span className="whitespace-nowrap rounded-full bg-background-100 px-2 py-0.5 text-[10px] font-medium text-foreground-500">
                下書きとして登録
              </span>
            )}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-foreground-500">
            チェックを外すと下書き（非公開）で登録されます。
          </span>
        </span>
      </label>

      <div className="border-t border-background-200"></div>

      {/* Square本番へ連携・公開する */}
      <label
        className={`flex items-start gap-3 p-4 transition-colors ${
          squareDisabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:bg-background-50"
        }`}
      >
        <input
          type="checkbox"
          checked={squareChecked && publishChecked}
          disabled={squareDisabled}
          onChange={(e) => onSquareChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-amber-500 disabled:cursor-not-allowed"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground-950">
              Square本番へ連携・公開する
            </span>
            <span className="whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              本番環境
            </span>
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-foreground-500">
            登録と同時に、Squareへ商品・画像・在庫を反映し、決済リンクを生成します。
            {!publishChecked && "（下書きのため連携できません）"}
          </span>
        </span>
      </label>

      {/* 注意事項 */}
      <div className="flex flex-col gap-2 border-t border-background-200 px-4 py-3">
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-foreground-500">
          <i className="ri-information-line mt-0.5 w-4 h-4 shrink-0 flex items-center justify-center"></i>
          <span>
            公開をオフにすると下書きとして扱われ、Square連携は実行されません。
          </span>
        </p>
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-700">
          <i className="ri-alert-line mt-0.5 w-4 h-4 shrink-0 flex items-center justify-center"></i>
          <span>
            Square本番連携を有効にすると、Squareの商品ページにも公開されます。
          </span>
        </p>
      </div>
    </div>
  );
}