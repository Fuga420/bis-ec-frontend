import type { ReactNode } from "react";

interface SectionHeadingProps {
  // 英字の小見出し（例: SALES CONTROL / PURCHASE）
  eyebrow: string;
  title: string;
  // Remix Icon のクラス名（例: ri-store-3-line）
  icon: string;
  // タイトル下の一行説明（任意）
  description?: string;
  // 右側に置くバッジ・ボタンなど
  right?: ReactNode;
}

/**
 * 商品詳細の下部カードで共通利用する見出し。
 * 小さいアイコン + 英字の小見出し + 日本語タイトルで、
 * 同じ白カードでも「ここは販売」「ここは仕入」と一目で区別できるようにする。
 * 上部サマリーの "Product Detail" と同じトーンで揃える（表示専用）。
 */
export default function SectionHeading({
  eyebrow,
  title,
  icon,
  description,
  right,
}: SectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-start gap-2">
        {/* 小さいアイコンは深緑の淡い丸背景の中に置き、全カードで同じ型に揃える */}
        <span
          className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600"
          aria-hidden="true"
        >
          <i className={`${icon} text-[11px] leading-none`}></i>
        </span>
        <div className="min-w-0">
          <p className="admin-eyebrow text-[10px] font-semibold tracking-[0.14em] text-foreground-400">
            {eyebrow}
          </p>
          <h2 className="admin-title mt-0.5 text-[15px] font-bold leading-tight text-foreground-950">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-[11px] leading-relaxed text-foreground-500">
              {description}
            </p>
          )}
        </div>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}