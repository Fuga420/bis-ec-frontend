import { Link } from "react-router-dom";

interface CatalogueMastheadProps {
  // 商品一覧に戻るリンク先（一覧の表示タブを保つ）
  listPath: string;
}

/**
 * 商品詳細の最上部。
 * 図録（オークションカタログ）の表紙まわりの体裁で、
 * ロゴ・セール情報・二重罫だけを置く（この行より下が本票の見出し）。
 * 表示専用で、データの取得・保存には関与しない。
 */
export default function CatalogueMasthead({ listPath }: CatalogueMastheadProps) {
  return (
    <header className="w-full">
      <div className="mx-auto w-full max-w-5xl px-4 pt-5 md:px-6 md:pt-6">
        <Link
          to={listPath}
          className="cat-mono inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[10px] tracking-[0.18em] text-[var(--cat-ink-soft)] transition-colors hover:text-[var(--cat-green)]"
        >
          <i className="ri-arrow-left-line w-3 h-3 flex items-center justify-center"></i>
          商品一覧に戻る
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-x-8 gap-y-3 md:mt-5">
          {/* ロゴ（押すと一覧に戻る） */}
          <Link to={listPath} className="block cursor-pointer">
            <span className="cat-display block text-[30px] leading-none tracking-[0.34em] text-[var(--cat-ink)] md:text-[34px]">
              BIS
            </span>
            <span className="cat-mono mt-2 block text-[9px] uppercase leading-none tracking-[0.26em] text-[var(--cat-ink-soft)]">
              Collectibles Catalogue
            </span>
          </Link>

          {/* セール情報（等幅） */}
          <div className="cat-mono text-right text-[10px] leading-[1.9] tracking-[0.12em] text-[var(--cat-ink-soft)]">
            <p className="text-[var(--cat-ink)]">SALE 2026.11</p>
            <p className="uppercase">Session: Sneakers &amp; Collectibles</p>
          </div>
        </div>

        {/* 二重罫 */}
        <div className="mt-4 border-t border-[var(--cat-ink)] md:mt-5"></div>
        <div className="mt-[3px] border-t border-[var(--cat-rule)]"></div>
      </div>
    </header>
  );
}