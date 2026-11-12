import { Link } from "react-router-dom";
import { useOperatingMode } from "@/context/OperatingModeProvider";

interface ProductDetailHeaderProps {
  // 商品一覧に戻るリンク先（一覧の表示タブ・検索条件の復帰仕様を保つ）
  listPath: string;
}

/**
 * 商品詳細の上部ヘッダー。
 * 商品一覧画面と同じ設計（白背景＋下罫線・左端にBISブランド表記）に揃え、
 * ブランドロゴ → 区切り線 → パンくずの順で現在位置を示す。
 * 表示専用で、データの取得・保存には関与しない。
 */
export default function ProductDetailHeader({
  listPath,
}: ProductDetailHeaderProps) {
  const { isTestMode } = useOperatingMode();

  return (
    <header className="border-b border-background-200 bg-white">
      <div className="flex min-h-[56px] w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 md:min-h-[64px] md:px-6 lg:px-8">
        {/* BIS ブランドロゴ（一覧ヘッダーと同じ字体・サイズ・余白に統一） */}
        <Link
          to="/products"
          aria-label="BIS 商品一覧の先頭へ"
          className="inline-flex shrink-0 items-center whitespace-nowrap"
        >
          <span className="products-header-brand block text-foreground-950">
            BIS
          </span>
        </Link>

        {/* ブランドとページ名の区切り。一覧ヘッダーと同じ高さ・色にする */}
        <span
          aria-hidden="true"
          className="h-7 w-px shrink-0 bg-background-300"
        ></span>

        {/* パンくず（1行・控えめな12〜13px）。「商品管理」から一覧へ戻れる */}
        <nav
          aria-label="パンくずリスト"
          className="flex min-w-0 items-center gap-1 text-[12px] leading-none md:text-[13px]"
        >
          <Link
            to={listPath}
            className="cursor-pointer whitespace-nowrap text-foreground-500 transition-colors hover:text-foreground-900"
          >
            商品管理
          </Link>
          <i
            aria-hidden="true"
            className="ri-arrow-right-s-line w-3.5 h-3.5 flex items-center justify-center text-foreground-300"
          ></i>
          <span aria-current="page" className="truncate text-foreground-700">
            商品詳細
          </span>
        </nav>

        {/* テスト環境のときだけ、右端に控えめな識別ラベルを出す（操作不可） */}
        {isTestMode && (
          <span
            aria-label="テスト環境"
            className="ml-auto inline-flex h-[18px] shrink-0 select-none items-center rounded border border-amber-300/70 bg-amber-50 px-1.5 text-[10px] font-medium leading-none tracking-[0.08em] text-amber-800"
          >
            TEST
          </span>
        )}
      </div>
    </header>
  );
}