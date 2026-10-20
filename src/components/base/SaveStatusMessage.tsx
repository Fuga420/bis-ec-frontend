// 保存・登録・外部連携の結果通知を、全画面で同じ見た目に揃えるための共通部品。
// 過度に大きくせず、控えめな帯として表示する（影・大きなアイコンは使わない）。
export type SaveStatusTone = "success" | "error" | "warning";

const TONE_STYLES: Record<SaveStatusTone, string> = {
  success: "border-primary-200 bg-primary-50/70 text-primary-700",
  error: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
};

const TONE_ICONS: Record<SaveStatusTone, string> = {
  success: "ri-checkbox-circle-line",
  error: "ri-error-warning-line",
  warning: "ri-alert-line",
};

interface SaveStatusMessageProps {
  tone: SaveStatusTone;
  text: string;
  className?: string;
}

export default function SaveStatusMessage({
  tone,
  text,
  className = "",
}: SaveStatusMessageProps) {
  if (!text) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium leading-relaxed ${
        TONE_STYLES[tone]
      } ${className}`}
    >
      <i
        className={`${TONE_ICONS[tone]} mt-0.5 h-4 w-4 shrink-0 flex items-center justify-center`}
      ></i>
      <span className="min-w-0 flex-1 break-words">{text}</span>
    </p>
  );
}