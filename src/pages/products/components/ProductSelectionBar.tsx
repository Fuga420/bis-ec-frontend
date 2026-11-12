import type { ReactNode } from "react";

interface ProductSelectionBarProps {
  // 選択中の総件数（ページを跨いだ合計）
  selectedCount: number;
  // 表示中のページ（または選択中のみ表示のページ）の商品数と、そのうち選択済みの件数
  viewCount: number;
  viewSelectedCount: number;
  // 現在の絞り込み結果の総件数（「条件に一致する全件を選択」の対象数）
  filteredCount: number;
  // 選択中のみ表示の切り替え状態
  isSelectionView: boolean;
  // 一括処理中などで選択操作を止める
  disabled: boolean;
  // 全件選択の取得中・失敗メッセージ
  isSelectingAll: boolean;
  selectAllError: string | null;
  onSelectPage: () => void;
  onClearPage: () => void;
  onSelectAllMatching: () => void;
  onToggleSelectionView: () => void;
  onClearSelection: () => void;
  // 一括公開・AI生成・アーカイブなどの操作ボタン
  children?: ReactNode;
}

const smallButtonClass =
  "inline-flex h-8 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 text-[12px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * 商品一覧の選択操作バー。
 * - 選択中の件数を常時表示する
 * - 「このページを全選択 / 選択解除」と「条件に一致する全件を選択」を別ボタンで併記する
 * - 「選択中のみ表示」で選択した商品だけを一覧に出す
 * - 選択があるときだけ一括操作（公開・AI生成・アーカイブ）を右側に出す
 */
export default function ProductSelectionBar({
  selectedCount,
  viewCount,
  viewSelectedCount,
  filteredCount,
  isSelectionView,
  disabled,
  isSelectingAll,
  selectAllError,
  onSelectPage,
  onClearPage,
  onSelectAllMatching,
  onToggleSelectionView,
  onClearSelection,
  children,
}: ProductSelectionBarProps) {
  const hasSelection = selectedCount > 0;
  const isAllViewSelected = viewCount > 0 && viewSelectedCount === viewCount;

  return (
    <div className="mb-3 flex flex-col gap-2 rounded-lg border border-background-200 bg-white px-3 py-2 md:px-4 xl:flex-row xl:items-center">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
        {/* 選択中の件数は常時表示（0 件でも隠さない） */}
        <span
          className={`inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[12px] font-semibold leading-none ${
            hasSelection
              ? "bg-primary-100 text-primary-800"
              : "bg-background-100 text-foreground-500"
          }`}
          aria-live="polite"
        >
          選択中
          <span className="admin-numeric text-[13px]">{selectedCount}</span>
          件
        </span>

        {/* 選択中のみ表示（選択が無いときは押せない） */}
        <button
          type="button"
          onClick={onToggleSelectionView}
          disabled={!hasSelection}
          aria-pressed={isSelectionView}
          title="選択した商品だけを一覧に表示します"
          className={`inline-flex h-8 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border px-2.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            isSelectionView
              ? "border-primary-300 bg-primary-50 text-primary-800"
              : "border-background-300 bg-white text-foreground-700 hover:bg-background-100"
          }`}
        >
          <i
            className={`${
              isSelectionView ? "ri-eye-line" : "ri-eye-off-line"
            } w-3.5 h-3.5 flex items-center justify-center text-[13px]`}
            aria-hidden="true"
          ></i>
          選択中のみ表示
        </button>

        <span
          className="hidden h-5 w-px bg-background-200 sm:block"
          aria-hidden="true"
        ></span>

        {/* 表示中ページの全選択（既存操作） */}
        <button
          type="button"
          onClick={isAllViewSelected ? onClearPage : onSelectPage}
          disabled={disabled || viewCount === 0}
          className={smallButtonClass}
        >
          <i
            className={`${
              isAllViewSelected ? "ri-checkbox-multiple-line" : "ri-checkbox-multiple-blank-line"
            } w-3.5 h-3.5 flex items-center justify-center text-[13px]`}
            aria-hidden="true"
          ></i>
          {isAllViewSelected ? "このページの選択を解除" : "このページを全選択"}
        </button>

        {/* 絞り込み結果の全件選択（別ボタンとして併記） */}
        {!isSelectionView && (
          <button
            type="button"
            onClick={onSelectAllMatching}
            disabled={disabled || isSelectingAll || filteredCount === 0}
            title="現在の絞り込み条件に一致する商品を全ページ分まとめて選択します"
            className={smallButtonClass}
          >
            <i
              className={`${
                isSelectingAll
                  ? "ri-loader-4-line animate-spin"
                  : "ri-check-double-line"
              } w-3.5 h-3.5 flex items-center justify-center text-[13px]`}
              aria-hidden="true"
            ></i>
            条件に一致する全件を選択
            {filteredCount > 0 && (
              <span className="admin-numeric text-foreground-400">
                （{filteredCount}件）
              </span>
            )}
          </button>
        )}

        {hasSelection && (
          <button
            type="button"
            onClick={onClearSelection}
            disabled={disabled}
            className="inline-flex h-8 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-2 text-[12px] font-medium text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i
              className="ri-close-line w-3.5 h-3.5 flex items-center justify-center text-[13px]"
              aria-hidden="true"
            ></i>
            選択解除
          </button>
        )}
      </div>

      {/* 一括操作は選択があるときだけ右側に出す */}
      {hasSelection && children && (
        <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
          {children}
        </div>
      )}

      {selectAllError && (
        <p className="flex w-full items-start gap-1 text-[12px] leading-relaxed text-red-700 xl:w-auto">
          <i
            className="ri-error-warning-line mt-0.5 w-3.5 h-3.5 flex items-center justify-center text-[13px]"
            aria-hidden="true"
          ></i>
          {selectAllError}
        </p>
      )}
    </div>
  );
}