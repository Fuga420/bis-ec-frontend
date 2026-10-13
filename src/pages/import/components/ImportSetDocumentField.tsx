import { useRef, useState } from "react";
import {
  DOCUMENT_ACCEPT,
  validateDocumentFile,
  type AttachedDocument,
  type DocumentAttachStatus,
} from "@/pages/import/lib/productDocument";

interface ImportSetDocumentFieldProps {
  document: File | null;
  status: DocumentAttachStatus;
  result: AttachedDocument | null;
  errorCode: string | null;
  errorMessage: string | null;
  productId: string | null;
  // 一括取込中など、操作全体をロックする。
  globalDisabled: boolean;
  onSelect: (file: File | null) => void;
  onAttach: () => void;
  onResend: () => void;
}

function resolveUrl(doc: AttachedDocument | null): string {
  if (!doc) return "";
  return doc.view_url || doc.display_url || "";
}

function formatSize(size: number | null): string {
  if (size == null || size <= 0) return "";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

/**
 * 1商品セット分の任意の書類（請求書・領収書）欄。
 * MVP: PDF / JPG / PNG を1件。未添付でも商品登録は完了する。
 * 商品登録の結果とは独立に、書類添付の状態を表示する。
 */
export default function ImportSetDocumentField({
  document,
  status,
  result,
  errorCode,
  errorMessage,
  productId,
  globalDisabled,
  onSelect,
  onAttach,
  onResend,
}: ImportSetDocumentFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState("");

  // 添付中・添付済み・競合時はファイルを変更できない（上書き防止）。
  const locked =
    status === "attaching" || status === "attached" || status === "conflict";
  const editable = !globalDisabled && !locked;

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    const message = validateDocumentFile(file);
    if (message) {
      setLocalError(message);
      return;
    }
    setLocalError("");
    onSelect(file);
  };

  const attachedName = result?.file_name || document?.name || "書類";
  const attachedUrl = resolveUrl(result);

  return (
    <div className="mt-3 rounded-md border border-background-200 bg-background-50 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground-800">
          <i className="ri-file-text-line w-4 h-4 flex items-center justify-center text-foreground-500"></i>
          書類（請求書・領収書）
          <span className="text-[11px] font-normal text-foreground-400">
            任意・1件（PDF / JPG / PNG）
          </span>
        </p>
        {status === "attached" && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary-100 px-2.5 py-1 text-[11px] font-bold text-primary-700">
            <i className="ri-checkbox-circle-line w-3.5 h-3.5 flex items-center justify-center"></i>
            書類 添付済み
          </span>
        )}
        {status === "conflict" && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
            <i className="ri-alert-line w-3.5 h-3.5 flex items-center justify-center"></i>
            書類 競合
          </span>
        )}
        {(status === "error" || status === "unknown") && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">
            <i className="ri-error-warning-line w-3.5 h-3.5 flex items-center justify-center"></i>
            書類 未添付
          </span>
        )}
        {status === "attaching" && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-secondary-100 px-2.5 py-1 text-[11px] font-bold text-secondary-900">
            <i className="ri-loader-4-line w-3.5 h-3.5 animate-spin flex items-center justify-center"></i>
            書類 添付中
          </span>
        )}
      </div>

      {/* 添付済み */}
      {status === "attached" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-foreground-800">
            <i className="ri-attachment-2 w-3.5 h-3.5 flex items-center justify-center text-foreground-500"></i>
            <span className="max-w-[220px] truncate" title={attachedName}>
              {attachedName}
            </span>
            {formatSize(result?.size ?? null) && (
              <span className="text-[11px] text-foreground-400">
                {formatSize(result?.size ?? null)}
              </span>
            )}
          </span>
          {attachedUrl ? (
            <a
              href={attachedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-primary-300 bg-white px-3 py-1.5 text-xs font-bold text-primary-700 transition-colors hover:bg-primary-100"
            >
              <i className="ri-external-link-line w-4 h-4 flex items-center justify-center"></i>
              書類を開く
            </a>
          ) : (
            <span className="text-[11px] text-foreground-400">
              リンクは商品詳細で確認できます
            </span>
          )}
        </div>
      )}

      {/* 競合（別書類が既に添付済み。勝手に上書きしない） */}
      {status === "conflict" && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-900">
            <i className="ri-alert-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
            <span>
              この商品には既に別の書類が添付されています。
              {errorMessage || "別書類のため上書きできません。"}
              ここで選択した書類は添付していません（勝手に上書きしません）。
            </span>
          </p>
          {result?.file_name && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-foreground-800">
                <i className="ri-file-text-line w-3.5 h-3.5 flex items-center justify-center text-foreground-500"></i>
                <span className="max-w-[220px] truncate">
                  {result.file_name}
                </span>
              </span>
              {resolveUrl(result) && (
                <a
                  href={resolveUrl(result)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-900 transition-colors hover:bg-amber-100"
                >
                  <i className="ri-external-link-line w-3.5 h-3.5 flex items-center justify-center"></i>
                  既存の書類を開く
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* 添付中 */}
      {status === "attaching" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-secondary-900">
          <i className="ri-loader-4-line w-4 h-4 animate-spin flex items-center justify-center"></i>
          書類を添付しています（商品は再登録しません）...
        </p>
      )}

      {/* エラー / 受付不明 → 商品は再登録せず、書類だけ再送 */}
      {(status === "error" || status === "unknown") && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="flex items-start gap-1.5 text-xs font-medium text-red-800">
            <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
            <span className="min-w-0 flex-1 break-words">
              {errorMessage || "書類の添付に失敗しました。"}
              {errorCode && errorCode !== "LOCAL_READ_ERROR" && (
                <span className="ml-1 font-mono text-[11px]">
                  （コード: {errorCode}）
                </span>
              )}
            </span>
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-red-700">
            商品の登録は完了しています。商品は再登録せず、同じ商品へ
            <span className="font-bold">書類だけ再送</span>
            します。
          </p>
          <button
            type="button"
            onClick={onResend}
            disabled={globalDisabled || !productId || !document}
            className="mt-2 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
            書類だけ再送
          </button>
        </div>
      )}

      {/* 未添付（ファイル未選択）：選択UI */}
      {!document && (status === "idle") && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => editable && inputRef.current?.click()}
            disabled={!editable}
            className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-white px-3 py-1.5 text-xs font-medium text-foreground-700 transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="ri-upload-2-line w-4 h-4 flex items-center justify-center"></i>
            書類を選択（PDF / JPG / PNG）
          </button>
          <p className="mt-1.5 text-[11px] text-foreground-400">
            未添付でも商品登録は完了できます。
          </p>
        </div>
      )}

      {/* ファイル選択済み（未添付）：ファイル名＋添付/解除 */}
      {document && status === "idle" && (
        <div className="mt-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-foreground-800">
              <i className="ri-attachment-2 w-3.5 h-3.5 flex items-center justify-center text-foreground-500"></i>
              <span className="max-w-[220px] truncate" title={document.name}>
                {document.name}
              </span>
            </span>
            {productId ? (
              <button
                type="button"
                onClick={onAttach}
                disabled={globalDisabled}
                className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md bg-primary-500 px-3 py-1.5 text-xs font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <i className="ri-attachment-2 w-4 h-4 flex items-center justify-center"></i>
                書類を添付
              </button>
            ) : (
              <span className="text-[11px] text-foreground-500">
                商品登録の成功後に自動で添付します
              </span>
            )}
            {editable && (
              <button
                type="button"
                onClick={() => {
                  setLocalError("");
                  onSelect(null);
                }}
                className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 py-1 text-[11px] font-medium text-foreground-600 transition-colors hover:bg-background-100"
              >
                <i className="ri-close-line w-3.5 h-3.5 flex items-center justify-center"></i>
                解除
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-foreground-400">
            未添付でも商品登録は完了できます。
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {localError && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
          <i className="ri-error-warning-line w-4 h-4 flex items-center justify-center"></i>
          {localError}
        </p>
      )}
    </div>
  );
}