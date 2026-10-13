import { useCallback, useRef, useState } from "react";
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_TYPE_OPTIONS,
  attachProductDocument,
  createDocumentIdempotencyKey,
  validateDocumentFile,
  type AttachedDocument,
  type DocumentType,
} from "@/pages/import/lib/productDocument";
import type { ProductDocument } from "@/pages/products/types";
import ProductDocumentSection from "@/pages/products/detail/components/ProductDocumentSection";

interface ProductDocumentPanelProps {
  productId: string;
  document?: ProductDocument | null;
  // 添付成功、または競合で既存書類が判明したときに呼ぶ。
  // 親はこれを機に書類情報（商品詳細）を再取得する。
  onAttached: (doc: ProductDocument | null) => void;
}

type AttachStatus = "idle" | "attaching" | "error" | "conflict";

const selectClass =
  "rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-[13px] text-foreground-900 transition-colors focus:border-primary-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60";

function toProductDocument(
  doc: AttachedDocument | null
): ProductDocument | null {
  if (!doc) return null;
  return {
    file_name: doc.file_name,
    mime_type: doc.mime_type,
    view_url: doc.view_url,
    display_url: doc.display_url,
    size: doc.size,
    attached_at: doc.attached_at,
  };
}

/**
 * 商品詳細・編集画面の「書類（請求書・領収書）」欄。
 * - 未添付の既存商品に、後から書類を1件添付できる（PDF / JPG / PNG）。
 * - 送信は既存商品の product_id を使い、GAS の attach_product_document へ別リクエストで送る。
 *   送信項目は action / product_id / idempotency_key / document_type /
 *   file_name / mime_type / base64。
 * - 失敗しても商品は再登録せず、書類だけ再試行できる。同じファイルの再試行では
 *   同じ idempotency_key を使う。
 * - 既に書類が1件ある商品では添付欄を出さず、登録済み書類のリンクを表示する（差し替えなし）。
 * - 管理画面専用。公開ページには表示しない。
 */
export default function ProductDocumentPanel({
  productId,
  document,
  onAttached,
}: ProductDocumentPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>("invoice");
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [status, setStatus] = useState<AttachStatus>("idle");
  const [message, setMessage] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!file || status === "attaching") return;
    // 同じファイルの再試行では同じ idempotency_key を再利用する（冪等）。
    const key = idempotencyKey ?? createDocumentIdempotencyKey();
    if (!idempotencyKey) setIdempotencyKey(key);

    setStatus("attaching");
    setMessage("");
    setErrorCode(null);

    const result = await attachProductDocument({
      productId,
      idempotencyKey: key,
      documentType,
      file,
    });

    if (result.kind === "success") {
      // 添付成功。書類情報を再取得して表示する（親が商品詳細を再取得する）。
      onAttached(toProductDocument(result.document));
      setFile(null);
      setIdempotencyKey(null);
      setStatus("idle");
    } else if (result.kind === "conflict") {
      // 別書類が添付済み。上書きしない。既存書類があれば表示する。
      setStatus("conflict");
      setErrorCode("DOCUMENT_ALREADY_ATTACHED");
      setMessage(result.message || "既に別の書類が添付されています。");
      onAttached(toProductDocument(result.existing));
    } else if (result.kind === "rejected") {
      setStatus("error");
      setErrorCode(result.errorCode || null);
      setMessage(result.message || "書類の添付に失敗しました。");
    } else {
      setStatus("error");
      setErrorCode(null);
      setMessage(result.message || "書類の応答を確認できませんでした。");
    }
  }, [documentType, file, idempotencyKey, onAttached, productId, status]);

  const hasDocument = Boolean(
    document && (document.file_name || document.view_url || document.display_url)
  );

  // 既に書類が1件ある商品では、添付欄を出さず登録済み書類のリンクのみ表示する。
  if (hasDocument) {
    return <ProductDocumentSection doc={document} />;
  }

  const handleSelect = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const selected = fileList[0];
    const invalid = validateDocumentFile(selected);
    if (invalid) {
      setFile(null);
      setIdempotencyKey(null);
      setStatus("error");
      setErrorCode("LOCAL_VALIDATION");
      setMessage(invalid);
      return;
    }
    // ファイルを選び直したら新しい idempotency_key を発行する
    // （同じファイルの再試行ではこのキーを再利用する）。
    setFile(selected);
    setIdempotencyKey(createDocumentIdempotencyKey());
    setStatus("idle");
    setMessage("");
    setErrorCode(null);
  };

  const clearFile = () => {
    setFile(null);
    setIdempotencyKey(null);
    setStatus("idle");
    setMessage("");
    setErrorCode(null);
  };

  const attaching = status === "attaching";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground-500">
          <i className="ri-file-text-line w-3.5 h-3.5 flex items-center justify-center"></i>
          書類（請求書・領収書）
        </p>
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-background-100 px-2.5 py-1 text-[11px] font-bold text-foreground-600">
          <i className="ri-file-unknow-line w-3.5 h-3.5 flex items-center justify-center"></i>
          未添付
        </span>
      </div>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-foreground-500">種別</span>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as DocumentType)}
            disabled={attaching}
            className={selectClass}
          >
            {DOCUMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] font-medium text-foreground-500">
            ファイル（PDF / JPG / PNG・1件）
          </span>
          {file ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-background-100 px-2.5 py-1.5 text-[12px] font-medium text-foreground-800">
                <i className="ri-attachment-2 w-3.5 h-3.5 flex items-center justify-center text-foreground-500"></i>
                <span className="max-w-[240px] truncate" title={file.name}>
                  {file.name}
                </span>
              </span>
              <button
                type="button"
                onClick={clearFile}
                disabled={attaching}
                className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-foreground-600 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <i className="ri-close-line w-3.5 h-3.5 flex items-center justify-center"></i>
                解除
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={attaching}
              className="inline-flex w-fit cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-white px-3 py-1.5 text-xs font-medium text-foreground-700 transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="ri-upload-2-line w-4 h-4 flex items-center justify-center"></i>
              書類を選択
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!file || attaching}
          className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {attaching ? (
            <>
              <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
              添付中...
            </>
          ) : status === "error" || status === "conflict" ? (
            <>
              <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
              書類だけ再試行
            </>
          ) : (
            <>
              <i className="ri-attachment-2 w-4 h-4 flex items-center justify-center"></i>
              書類を添付
            </>
          )}
        </button>
        <span className="text-[11px] text-foreground-400">
          未添付でも商品情報はそのままです。商品は再登録しません。
        </span>
      </div>

      {attaching && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-secondary-900">
          <i className="ri-loader-4-line w-4 h-4 animate-spin flex items-center justify-center"></i>
          書類を添付しています（商品は再登録しません）...
        </p>
      )}

      {status === "conflict" && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <i className="ri-alert-line mt-0.5 w-4 h-4 flex items-center justify-center shrink-0 text-amber-600"></i>
          <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-amber-800">
            {message || "既に別の書類が添付されているため、上書きできません。"}
          </span>
        </div>
      )}

      {status === "error" && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center shrink-0 text-red-600"></i>
          <span className="min-w-0 flex-1 break-words text-[12px] leading-relaxed text-red-700">
            {message || "書類の添付に失敗しました。"}
            {errorCode && errorCode !== "LOCAL_VALIDATION" && (
              <span className="ml-1 font-mono text-[11px]">
                （コード: {errorCode}）
              </span>
            )}
            <br />
            商品の登録は完了しています。商品を再登録せず、同じ書類で再試行できます。
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          handleSelect(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}