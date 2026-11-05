import type { ReactNode } from "react";

interface CataloguePanelHeadingProps {
  // 旧・章番号（装飾的な番号表示は行わない）
  number?: string;
  // 和文の見出し（例: 販売管理 / 翻訳・外部連携）
  title: string;
  // 旧・英字小見出し（装飾的な英字ラベルは表示しない）
  eyebrow?: string;
  // 右側の小さな操作・状態表示
  right?: ReactNode;
}

/**
 * 管理セクションの見出し（商品一覧と統一した業務管理UI）。
 * 和文の見出しと、右側の操作・状態表示だけを置く。表示専用。
 */
export default function CataloguePanelHeading(
  props: CataloguePanelHeadingProps
) {
  const { title, right } = props;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h3 className="text-[15px] font-semibold leading-tight text-foreground-950">
        {title}
      </h3>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}