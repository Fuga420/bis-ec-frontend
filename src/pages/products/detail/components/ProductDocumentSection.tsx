import type { ProductDocument } from "@/pages/products/types";

interface ProductDocumentSectionProps {
  doc?: ProductDocument | null;
}

function resolveUrl(doc: ProductDocument | null | undefined): string {
  if (!doc) return "";
  return doc.view_url || doc.display_url || "";
}

/** 既存の添付書類があるか（無い場合は何も表示しない）。 */
export function hasAttachedDocument(
  doc: ProductDocument | null | undefined
): boolean {
  if (!doc) return false;
  return Boolean(doc.file_name || resolveUrl(doc));
}

function formatSize(size: number | null | undefined): string {
  if (size == null || size <= 0) return "";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

/**
 * 商品に添付された書類（請求書・領収書）の閲覧リンクを表示する。
 * 商品への新規アップロード導線は撤去済みのため、既存の添付がある場合のみ表示する
 * （未添付の場合は何も描画しない）。仕入書類の取り込みは独立した書類台帳で行う。
 * 管理画面専用。公開ページには表示しない。
 * JPG/PNG の書類でもサムネイル表示はせず、ファイル名とリンクのみを提示する
 * （商品画像・AI生成対象とは完全に分離する）。
 */
export default function ProductDocumentSection({
  doc,
}: ProductDocumentSectionProps) {
  if (!hasAttachedDocument(doc)) {
    return null;
  }

  const url = resolveUrl(doc);
  const sizeText = formatSize(doc?.size ?? null);

  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground-500">
        <i className="ri-file-text-line w-3.5 h-3.5 flex items-center justify-center"></i>
        書類（請求書・領収書）
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-background-100 px-2.5 py-1 text-[12px] font-medium text-foreground-800">
          <i className="ri-attachment-2 w-3.5 h-3.5 flex items-center justify-center text-foreground-500"></i>
          <span className="max-w-[260px] truncate" title={doc?.file_name}>
            {doc?.file_name || "書類"}
          </span>
          {sizeText && (
            <span className="text-[11px] text-foreground-400">{sizeText}</span>
          )}
        </span>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-primary-300 bg-white px-3 py-1.5 text-xs font-bold text-primary-700 transition-colors hover:bg-primary-100"
          >
            <i className="ri-external-link-line w-4 h-4 flex items-center justify-center"></i>
            書類を開く
          </a>
        ) : (
          <span className="text-[11px] text-foreground-400">
            リンクを取得できませんでした
          </span>
        )}
      </div>
    </div>
  );
}