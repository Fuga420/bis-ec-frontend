import type { ReactNode } from "react";

interface CataloguePanelHeadingProps {
  // 「01」「02」などの章番号（任意）。付けると管理セクションの番号付き見出しになる
  number?: string;
  // 和文の見出し（例: 販売管理 / 翻訳・外部連携）
  title: string;
  // 英字の小見出し（例: Sales Control）
  eyebrow?: string;
  // 右側の小さな操作・件数表示
  right?: ReactNode;
}

/**
 * 下段（管理セクション）の図録体裁の見出し。
 * 細い罫線の上に、等幅の章番号＋明朝の和文見出し＋英字小見出しを並べるだけ。
 * 白カードの見出し帯やアイコン丸は使わない（表示専用）。
 */
export default function CataloguePanelHeading({
  number,
  title,
  eyebrow,
  right,
}: CataloguePanelHeadingProps) {
  return (
    <div className="border-t border-[var(--cat-rule)] pt-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          {number && (
            <span className="cat-mono text-[13px] leading-none tracking-[0.16em] text-[var(--cat-green)]">
              {number}
            </span>
          )}
          <h2 className="cat-serif text-[17px] leading-tight tracking-[0.1em] text-[var(--cat-ink)]">
            {title}
          </h2>
          {eyebrow && (
            <p className="cat-mono text-[9px] uppercase leading-none tracking-[0.28em] text-[var(--cat-ink-soft)]">
              {eyebrow}
            </p>
          )}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    </div>
  );
}