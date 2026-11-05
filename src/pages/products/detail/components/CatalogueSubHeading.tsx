import type { ReactNode } from "react";

interface CatalogueSubHeadingProps {
  // 和文の小見出し（例: 英語翻訳 / Square連携）
  title: string;
  // 旧・英字小見出し（装飾的な英字ラベルは表示しない）
  eyebrow?: string;
  // 右側に置く小さな状態表示（任意）
  right?: ReactNode;
}

/**
 * セクション内の小見出し（商品一覧と統一した業務管理UI）。
 * 和文の見出しだけを置き、英字の小見出しは表示しない。表示専用。
 */
export default function CatalogueSubHeading(props: CatalogueSubHeadingProps) {
  const { title, right } = props;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h4 className="text-[13px] font-semibold leading-tight text-foreground-950">
        {title}
      </h4>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}