import type { DocumentMatchStatus } from "@/pages/documents/types";
import { DOCUMENT_MATCH_STATUS_LABELS } from "@/pages/documents/types";

interface DocumentStatusBadgeProps {
  status: DocumentMatchStatus;
}

// 未照合・一部照合・照合済みの状態バッジ。
// 色は status ごとに一意（未照合=ニュートラル、一部照合=注意、照合済み=完了）。
const STATUS_STYLES: Record<DocumentMatchStatus, string> = {
  unmatched: "bg-background-100 text-foreground-600",
  partial: "bg-amber-100 text-amber-800",
  matched: "bg-primary-100 text-primary-700",
};

const STATUS_ICONS: Record<DocumentMatchStatus, string> = {
  unmatched: "ri-question-line",
  partial: "ri-links-line",
  matched: "ri-checkbox-circle-line",
};

export default function DocumentStatusBadge({
  status,
}: DocumentStatusBadgeProps) {
  return (
    <span
      className={`inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium leading-none ${STATUS_STYLES[status]}`}
    >
      <i
        className={`${STATUS_ICONS[status]} w-3 h-3 flex items-center justify-center text-xs`}
      ></i>
      {DOCUMENT_MATCH_STATUS_LABELS[status]}
    </span>
  );
}