interface PokecaLightProgressBarProps {
  /** 処理済み件数（status API の processed_count） */
  processed: number;
  /** 対象件数（status API の total_target_products） */
  total: number;
  /** 詳細パネルを開く */
  onOpen: () => void;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("ja-JP");
}

/**
 * ライト版AIの実行中だけ表示する1行の進捗。
 * 商品一覧の操作を妨げないよう高さを抑え、クリックで詳細パネルを開く。
 * 件数は既存のジョブ状態（worker_state）をそのまま表示する。
 */
export default function PokecaLightProgressBar({
  processed,
  total,
  onOpen,
}: PokecaLightProgressBarProps) {
  const safeTotal = total > 0 ? total : 0;
  const safeProcessed = safeTotal > 0 ? Math.min(processed, safeTotal) : processed;
  const percent =
    safeTotal > 0
      ? Math.min(100, Math.floor((safeProcessed / safeTotal) * 100))
      : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="ライト版AIの進捗詳細を開く"
      className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-background-200 bg-background-50 px-3 py-1.5 text-left transition-colors hover:bg-background-100"
    >
      <span className="whitespace-nowrap text-[12px] font-medium leading-none text-foreground-800">
        AI処理中
      </span>
      <span className="admin-numeric whitespace-nowrap text-[12px] leading-none tabular-nums text-foreground-700">
        {formatNumber(safeProcessed)}
        {safeTotal > 0 && ` / ${formatNumber(safeTotal)}`}
      </span>
      {percent !== null && (
        <span
          className="h-1 min-w-[72px] flex-1 overflow-hidden rounded-full bg-background-200"
          aria-hidden="true"
        >
          <span
            className="block h-full rounded-full bg-foreground-700"
            style={{ width: `${percent}%` }}
          ></span>
        </span>
      )}
      <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] leading-none text-foreground-500">
        詳細
      </span>
    </button>
  );
}