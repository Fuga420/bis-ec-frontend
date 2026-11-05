import type { ReactNode } from "react";

interface CatalogueSubHeadingProps {
  // 和文の小見出し（例: 英語翻訳 / Square連携）
  title: string;
  // 英字の小見出し（例: Localization / Integration）
  eyebrow?: string;
  // 右側に置く小さな状態表示（任意）
  right?: ReactNode;
}

/**
 * 図録体裁の「小見出し」。セクション内を罫線で分けるための見出し行。
 * 白カードや帯は使わず、細い罫線と余白だけで区切る（表示専用）。
 */
export default function CatalogueSubHeading({
  title,
  eyebrow,
  right,
}: CatalogueSubHeadingProps) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className="cat-serif text-[13.5px] leading-tight tracking-[0.1em] text-[var(--cat-ink)]">
          {title}
        </h3>
        {eyebrow && (
          <p className="cat-mono text-[8.5px] uppercase leading-none tracking-[0.26em] text-[var(--cat-ink-soft)]">
            {eyebrow}
          </p>
        )}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}