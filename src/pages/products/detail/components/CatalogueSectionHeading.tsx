import type { ReactNode } from "react";

interface CatalogueSectionHeadingProps {
  // 旧・英字小見出し（装飾的な英字ラベルは表示しない）
  eyebrow?: string;
  // 和文の見出し（例: 商品情報 / 商品説明）
  title: string;
  // 右側に置く小さな補助情報（任意）
  right?: ReactNode;
}

/**
 * 商品詳細のセクション見出し（商品一覧と統一した業務管理UI）。
 * 装飾的な英字ラベル・字間の広い見出しは使わず、和文の見出しだけを置く。
 * 表示専用。
 */
export default function CatalogueSectionHeading(
  props: CatalogueSectionHeadingProps
) {
  const { title, right } = props;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h3 className="text-[14px] font-semibold leading-tight text-foreground-950">
        {title}
      </h3>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}