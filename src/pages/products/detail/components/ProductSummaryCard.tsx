import type { AdminProductDetail } from "@/pages/products/types";
import SaveStatusMessage from "@/components/base/SaveStatusMessage";
import ProductSpecGrid, {
  type ProductCostSpecInput,
} from "./ProductSpecGrid";
import { formatPrice } from "../lib/format";

interface ProductSummaryCardProps {
  product: AdminProductDetail;
  categoryLabel: string;
  statusLabel: string;
  inventoryLabel: string;
  statusClass: string;
  aiPriceHint: { show: boolean; price: number | null };
  editMessage: { type: "success" | "error" | "warning"; text: string } | null;
  // 確定済みの仕入原価（下部「仕入・書類」と同じ取得結果）
  cost: ProductCostSpecInput;
  onStartEdit: () => void;
}

/**
 * 商品詳細のサマリー領域。
 * 商品名・商品ID・公開状態 / 商品スペック一覧 / 販売予定価格・在庫状態 / 編集導線を
 * 1枚のカードにまとめて表示する（表示専用・保存はしない）。
 */
export default function ProductSummaryCard({
  product,
  categoryLabel,
  statusLabel,
  inventoryLabel,
  statusClass,
  aiPriceHint,
  editMessage,
  onStartEdit,
  cost,
}: ProductSummaryCardProps) {
  return (
    <div className="flex flex-col overflow-hidden rounded-[10px] border border-background-200 bg-white">
      {/* 1. 商品名・商品ID・状態バッジ */}
      <div className="border-b border-background-100 px-4 py-4 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-xl font-semibold leading-snug text-foreground-950">
              {product.product_name || "（商品名なし）"}
            </h1>
            <p className="mt-1 font-mono text-xs text-foreground-500">
              {product.product_id}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-md px-2 text-[11px] font-medium leading-none ${statusClass}`}
            >
              {statusLabel}
            </span>
            <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-md bg-background-100 px-2 text-[11px] font-medium leading-none text-foreground-600">
              {categoryLabel}
            </span>
          </div>
        </div>
      </div>

      {/* 2. 商品スペック */}
      <dl className="border-b border-background-100 px-4 py-4 md:px-5">
        <ProductSpecGrid product={product} cost={cost} />
      </dl>

      {/* 3. 販売予定価格 + 公開/在庫状態 */}
      <div className="border-b border-background-100 px-4 py-4 md:px-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-[12px] leading-4 text-foreground-500">
              販売予定価格
            </p>
            <p className="mt-1 whitespace-nowrap text-2xl font-semibold tracking-tight text-foreground-950">
              {formatPrice(product.planned_sale_price)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-background-200 bg-background-50 px-2.5 py-1 text-[11px] font-medium text-foreground-700">
              <i className="ri-eye-line w-3.5 h-3.5 flex items-center justify-center text-foreground-400"></i>
              公開：{statusLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-background-200 bg-background-50 px-2.5 py-1 text-[11px] font-medium text-foreground-700">
              <i className="ri-archive-2-line w-3.5 h-3.5 flex items-center justify-center text-foreground-400"></i>
              在庫：{inventoryLabel}
            </span>
          </div>
        </div>
      </div>

      {/* 4. 編集導線 */}
      <div className="flex flex-col gap-3 px-4 py-3 md:px-5">
        {aiPriceHint.show && (
          <div className="flex items-start gap-2 rounded-lg border border-accent-300 bg-accent-50/70 px-3 py-2">
            <i className="ri-sparkling-line mt-0.5 w-4 h-4 flex items-center justify-center shrink-0 text-accent-600"></i>
            <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-foreground-700">
              販売予定価格が未設定ですが、AIの価格案
              <strong className="mx-1 font-semibold text-foreground-950">
                ¥{aiPriceHint.price?.toLocaleString()}
              </strong>
              があります。「商品情報を編集」で初期値として表示され、必要に応じて修正して保存できます。
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={onStartEdit}
          className="inline-flex w-fit cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
        >
          <i className="ri-edit-line w-4 h-4 flex items-center justify-center"></i>
          商品情報を編集
        </button>
        {editMessage &&
          (editMessage.type === "success" || editMessage.type === "warning") && (
            <SaveStatusMessage
              tone={editMessage.type}
              text={editMessage.text}
            />
          )}
      </div>
    </div>
  );
}