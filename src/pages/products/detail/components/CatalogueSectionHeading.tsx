import type { ReactNode } from "react";

interface CatalogueSectionHeadingProps {
  // 英字の小見出し（例: SPECIFICATION / DESCRIPTION / CONDITION REPORT）
  eyebrow: string;
  // 和文の見出し（例: 商品情報 / 商品説明）
  title: string;
  // 右側に置く小さな補助情報（任意）
  right?: ReactNode;
}

/**
 * 図録体裁のセクション見出し。
 * 細い罫線の上に、等幅の英字小見出し＋明朝の和文見出しを置くだけ。
 * 白カードの見出し帯は使わない（表示専用）。
 */
export default function CatalogueSectionHeading({
  eyebrow,
  title,
  right,
}: CatalogueSectionHeadingProps) {
  return (
    <div className="border-t border-[var(--cat-rule)] pt-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="cat-mono text-[9px] uppercase leading-none tracking-[0.28em] text-[var(--cat-ink-soft)]">
            {eyebrow}
          </p>
          <h2 className="cat-serif text-[15px] leading-tight tracking-[0.08em] text-[var(--cat-ink)]">
            {title}
          </h2>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </div>
  );
}