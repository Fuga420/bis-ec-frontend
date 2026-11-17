interface GradePendingNoticeProps {
  /**
   * グレードの有無を既存の一覧データから判定できなかった商品の件数。
   * 0 件のときは件数を出さない（もっともらしい数字を作らない）。
   */
  undeterminedCount: number;
  isLoading?: boolean;
}

/**
 * 「グレードあり」タブの受け皿。
 *
 * 一覧APIは鑑定状態・鑑定機関・グレード値を返さないため、グレードありの商品を
 * 既存データから確定できない。推測で一覧を作らず、状態だけを短く示す。
 * 分類条件（商品詳細の鑑定情報を一覧に載せる等）が整ったら、この表示を一覧に差し替える。
 */
export default function GradePendingNotice({
  undeterminedCount,
  isLoading = false,
}: GradePendingNoticeProps) {
  return (
    <div className="ui-card rounded-lg px-5 py-10">
      <p className="text-sm font-medium text-foreground-800">
        グレードありの判定条件が整っていません
      </p>
      {!isLoading && undeterminedCount > 0 && (
        <p className="mt-2 text-[12px] leading-relaxed text-foreground-500">
          グレード未判定{" "}
          <span className="admin-numeric font-semibold text-foreground-800">
            {undeterminedCount.toLocaleString("ja-JP")}
          </span>{" "}
          件
        </p>
      )}
    </div>
  );
}