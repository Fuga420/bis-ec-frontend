import { Link } from "react-router-dom";

interface ProductEmptyStateProps {
  isArchived: boolean;
}

// 商品が1件も登録されていない場合の空状態。
// 検索・フィルター結果が0件のケースとは区別する（こちらは本当にデータが無い状態）。
export default function ProductEmptyState({
  isArchived,
}: ProductEmptyStateProps) {
  if (isArchived) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <i className="ri-archive-line text-3xl text-foreground-300 w-8 h-8 flex items-center justify-center"></i>
        <p className="text-sm font-medium text-foreground-800">
          アーカイブ済みの商品はありません
        </p>
        <p className="text-sm text-foreground-500">
          アーカイブした商品はここに表示されます
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
      <i className="ri-inbox-line text-3xl text-foreground-300 w-8 h-8 flex items-center justify-center"></i>
      <p className="text-sm font-medium text-foreground-800">
        商品がまだ登録されていません
      </p>
      <p className="text-sm text-foreground-500">
        商品を登録すると、ここに一覧が表示されます
      </p>
      {/* 既存の商品登録画面への遷移を再利用する */}
      <Link
        to="/register"
        className="mt-2 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600"
      >
        <i className="ri-add-line w-4 h-4 flex items-center justify-center"></i>
        商品を登録
      </Link>
    </div>
  );
}