import { hasText } from "../lib/format";

interface InfoRowProps {
  label: string;
  value: string;
  emphasize?: boolean;
}

/** ラベルと値を1行で表示する基本行（未入力は「—」） */
export function InfoRow({ label, value, emphasize = false }: InfoRowProps) {
  const filled = hasText(value);
  return (
    <div className="flex items-start gap-3 border-b border-background-100 py-2">
      <span className="w-24 shrink-0 whitespace-nowrap pt-0.5 text-xs text-foreground-500">
        {label}
      </span>
      <span
        className={`min-w-0 flex-1 break-words text-[13px] ${
          !filled
            ? "text-foreground-300"
            : emphasize
              ? "font-semibold text-foreground-950"
              : "font-medium text-foreground-900"
        }`}
      >
        {filled ? value : "—"}
      </span>
    </div>
  );
}

/** 商品説明・備考などの長文ブロック（改行を保持して表示） */
export function DescriptionBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const filled = hasText(value);
  return (
    <div className="mt-3 first:mt-0">
      <p className="text-xs text-foreground-500">{label}</p>
      <p
        className={`mt-1 max-w-full whitespace-pre-wrap break-words text-[13px] leading-relaxed ${
          filled ? "text-foreground-800" : "text-foreground-300"
        }`}
      >
        {filled ? value : "—"}
      </p>
    </div>
  );
}

export default InfoRow;