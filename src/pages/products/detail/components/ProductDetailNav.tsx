import { Link } from "react-router-dom";
import { useCatalogNeighbors } from "../hooks/useCatalogNeighbors";

interface ProductDetailNavProps {
  productId: string;
  // 「一覧へ戻る」の遷移先（既存の戻り先と同じ）
  listPath: string;
  isTest?: boolean;
}

const LINK_BASE =
  "group flex min-w-0 flex-col gap-0.5 transition-colors focus:outline-none";

const TITLE_BASE =
  "line-clamp-1 min-w-0 max-w-full text-[13px] leading-snug font-medium";

const TITLE_IDLE =
  "text-foreground-900 transition-colors group-hover:text-primary-700";

const TITLE_DISABLED = "text-foreground-400";

/**
 * 商品詳細の最下部。前後の商品への移動を、商品一覧と同じトーンで表示する。
 * 装飾的な英字ラベル（PREVIOUS / NEXT）は使わず、日本語のラベルにする。
 * 前後が取得できない場合はリンクを出さず、案内文だけを残す（読み取り専用）。
 */
export default function ProductDetailNav({
  productId,
  listPath,
  isTest = false,
}: ProductDetailNavProps) {
  const { prev, next } = useCatalogNeighbors(productId, isTest);

  return (
    <footer className="mt-5 rounded-lg border border-background-200 bg-white p-4 md:px-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-6">
        {/* 前の商品 */}
        <div className="min-w-0">
          {prev ? (
            <Link
              to={`/products/${prev.id}`}
              className={`${LINK_BASE} items-start text-left`}
              rel="prev"
            >
              <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-foreground-500 transition-colors group-hover:text-primary-700">
                <i className="ri-arrow-left-line w-3.5 h-3.5 flex items-center justify-center"></i>
                前の商品
              </span>
              <span className={`${TITLE_BASE} ${TITLE_IDLE}`}>
                {prev.name || prev.id}
              </span>
              <span className="admin-numeric text-[11px] text-foreground-400">
                {prev.id}
              </span>
            </Link>
          ) : (
            <div className={`${LINK_BASE} items-start text-left`}>
              <span className="text-[11px] text-foreground-400">前の商品</span>
              <span className={`${TITLE_BASE} ${TITLE_DISABLED}`}>
                前の商品はありません
              </span>
            </div>
          )}
        </div>

        {/* 一覧へ戻る */}
        <div className="flex min-w-0 items-center justify-center md:px-2">
          <Link
            to={listPath}
            className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-white px-3 py-1.5 text-[12px] font-medium text-foreground-700 transition-colors hover:bg-background-100"
          >
            <i className="ri-list-check w-3.5 h-3.5 flex items-center justify-center"></i>
            商品一覧へ
          </Link>
        </div>

        {/* 次の商品 */}
        <div className="min-w-0">
          {next ? (
            <Link
              to={`/products/${next.id}`}
              className={`${LINK_BASE} items-end text-right`}
              rel="next"
            >
              <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-foreground-500 transition-colors group-hover:text-primary-700">
                次の商品
                <i className="ri-arrow-right-line w-3.5 h-3.5 flex items-center justify-center"></i>
              </span>
              <span className={`${TITLE_BASE} ${TITLE_IDLE}`}>
                {next.name || next.id}
              </span>
              <span className="admin-numeric text-[11px] text-foreground-400">
                {next.id}
              </span>
            </Link>
          ) : (
            <div className={`${LINK_BASE} items-end text-right`}>
              <span className="text-[11px] text-foreground-400">次の商品</span>
              <span className={`${TITLE_BASE} ${TITLE_DISABLED}`}>
                次の商品はありません
              </span>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}