import type { ReactNode } from "react";

interface ProductSelectionBarProps {
  // 選択中の総件数（ページを跨いだ合計）
  selectedCount: number;
  // 一括処理中などで選択操作を止める
  disabled: boolean;
  // 選択中のみ表示の切り替え状態
  isSelectionView: boolean;
  onToggleSelectionView: () => void;
  onClearSelection: () => void;
  // 一括公開・AI生成・アーカイブなどの操作ボタン
  children?: ReactNode;
}

/**
 * 商品一覧の一括操作バー。
 * 商品が1件も選択されていないときは何も描画しない（通常時の画面を簡素に保つ）。
 * 選択があるときだけ、選択件数・一括操作・選択解除を1行のコンパクトな帯にまとめる。
 * ページ全選択はテーブルヘッダーのチェックボックス、条件一致の全件選択は
 * 件数・並び替えの行に置くため、この帯には選択に依存する操作だけを並べる。
 */
export default function ProductSelectionBar({
  selectedCount,
  disabled,
  isSelectionView,
  onToggleSelectionView,
  onClearSelection,
  children,
}: ProductSelectionBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-background-200 bg-white px-3 py-2 md:px-4"
      role="group"
      aria-label="選択中の商品の一括操作"
    >
      <p
        className="flex items-baseline gap-1 whitespace-nowrap text-[13px] text-foreground-600"
        aria-live="polite"
      >
        選択中
        <span className="admin-numeric text-[15px] font-semibold text-foreground-950">
          {selectedCount}
        </span>
        件
      </p>

      <span
        className="hidden h-5 w-px bg-background-200 sm:block"
        aria-hidden="true"
      ></span>

      {children && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleSelectionView}
          disabled={disabled}
          aria-pressed={isSelectionView}
          className={`bis-btn bis-btn-sm bis-btn-secondary ${
            isSelectionView ? "is-on" : ""
          }`}
        >
          選択中のみ表示
        </button>
        <button
          type="button"
          onClick={onClearSelection}
          disabled={disabled}
          className="bis-btn bis-btn-sm bis-btn-ghost"
        >
          選択解除
        </button>
      </div>
    </div>
  );
}