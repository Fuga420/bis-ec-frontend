import type { AdminProductDetail } from "@/pages/products/types";
import { DescriptionBlock } from "./InfoRow";

interface ProductSpecPanelProps {
  product: AdminProductDetail;
}

/**
 * 商品詳細の「商品説明・備考」セクション（表示専用）。
 * 商品スペックは右上の商品情報カードに集約したため、
 * ここでは商品説明・備考のみを表示し、同じ情報を重複表示しない。
 */
export default function ProductSpecPanel({ product }: ProductSpecPanelProps) {
  return (
    <div className="rounded-[10px] border border-background-200 bg-white">
      <div className="border-b border-background-100 px-4 py-3 md:px-5">
        <h2 className="text-[15px] font-semibold text-foreground-950">
          商品説明・備考
        </h2>
      </div>

      <div className="px-4 py-4 md:px-5">
        <DescriptionBlock label="商品説明" value={product.description ?? ""} />
        <DescriptionBlock label="備考" value={product.notes ?? ""} />
      </div>
    </div>
  );
}