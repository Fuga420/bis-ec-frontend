import { Link } from "react-router-dom";
import DocumentStatusBadge from "./DocumentStatusBadge";
import {
  documentLineCount,
  documentLineTotal,
  getDocumentMatchStatus,
} from "@/pages/documents/lib/derive";
import {
  DOCUMENT_FILE_KIND_LABELS,
  type DocumentLedgerDocument,
} from "@/pages/documents/types";

interface DocumentListRowProps {
  doc: DocumentLedgerDocument;
}

function formatDateTime(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatYen(value: number): string {
  return `¥${(Number(value) || 0).toLocaleString("ja-JP")}`;
}

// ファイル種別ごとのアイコン（PDF / JPG / PNG）
const KIND_ICONS: Record<string, string> = {
  pdf: "ri-file-pdf-2-line",
  jpg: "ri-image-line",
  png: "ri-image-line",
};

// 書類一覧の1行。クリックで書類詳細へ遷移する。
export default function DocumentListRow({ doc }: DocumentListRowProps) {
  const status = getDocumentMatchStatus(doc);
  const lineSum = documentLineTotal(doc);
  const lineCount = documentLineCount(doc);

  return (
    <Link
      to={`/documents/${doc.document_id}`}
      className="group/row block cursor-pointer border-b border-background-200 transition-colors last:border-b-0 hover:bg-background-100"
    >
      {/* デスクトップ */}
      <div className="hidden items-center gap-4 px-4 py-3 lg:flex">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background-100 text-foreground-600">
          <i
            className={`${KIND_ICONS[doc.file_kind] ?? "ri-file-line"} text-lg w-5 h-5 flex items-center justify-center`}
          ></i>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground-950 group-hover/row:text-primary-600">
            {doc.file_name || "（ファイル名なし）"}
          </p>
          <p className="mt-0.5 truncate font-mono text-xs text-foreground-500">
            {doc.document_id}
          </p>
        </div>
        <span className="w-[64px] shrink-0 text-xs text-foreground-500">
          {DOCUMENT_FILE_KIND_LABELS[doc.file_kind] ?? "—"}
        </span>
        <span className="w-[110px] shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-foreground-950">
          {formatYen(doc.original_total)}
        </span>
        <span className="w-[110px] shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-foreground-500">
          {formatYen(lineSum)}
        </span>
        <span className="w-[120px] shrink-0 text-xs text-foreground-500">
          {lineCount} 行
        </span>
        <span className="w-[100px] shrink-0">
          <DocumentStatusBadge status={status} />
        </span>
        <span className="w-[130px] shrink-0 whitespace-nowrap text-xs text-foreground-500">
          {formatDateTime(doc.uploaded_at)}
        </span>
        <i className="ri-arrow-right-s-line w-5 h-5 shrink-0 flex items-center justify-center text-lg text-foreground-300 transition-colors group-hover/row:text-foreground-600"></i>
      </div>

      {/* モバイル */}
      <div className="flex items-center gap-3 px-4 py-3 lg:hidden">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background-100 text-foreground-600">
          <i
            className={`${KIND_ICONS[doc.file_kind] ?? "ri-file-line"} text-lg w-5 h-5 flex items-center justify-center`}
          ></i>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground-950">
            {doc.file_name || "（ファイル名なし）"}
          </p>
          <p className="mt-0.5 truncate font-mono text-xs text-foreground-500">
            {doc.document_id}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <DocumentStatusBadge status={status} />
            <span className="text-xs text-foreground-500">
              {formatYen(doc.original_total)} / {lineCount} 行
            </span>
          </div>
        </div>
        <i className="ri-arrow-right-s-line w-5 h-5 shrink-0 flex items-center justify-center text-lg text-foreground-300"></i>
      </div>
    </Link>
  );
}