import type { ReactNode } from "react";

interface HomeSectionProps {
  title: string;
  /** セクション右上の補助操作（履歴を開く等） */
  action?: ReactNode;
  children: ReactNode;
}

/**
 * ホームの各区画を囲む最小限のカード。
 * 影・装飾背景・グラデーションは使わず、境界線と余白だけで区切る。
 * 見出しは 15px / 600 に統一し、英字ラベルや飾りは付けない。
 */
export default function HomeSection({
  title,
  action,
  children,
}: HomeSectionProps) {
  return (
    <section className="ui-card w-full rounded-lg px-4 py-4 md:px-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="bis-section-title">
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}