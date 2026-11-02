import type { DocumentMatchStatus } from "@/pages/documents/types";
import { DOCUMENT_MATCH_STATUS_LABELS } from "@/pages/documents/types";

interface DocumentStatusBadgeProps {
  status: DocumentMatchStatus;
}

// 書類の照合状態は「照合ドメイン」なので、商品一覧の仕入照合セルと同じ黄色系に固定する。
// 状態の差は色相ではなく「塗りの濃さ・枠線・アイコン」で表す。
//  - 未照合  : 黄色の枠線のみ
//  - 一部照合: 濃い黄色 + リンクアイコン
//  - 照合済み: 黄色の塗り + チェック
// 寸法（高さ22px・11px/500）は他のステータスバッジと共通（.st-badge）。
const STATUS_STYLES: Record<DocumentMatchStatus, string> = {
  unmatched: "st-ledger-soft",
  partial: "st-ledger-strong",
  matched: "st-ledger",
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
    <span className={`st-badge ${STATUS_STYLES[status]}`}>
      <i
        className={`${STATUS_ICONS[status]} w-3 h-3 flex items-center justify-center text-xs`}
      ></i>
      {DOCUMENT_MATCH_STATUS_LABELS[status]}
    </span>
  );
}