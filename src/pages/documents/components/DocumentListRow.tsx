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

// 金額は「未取得（null / 不正値）」と「実額0円」を区別して表示する。
function formatYen(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `¥${num.toLocaleString("ja-JP")}`;
}

// ファイル種別ごとのアイコン（PDF / JPG / PNG）
const KIND_ICONS: Record<string, string> = {
  pdf: "ri-file-pdf-2-line",
  jpg: "ri-image-line",
  png: "ri-image-line",
};

/**
 * 書類一覧の1行。クリックで書類詳細へ遷移する。
 *
 * ファイル名を主情報にし、長い書類IDは常時表示しない（title とスクリーンリーダー用の
 * テキストで参照できるようにしておき、データ自体は保持する）。
 */
export default function DocumentListRow({ doc }: DocumentListRowProps) {
  const status = getDocumentMatchStatus(doc);
  const lineSum = documentLineTotal(doc);
  const lineCount = documentLineCount(doc);
  const fileName = doc.file_name || "（ファイル名なし）";
  const fileTitle = `${fileName}（書類ID: ${doc.document_id}）`;

  return (
    <Link
      to={`/documents/${doc.document_id}`}
      title={fileTitle}
      className="group/row block cursor-pointer border-b border-background-100 transition-colors last:border-b-0 hover:bg-background-100"
    >
      {/* デスクトップ */}
      <div className="hidden items-center gap-4 px-4 py-2.5 lg:flex lg:min-h-[64px]">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background-100 text-foreground-500">
          <i
            className={`${KIND_ICONS[doc.file_kind] ?? "ri-file-line"} w-4 h-4 flex items-center justify-center text-base`}
          ></i>
        </span>
        <div className="min-w-0 flex-1">
          {/* ファイル名は最大2行まで表示し、超過分は省略する */}
          <p className="line-clamp-2 break-words text-sm font-semibold leading-snug text-foreground-950 group-hover/row:text-primary-600">
            {fileName}
          </p>
          {/* 書類IDは常時表示せず、スクリーンリーダーと行のツールチップからのみ参照する */}
          <span className="sr-only">書類ID {doc.document_id}</span>
        </div>
        <span className="w-[56px] shrink-0 truncate text-xs text-foreground-500">
          {DOCUMENT_FILE_KIND_LABELS[doc.file_kind] ?? "—"}
        </span>
        <span className="w-[104px] shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-foreground-950">
          {formatYen(doc.original_total)}
        </span>
        <span className="w-[104px] shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-foreground-500">
          {formatYen(lineSum)}
        </span>
        <span className="w-[60px] shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-foreground-500">
          {lineCount} 行
        </span>
        <span className="flex w-[104px] shrink-0 overflow-hidden">
          <DocumentStatusBadge status={status} />
        </span>
        <span className="w-[124px] shrink-0 whitespace-nowrap text-xs tabular-nums text-foreground-500">
          {formatDateTime(doc.uploaded_at)}
        </span>
        <i className="ri-arrow-right-s-line w-4 h-4 shrink-0 flex items-center justify-center text-base text-foreground-300 transition-colors group-hover/row:text-foreground-500"></i>
      </div>

      {/* モバイル */}
      <div className="flex items-center gap-3 px-4 py-2.5 lg:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background-100 text-foreground-500">
          <i
            className={`${KIND_ICONS[doc.file_kind] ?? "ri-file-line"} w-4 h-4 flex items-center justify-center text-base`}
          ></i>
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-sm font-semibold leading-snug text-foreground-950">
            {fileName}
          </p>
          <span className="sr-only">書類ID {doc.document_id}</span>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <DocumentStatusBadge status={status} />
            <span className="whitespace-nowrap text-xs tabular-nums text-foreground-500">
              {formatYen(doc.original_total)} / {lineCount} 行
            </span>
          </div>
        </div>
        <i className="ri-arrow-right-s-line w-4 h-4 shrink-0 flex items-center justify-center text-base text-foreground-300"></i>
      </div>
    </Link>
  );
}