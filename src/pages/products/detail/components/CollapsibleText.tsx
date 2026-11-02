import { useMemo, useState } from "react";

interface CollapsibleTextProps {
  text: string;
  // 折りたたみ時に見せる行数
  collapsedLines?: 3 | 4 | 5;
  // この文字数を超えたら折りたたむ
  threshold?: number;
  // 本文の文字色（備考など控えめにしたい場合に使う）
  tone?: "body" | "muted";
  className?: string;
}

/**
 * 長文を「読ませる形」で表示する本文ブロック。
 *
 * - 空行・改行で段落に分け、改行をそのまま詰め込まない
 * - 一定の長さを超える文章は最初の数行だけ見せ、「続きを読む」で全文を開く
 * - 短い文章は折りたたまず、そのまま表示する（無駄なトグルを出さない）
 */
export default function CollapsibleText({
  text,
  collapsedLines = 4,
  threshold = 160,
  tone = "body",
  className = "",
}: CollapsibleTextProps) {
  const [expanded, setExpanded] = useState(false);

  const paragraphs = useMemo(
    () =>
      text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean),
    [text]
  );

  if (paragraphs.length === 0) return null;

  const needsToggle = text.trim().length > threshold;

  const clampClass =
    collapsedLines === 3
      ? "line-clamp-3"
      : collapsedLines === 5
        ? "line-clamp-5"
        : "line-clamp-4";

  const textClass = tone === "muted" ? "text-foreground-600" : "text-foreground-800";
  const baseClass = `text-[13px] leading-relaxed ${textClass}`;

  if (needsToggle && !expanded) {
    return (
      <div className={className}>
        <p className={`${baseClass} ${clampClass} whitespace-pre-line break-words`}>
          {text.trim()}
        </p>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          className="mt-1.5 inline-flex cursor-pointer items-center gap-0.5 whitespace-nowrap rounded px-0.5 text-[11.5px] font-semibold text-primary-700 transition-colors hover:text-primary-800"
        >
          <i
            className="ri-arrow-down-s-line w-3.5 h-3.5 flex items-center justify-center"
            aria-hidden="true"
          ></i>
          続きを読む
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex flex-col gap-1.5">
        {paragraphs.map((paragraph, index) => (
          <p
            key={`${index}-${paragraph.slice(0, 12)}`}
            className={`${baseClass} break-words`}
          >
            {paragraph}
          </p>
        ))}
      </div>
      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-expanded
          className="mt-1.5 inline-flex cursor-pointer items-center gap-0.5 whitespace-nowrap rounded px-0.5 text-[11.5px] font-semibold text-foreground-500 transition-colors hover:text-foreground-800"
        >
          <i
            className="ri-arrow-up-s-line w-3.5 h-3.5 flex items-center justify-center"
            aria-hidden="true"
          ></i>
          閉じる
        </button>
      )}
    </div>
  );
}