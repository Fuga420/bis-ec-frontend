import { Link } from "react-router-dom";
import {
  DRIVE_INBOX_STATUS_ICONS,
  DRIVE_INBOX_STATUS_LABELS,
  resolveDriveInboxFileStatus,
  type DriveInboxFileResult,
  type DriveInboxFileStatus,
  type DriveInboxLoadState,
} from "@/pages/documents/lib/driveInboxBatch";

interface DriveInboxFileResultsProps {
  state: DriveInboxLoadState;
  files: DriveInboxFileResult[];
  message: string;
  onRetry: () => void;
  // 処理済みファイルの表示ラベル（処理済み / 処理見込み / 処理結果）。
  processedLabel: string;
}

const STATUS_STYLES: Record<DriveInboxFileStatus, string> = {
  pending: "bg-background-100 text-foreground-600",
  processing: "bg-secondary-100 text-secondary-900 ring-1 ring-secondary-300",
  processed: "bg-primary-100 text-primary-700",
  needs_review: "bg-amber-100 text-amber-800",
  failed: "bg-red-50 text-red-700",
  skipped: "bg-background-100 text-foreground-500",
};

function formatDateTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function StatusChip({
  status,
  label,
}: {
  status: DriveInboxFileStatus;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium leading-none ${STATUS_STYLES[status]}`}
    >
      <i
        className={`${DRIVE_INBOX_STATUS_ICONS[status]} w-3 h-3 flex items-center justify-center text-xs ${
          status === "processing" ? "animate-spin" : ""
        }`}
      ></i>
      {label ?? DRIVE_INBOX_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * ファイル別の取込結果。
 * 失敗理由は画面用APIが返した error_reason をそのまま表示する（推測で補完しない）。
 */
export default function DriveInboxFileResults({
  state,
  files,
  message,
  onRetry,
  processedLabel,
}: DriveInboxFileResultsProps) {
  if (state === "loading") {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-background-200 bg-background-50 px-3 py-4">
        <i className="ri-loader-4-line w-4 h-4 animate-spin flex items-center justify-center text-foreground-400"></i>
        <p className="text-[12px] text-foreground-500">
          取込結果を取得しています…
        </p>
      </div>
    );
  }

  if (state === "unavailable" || state === "error") {
    const isError = state === "error";
    return (
      <div className="mt-3 rounded-lg border border-background-200 bg-background-50 px-3 py-4">
        <div className="flex items-start gap-2">
          <i
            className={`${
              isError ? "ri-error-warning-line" : "ri-plug-line"
            } mt-0.5 w-4 h-4 shrink-0 flex items-center justify-center text-sm ${
              isError ? "text-red-600" : "text-secondary-700"
            }`}
          ></i>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-foreground-800">
              {isError
                ? "取込結果を取得できませんでした"
                : "まだ取込結果を取得できていません"}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-foreground-500">
              {message}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-foreground-700 transition-colors hover:bg-background-100"
            >
              <i className="ri-refresh-line w-3.5 h-3.5 flex items-center justify-center"></i>
              再取得
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="mt-3 flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-background-300 bg-background-50 py-8 text-center">
        <i className="ri-inbox-line w-6 h-6 flex items-center justify-center text-foreground-300"></i>
        <p className="text-[12px] font-medium text-foreground-700">
          取り込むファイルはありません
        </p>
        <p className="text-[11px] text-foreground-500">
          01_inbox に対象のPDFを置くと、次回の取込で処理されます
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-background-200">
      <div className="hidden items-center gap-3 border-b border-background-200 bg-background-50 px-3 py-2 lg:flex">
        <span className="min-w-0 flex-1 text-[11px] font-medium text-foreground-500">
          ファイル名
        </span>
        <span className="w-[96px] shrink-0 text-[11px] font-medium text-foreground-500">
          状態
        </span>
        <span className="w-[52px] shrink-0 text-right text-[11px] font-medium text-foreground-500">
          明細
        </span>
        <span className="min-w-0 flex-[1.2] text-[11px] font-medium text-foreground-500">
          失敗理由
        </span>
        <span className="w-[110px] shrink-0 text-[11px] font-medium text-foreground-500">
          フォルダ
        </span>
        <span className="w-[104px] shrink-0 text-right text-[11px] font-medium text-foreground-500">
          更新
        </span>
      </div>

      {files.map((file) => {
        const status = resolveDriveInboxFileStatus(file);
        return (
          <div
            key={file.file_id}
            className="flex flex-col gap-2 border-b border-background-200 px-3 py-2.5 last:border-b-0 lg:flex-row lg:items-center lg:gap-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground-900">
                {file.file_name || "（ファイル名なし）"}
              </p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-foreground-400">
                {file.file_id}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:contents">
              <span className="shrink-0 lg:w-[96px]">
                <StatusChip
                  status={status}
                  label={status === "processed" ? processedLabel : undefined}
                />
              </span>
              <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-foreground-700 lg:w-[52px] lg:text-right">
                {typeof file.line_count === "number" ? (
                  <>
                    {file.line_count}
                    <span className="ml-0.5 text-[10px] text-foreground-400">
                      件
                    </span>
                  </>
                ) : (
                  <span className="text-foreground-300">—</span>
                )}
              </span>
              <p className="min-w-0 text-[11px] leading-relaxed text-foreground-600 lg:w-auto lg:flex-[1.2]">
                {status === "failed" ? (
                  file.error_reason || "失敗理由が取得できていません"
                ) : (
                  <span className="text-foreground-300">—</span>
                )}
              </p>
              <span className="inline-block shrink-0 truncate rounded border border-background-200 bg-background-50 px-1.5 py-0.5 font-mono text-[10px] text-foreground-600 lg:w-[110px]">
                {file.folder || "—"}
              </span>
              <span className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-foreground-400 lg:w-[104px] lg:text-right">
                {formatDateTime(file.updated_at)}
              </span>
            </div>

            {status === "processed" && file.document_id && (
              <Link
                to={`/documents/${file.document_id}`}
                title={
                  file.document_id_source === "ledger"
                    ? "台帳のファイル名一致から確認した書類を開きます"
                    : "台帳の書類を開きます"
                }
                className="inline-flex w-fit shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium text-primary-700 transition-colors hover:bg-primary-50"
              >
                台帳を開く
                <i className="ri-arrow-right-s-line w-3.5 h-3.5 flex items-center justify-center"></i>
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}