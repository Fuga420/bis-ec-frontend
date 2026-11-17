interface ProductPaginationProps {
  page: number;
  totalPages: number;
  count: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  // 一覧上部に件数を出している画面では false にして、同じ件数を繰り返さない。
  showSummary?: boolean;
}

// 表示するページ番号の並びを組み立てる。
// 総ページが多いときは現在ページの前後だけ残し、離れた部分は省略記号にする。
function buildPageItems(
  page: number,
  totalPages: number
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const items: Array<number | "ellipsis"> = [];
  const push = (value: number | "ellipsis") => {
    if (items[items.length - 1] !== value) items.push(value);
  };
  push(1);
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) push("ellipsis");
  for (let i = start; i <= end; i += 1) push(i);
  if (end < totalPages - 1) push("ellipsis");
  push(totalPages);
  return items;
}

// 商品一覧のページ送り。1ページのみのときは何も表示しない。
export default function ProductPagination({
  page,
  totalPages,
  count,
  disabled = false,
  onPageChange,
  showSummary = true,
}: ProductPaginationProps) {
  if (totalPages <= 1) return null;

  const items = buildPageItems(page, totalPages);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  // ページ送りは一覧の補助操作なので、共通の小サイズボタンに揃える。
  const navButtonClass = "bis-btn bis-btn-sm bis-btn-secondary";

  return (
    <nav
      className={`mt-6 flex flex-col items-center gap-3 sm:flex-row ${
        showSummary ? "justify-between" : "sm:justify-end"
      }`}
      aria-label="商品一覧のページ送り"
    >
      {showSummary && (
        <p className="bis-meta">
          全 <span className="admin-numeric font-semibold text-foreground-950">{count}</span> 件 /{" "}
          <span className="admin-numeric font-semibold text-foreground-950">{page}</span> /{" "}
          {totalPages} ページ
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || !canPrev}
          aria-label="前のページ"
          className={navButtonClass}
        >
          <i className="ri-arrow-left-s-line w-4 h-4 flex items-center justify-center text-base"></i>
          前へ
        </button>

        {items.map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              aria-hidden="true"
              className="flex h-[34px] w-7 items-center justify-center text-[13px] text-foreground-400"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              disabled={disabled}
              aria-label={`${item}ページ目`}
              aria-current={item === page ? "page" : undefined}
              className={`inline-flex h-[34px] min-w-[34px] cursor-pointer items-center justify-center rounded-[7px] border px-2 text-[13px] font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                item === page
                  ? "border-foreground-950 bg-foreground-950 text-background-50"
                  : "border-background-300 bg-white text-foreground-700 hover:bg-background-100"
              }`}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || !canNext}
          aria-label="次のページ"
          className={navButtonClass}
        >
          次へ
          <i className="ri-arrow-right-s-line w-4 h-4 flex items-center justify-center text-base"></i>
        </button>
      </div>
    </nav>
  );
}