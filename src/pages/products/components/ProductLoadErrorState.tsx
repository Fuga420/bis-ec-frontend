interface ProductLoadErrorStateProps {
  onRetry: () => void;
}

// 商品一覧の取得に失敗した場合のエラー状態。
// 既存の再取得処理（retry）をそのまま使う。
export default function ProductLoadErrorState({
  onRetry,
}: ProductLoadErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
      <i className="ri-error-warning-line text-3xl text-foreground-300 w-8 h-8 flex items-center justify-center"></i>
      <p className="text-sm font-medium text-foreground-800">
        商品を読み込めませんでした
      </p>
      <p className="text-sm text-foreground-500">
        時間をおいて再度お試しください
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
      >
        <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
        再読み込み
      </button>
    </div>
  );
}