interface IndeterminateProgressBarProps {
  // 読み上げ用の説明（画面には出さない）。
  label?: string;
  // 高さや余白を呼び出し側で調整できるようにする。
  className?: string;
}

/**
 * 進捗率が取得できない処理に使う「不確定」プログレスバー。
 *
 * - 数値（%）は一切表示しない。時間経過で増える演出も行わない。
 * - 帯がゆっくり流れるだけの控えめなアニメーションにし、
 *   OSの「視差効果を減らす」設定では静止表示にフォールバックする。
 */
export default function IndeterminateProgressBar({
  label = "処理中",
  className = "",
}: IndeterminateProgressBarProps) {
  return (
    <div className={className}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuetext="処理中"
        className="relative h-1 w-full overflow-hidden rounded-full bg-background-200"
      >
        <span className="indeterminate-progress-bar absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary-500"></span>
      </div>
    </div>
  );
}