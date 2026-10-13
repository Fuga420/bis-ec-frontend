interface ProductFilterEmptyStateProps {
  onClear: () => void;
}

// 検索・フィルターの結果が0件の場合の空状態。
// 「データが本当に0件」の空状態とは文言・操作を分ける（こちらは条件を変えれば復帰できる）。
export default function ProductFilterEmptyState({
  onClear,
}: ProductFilterEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
      <i className="ri-search-line text-3xl text-foreground-300 w-8 h-8 flex items-center justify-center"></i>
      <p className="text-sm font-medium text-foreground-800">
        条件に一致する商品がありません
      </p>
      <p className="text-sm text-foreground-500">
        検索条件やフィルターを変更してください
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-2 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
      >
        <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
        条件をクリア
      </button>
    </div>
  );
}