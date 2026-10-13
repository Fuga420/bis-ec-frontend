import { useRef, useState } from "react";
import {
  DOCUMENT_ACCEPT,
  createDocumentIdempotencyKey,
  validateDocumentFile,
} from "@/pages/import/lib/productDocument";
import {
  DocumentLedgerApiError,
  uploadDocument,
} from "@/pages/documents/lib/documentLedgerApi";
import type { DocumentLedgerDocument } from "@/pages/documents/types";

interface DocumentUploadFieldProps {
  // 取込成功した書類を一覧へ反映する（再取得のトリガーに使う）。
  onUploaded: (doc: DocumentLedgerDocument) => void;
  disabled?: boolean;
}

/**
 * 書類アップロード欄（PDF / JPG / PNG・1回1ファイル）。
 * 受け入れ検証は既存の書類添付と同じ条件（validateDocumentFile）を再利用する。
 * 送信は documents-relay の import_document（原本は Drive に保管）。
 * 再送識別子（idempotency_key）はファイル選択ごとに発行し、再試行では同じ値を使う。
 */
export default function DocumentUploadField({
  onUploaded,
  disabled = false,
}: DocumentUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const idempotencyRef = useRef<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [amountText, setAmountText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleSelect = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const selected = fileList[0];
    const invalid = validateDocumentFile(selected);
    if (invalid) {
      setFile(null);
      setError(invalid);
      setNotice("");
      return;
    }
    setFile(selected);
    idempotencyRef.current = createDocumentIdempotencyKey();
    setError("");
    setNotice("");
  };

  const clearFile = () => {
    setFile(null);
    idempotencyRef.current = "";
    setError("");
    setNotice("");
  };

  const handleUpload = async () => {
    if (!file || uploading) return;
    if (!supplierName.trim()) {
      setError("仕入先名を入力してください。");
      setNotice("");
      return;
    }
    if (!idempotencyRef.current) {
      idempotencyRef.current = createDocumentIdempotencyKey();
    }

    setUploading(true);
    setError("");
    setNotice("");
    try {
      const uploaded = await uploadDocument({
        file,
        supplierName: supplierName.trim(),
        idempotencyKey: idempotencyRef.current,
        totalAmount: amountText === "" ? null : Number(amountText),
      });
      onUploaded(uploaded);
      setNotice(`「${uploaded.file_name || file.name}」を取り込みました。`);
      setFile(null);
      idempotencyRef.current = "";
      setAmountText("");
    } catch (e) {
      if (e instanceof DocumentLedgerApiError) {
        if (e.code === "DUPLICATE_FILE_FINGERPRINT") {
          setError("同一内容のファイルが既に登録されています。別の書類を選んでください。");
        } else {
          setError(e.message);
        }
      } else {
        setError("アップロードに失敗しました。時間をおいて再度お試しください。");
      }
    } finally {
      setUploading(false);
    }
  };

  const fieldClass =
    "h-9 w-full rounded-md border border-background-300 bg-white px-3 text-sm text-foreground-900 placeholder:text-foreground-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="rounded-lg border border-background-200 bg-white p-4 md:p-5">
      <div className="flex items-center gap-2">
        <i className="ri-upload-cloud-2-line w-5 h-5 flex items-center justify-center text-primary-600"></i>
        <h2 className="text-[15px] font-semibold text-foreground-950">
          書類をアップロード
        </h2>
      </div>
      <p className="mt-1 text-xs text-foreground-500">
        請求書・領収書の原本（PDF / JPG / PNG・1回1ファイル）を登録します。原本は Drive
        に保管されます。
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px]">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-foreground-500">
            仕入先名 <span className="text-red-500">*</span>
          </span>
          <input
            type="text"
            value={supplierName}
            disabled={disabled || uploading}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="例: 銀座トレーディング"
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-foreground-500">
            原本合計（任意）
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={amountText}
            disabled={disabled || uploading}
            onChange={(e) => setAmountText(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="例: 131200"
            className={`${fieldClass} tabular-nums`}
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-foreground-500">
            ファイル
          </span>
          {file ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-background-100 px-2.5 py-2 text-[12px] font-medium text-foreground-800">
                <i className="ri-attachment-2 w-3.5 h-3.5 flex items-center justify-center text-foreground-500"></i>
                <span className="max-w-[140px] truncate" title={file.name}>
                  {file.name}
                </span>
              </span>
              <button
                type="button"
                onClick={clearFile}
                disabled={disabled || uploading}
                aria-label="選択を解除"
                className="inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-background-300 bg-white px-2 py-1.5 text-[11px] font-medium text-foreground-600 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <i className="ri-close-line w-3.5 h-3.5 flex items-center justify-center"></i>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || uploading}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-white px-3 py-2 text-xs font-medium text-foreground-700 transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="ri-file-add-line w-4 h-4 flex items-center justify-center"></i>
              ファイルを選択
            </button>
          )}
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || disabled || uploading}
          className="inline-flex w-fit cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? (
            <>
              <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
              アップロード中...
            </>
          ) : (
            <>
              <i className="ri-upload-2-line w-4 h-4 flex items-center justify-center"></i>
              アップロード
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
          <i className="ri-error-warning-line w-4 h-4 flex items-center justify-center"></i>
          {error}
        </p>
      )}

      {notice && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-[11px] leading-relaxed text-primary-800">
          <i className="ri-checkbox-circle-line mt-0.5 w-4 h-4 flex items-center justify-center shrink-0"></i>
          <span className="min-w-0 flex-1">{notice}</span>
        </p>
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