import { useState, type FocusEvent, type ReactNode } from "react";

interface FormSectionProps {
  title?: string;
  /**
   * そのセクション内で発生しているバリデーションエラーの件数。
   * 既存の検証結果を数えて渡すだけで、検証条件そのものは変更しない。
   */
  errorCount?: number;
  /** 見出しのタグ。カード内の小見出しでは h3 を指定する。 */
  headingLevel?: "h2" | "h3";
  className?: string;
  children: ReactNode;
}

/**
 * 商品登録・商品編集フォームのセクション。
 * - 既存の見出しはそのまま表示する
 * - セクション内の入力欄にフォーカスがある間だけ、薄い左罫線と見出し色で現在位置を示す
 * - エラーがある場合は見出し横に控えめな件数表示を出す
 */
export default function FormSection({
  title,
  errorCount = 0,
  headingLevel = "h2",
  className = "",
  children,
}: FormSectionProps) {
  const [isActive, setIsActive] = useState(false);
  const hasError = errorCount > 0;

  const handleFocus = () => setIsActive(true);

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setIsActive(false);
  };

  const accentClass = isActive
    ? "border-primary-400"
    : hasError
      ? "border-red-200"
      : "border-transparent";

  const headingClass = `text-[15px] font-semibold transition-colors ${
    isActive ? "text-primary-700" : "text-foreground-950"
  }`;

  return (
    <section className={className}>
      <div
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={`border-l-2 pl-3 transition-colors md:pl-4 ${accentClass}`}
      >
        {(title || hasError) && (
          <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1">
            {title &&
              (headingLevel === "h3" ? (
                <h3 className={headingClass}>{title}</h3>
              ) : (
                <h2 className={headingClass}>{title}</h2>
              ))}
            {hasError && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                <i className="ri-error-warning-line flex h-3.5 w-3.5 items-center justify-center"></i>
                要確認 {errorCount}件
              </span>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}