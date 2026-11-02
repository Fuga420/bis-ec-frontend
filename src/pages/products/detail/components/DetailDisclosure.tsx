import { useId, type ReactNode } from "react";

interface DetailDisclosureProps {
  open: boolean;
  onToggle: () => void;
  // 折りたたみを開く行のラベル（例: 詳細を表示）
  label: string;
  // 中に入る件数（例: 5件）。0 のときは表示しない
  count?: number;
  // 右側に置く英字の小見出し（例: Breakdown）
  hint?: string;
  children: ReactNode;
  // 外枠の有無（カード内で使う場合は none）
  className?: string;
}

/**
 * 商品詳細の下部カードで共通利用する折りたたみ行。
 *
 * 「めったに見ない情報」を同じ部品で畳むための土台で、
 * 技術情報・税務の注記・書類の明細など、どのカードでも見た目と操作を揃える。
 * 見出し行は控えめ（グレー）にし、開いた中身だけを淡い面で表示する。
 */
export default function DetailDisclosure({
  open,
  onToggle,
  label,
  count,
  hint,
  children,
  className = "",
}: DetailDisclosureProps) {
  const contentId = useId();

  return (
    <div className={`border-t border-background-100 pt-1 ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md py-1.5 text-left text-[11px] font-medium text-foreground-400 transition-colors hover:text-foreground-700"
      >
        <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap">
          <i
            className={`${
              open ? "ri-subtract-line" : "ri-add-line"
            } w-3 h-3 flex items-center justify-center text-xs`}
            aria-hidden="true"
          ></i>
          <span className="truncate">
            {label}
            {typeof count === "number" && count > 0 && `（${count}件）`}
          </span>
        </span>
        {hint && (
          <span className="admin-eyebrow shrink-0 text-[9px] text-foreground-300">
            {hint}
          </span>
        )}
      </button>

      {open && (
        <div id={contentId} className="tab-fade pb-1">
          {children}
        </div>
      )}
    </div>
  );
}