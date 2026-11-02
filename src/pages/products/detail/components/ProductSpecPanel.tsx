import type { AdminProductDetail } from "@/pages/products/types";
import { DescriptionBlock } from "./InfoRow";
import { hasText } from "../lib/format";

interface ProductSpecPanelProps {
  product: AdminProductDetail;
}

/**
 * 商品詳細の「商品説明・備考」セクション（表示専用）。
 * 商品スペックは右上の商品情報カードに集約したため、
 * ここでは商品説明・備考のみを表示し、同じ情報を重複表示しない。
 *
 * 未入力の項目は「—」を並べず、入力済みの項目だけを表示する。
 * どちらも空のときは、空欄を埋める代わりに一行の案内に置き換える。
 */
export default function ProductSpecPanel({ product }: ProductSpecPanelProps) {
  const hasDescription = hasText(product.description ?? "");
  const hasNotes = hasText(product.notes ?? "");
  const hasAny = hasDescription || hasNotes;

  return (
    <div className="ui-card rounded-lg">
      <div className="flex items-center justify-between gap-3 border-b border-background-100 px-4 py-3 md:px-5">
        <h2 className="text-[15px] font-semibold text-foreground-950">
          商品説明・備考
        </h2>
        {!hasAny && (
          <span className="whitespace-nowrap rounded-md bg-background-100 px-2 py-0.5 text-[10px] font-medium text-foreground-500">
            未入力
          </span>
        )}
      </div>

      <div className="px-4 py-4 md:px-5">
        {hasAny ? (
          <>
            {hasDescription && (
              <DescriptionBlock
                label="商品説明"
                value={product.description ?? ""}
              />
            )}
            {hasNotes && (
              <DescriptionBlock label="備考" value={product.notes ?? ""} />
            )}
          </>
        ) : (
          <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-foreground-400">
            <i className="ri-file-text-line mt-0.5 w-3.5 h-3.5 flex items-center justify-center shrink-0"></i>
            <span className="min-w-0 flex-1">
              商品説明・備考はまだ入力されていません。「商品情報を編集」から追加できます。
            </span>
          </p>
        )}
      </div>
    </div>
  );
}