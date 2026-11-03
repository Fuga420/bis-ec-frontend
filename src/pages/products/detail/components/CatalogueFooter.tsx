import { Link } from "react-router-dom";
import { useCatalogNeighbors } from "../hooks/useCatalogNeighbors";

interface CatalogueFooterProps {
  productId: string;
  // 「一覧へ戻る」の遷移先（既存の戻り先と同じ）
  listPath: string;
}

const LINK_BASE =
  "group flex min-w-0 flex-col gap-1 transition-colors focus:outline-none";

const TITLE_BASE =
  "cat-serif min-w-0 truncate text-[12.5px] leading-snug tracking-[0.06em]";

const EYEBROW =
  "cat-mono text-[9px] uppercase leading-none tracking-[0.28em] text-[var(--cat-ink-soft)] transition-colors group-hover:text-[var(--cat-green)]";

const TITLE_IDLE =
  "text-[var(--cat-ink)] transition-colors group-hover:text-[var(--cat-green)]";

const TITLE_DISABLED = "text-[var(--cat-ink-soft)]/40";

/**
 * 商品詳細の最下部（図録のページ送り）。
 * 前後の商品への参照と、一覧上の位置をページ番号風（例: 012 — 214）に表示する。
 * 前後が取得できない場合はリンクを出さず、位置の表示だけを残す（読み取り専用）。
 */
export default function CatalogueFooter({
  productId,
  listPath,
}: CatalogueFooterProps) {
  const { loading, prev, next, position, total } = useCatalogNeighbors(
    productId
  );

  const pad = (value: number) => String(value).padStart(3, "0");
  const pageLabel =
    position !== null && total > 0 ? `${pad(position)} — ${pad(total)}` : "—";

  return (
    <footer className="mt-16 border-t border-[var(--cat-rule)] pt-5">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        {/* 前の商品 */}
        <div className="min-w-0 sm:w-[34%]">
          {prev ? (
            <Link
              to={`/products/${prev.id}`}
              className={`${LINK_BASE} items-start text-left`}
              rel="prev"
            >
              <span className={EYEBROW}>← Previous</span>
              <span className={`${TITLE_BASE} ${TITLE_IDLE}`}>
                {prev.name || prev.id}
              </span>
              <span className="cat-mono truncate text-[9px] tracking-[0.14em] text-[var(--cat-ink-soft)]">
                {prev.id}
              </span>
            </Link>
          ) : (
            <div className={`${LINK_BASE} items-start text-left`}>
              <span className={EYEBROW}>← Previous</span>
              <span className={`${TITLE_BASE} ${TITLE_DISABLED}`}>
                前の商品はありません
              </span>
            </div>
          )}
        </div>

        {/* ページ番号風の表示 */}
        <div className="flex shrink-0 flex-col items-center gap-2 sm:mx-4">
          <p className="cat-mono text-[11px] tracking-[0.24em] text-[var(--cat-ink)]">
            {loading ? "— — —" : pageLabel}
          </p>
          <p className="cat-mono text-[8.5px] uppercase tracking-[0.26em] text-[var(--cat-ink-soft)]">
            Bis Collectibles Catalogue
          </p>
          <Link
            to={listPath}
            className="cat-mono mt-1 border-b border-[var(--cat-rule)] pb-0.5 text-[9.5px] tracking-[0.18em] text-[var(--cat-ink-soft)] transition-colors hover:border-[var(--cat-green)] hover:text-[var(--cat-green)]"
          >
            商品一覧へ
          </Link>
        </div>

        {/* 次の商品 */}
        <div className="min-w-0 sm:w-[34%]">
          {next ? (
            <Link
              to={`/products/${next.id}`}
              className={`${LINK_BASE} items-end text-right`}
              rel="next"
            >
              <span className={EYEBROW}>Next →</span>
              <span className={`${TITLE_BASE} w-full text-right ${TITLE_IDLE}`}>
                {next.name || next.id}
              </span>
              <span className="cat-mono w-full truncate text-right text-[9px] tracking-[0.14em] text-[var(--cat-ink-soft)]">
                {next.id}
              </span>
            </Link>
          ) : (
            <div className={`${LINK_BASE} items-end text-right`}>
              <span className={EYEBROW}>Next →</span>
              <span
                className={`${TITLE_BASE} w-full text-right ${TITLE_DISABLED}`}
              >
                次の商品はありません
              </span>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}