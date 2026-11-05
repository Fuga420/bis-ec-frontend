import { Link } from "react-router-dom";

interface ProductDetailHeaderProps {
  // 商品一覧に戻るリンク先（一覧の表示タブを保つ）
  listPath: string;
}

/**
 * 商品詳細の上部ヘッダー。
 * 商品一覧画面と同じ設計（白背景＋下罫線・左に戻り導線、右にBISロゴ）に揃える。
 * 表示専用で、データの取得・保存には関与しない。
 */
export default function ProductDetailHeader({
  listPath,
}: ProductDetailHeaderProps) {
  return (
    <header className="border-b border-background-200 bg-white">
      <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5 md:px-6 lg:px-8">
        <div className="min-w-0">
          <Link
            to={listPath}
            className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-foreground-500 transition-colors hover:text-foreground-900"
          >
            <i className="ri-arrow-left-line w-3.5 h-3.5 flex items-center justify-center"></i>
            商品一覧に戻る
          </Link>
          <h1 className="admin-display mt-1 text-[22px] font-semibold leading-none text-foreground-950 md:text-[24px]">
            商品詳細
          </h1>
        </div>

        <Link
          to="/products"
          aria-label="BIS 商品一覧の先頭へ"
          className="inline-flex items-baseline gap-1.5 whitespace-nowrap"
        >
          <span className="admin-display block text-[12px] font-semibold leading-none tracking-[0.3em] text-foreground-950">
            BIS
          </span>
          <span className="admin-eyebrow block text-[9px] font-semibold leading-none tracking-[0.16em] text-foreground-400">
            Collectibles Catalogue
          </span>
        </Link>
      </div>
    </header>
  );
}