import type { LedgerMatchStatus } from "../lib/ledgerMatch";

interface LedgerMatchCellProps {
  // undefined = 取得できていない（不明）。勝手に「未照合」とは表示しない。
  status?: LedgerMatchStatus;
  loading: boolean;
}

const LABELS: Record<LedgerMatchStatus, string> = {
  matched: "照合済み",
  needs_check: "要確認",
  unlinked: "未照合",
};

const ICONS: Record<LedgerMatchStatus, string> = {
  matched: "ri-check-line",
  needs_check: "ri-alert-line",
  unlinked: "ri-subtract-line",
};

/**
 * 商品一覧の「仕入照合」セル。
 *
 * 照合は「照合ドメイン」なので、色は黄色（amber）系に固定する。
 * 状態の差は色相ではなく「塗りの濃さ・枠線・アイコン」で表す。
 *  - 照合済み: 黄色の塗り + チェック
 *  - 要確認  : 濃い黄色 + 警告
 *  - 未照合  : 黄色の枠線のみ
 * 高さ・文字サイズは他のステータスバッジと同じ（.st-badge）。
 */
export default function LedgerMatchCell({
  status,
  loading,
}: LedgerMatchCellProps) {
  if (loading || !status) {
    return (
      <span
        className="inline-flex h-[22px] items-center gap-1 whitespace-nowrap text-[11px] leading-none text-foreground-300"
        title={
          loading ? "仕入照合の状態を確認中" : "仕入照合の状態を判定できません"
        }
      >
        {loading ? (
          <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center text-xs"></i>
        ) : (
          "—"
        )}
      </span>
    );
  }

  const tone =
    status === "matched"
      ? "st-ledger"
      : status === "needs_check"
        ? "st-ledger-strong"
        : "st-ledger-soft";

  return (
    <span className={`st-badge ${tone}`}>
      <i
        className={`${ICONS[status]} w-3 h-3 flex items-center justify-center text-xs`}
      ></i>
      {LABELS[status]}
    </span>
  );
}