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
  // 価格が未設定のときは、グレー＋少し小さい文字にして「情報が無い」ことを控えめに伝える。
  const hasPrice = Boolean(
    product.planned_sale_price && product.planned_sale_price > 0
  );
  return (
    <div className="ui-card flex flex-col overflow-hidden rounded-lg">
      {/* 1. 商品名・商品ID・状態バッジ */}
      <div className="border-b border-background-100 px-4 py-4 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* 商品名は一覧と同じディスプレイ書体。見出しとして一段大きく、字間を詰める。 */}
            <h1
              className={`admin-title break-words text-[22px] font-semibold leading-tight md:text-[26px] ${
                product.product_name
                  ? "text-foreground-950"
                  : "text-foreground-400"
              }`}
            >
              {product.product_name || "商品名未入力"}
            </h1>
            <p className="admin-numeric mt-1.5 text-[11px] tracking-[0.06em] text-foreground-400">
              {product.product_id}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* 並び順は全画面で統一: 公開 → 在庫 → 照合 → 連携 */}
            <span className={`st-badge ${statusClass}`}>{statusLabel}</span>
            <span className="st-badge st-muted">{categoryLabel}</span>
          </div>
        </div>
      </div>

      {/* 2. 商品スペック */}
      <div className="border-b border-background-100 px-4 py-4 md:px-5">
        <ProductSpecGrid product={product} cost={cost} />
      </div>

      {/* 3. 販売予定価格 + 公開/在庫状態 */}
      <div className="border-b border-background-100 px-4 py-4 md:px-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-[12px] leading-4 text-foreground-500">
              販売予定価格
            </p>
            <p
              className={`mt-1 whitespace-nowrap leading-none tracking-tight admin-numeric ${
                hasPrice
                  ? "text-[28px] font-semibold text-foreground-950"
                  : "text-[22px] font-medium text-foreground-400"
              }`}
            >
              {formatPrice(product.planned_sale_price)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* 公開＝緑 / 在庫＝青グレー。詳細でも一覧と同じドメイン色・同じ寸法で揃える */}
            <span className={`st-badge ${statusClass}`}>
              <i className="ri-eye-line w-3 h-3 flex items-center justify-center text-xs"></i>
              公開：{statusLabel}
            </span>
            <span className="st-badge st-inventory">
              <i className="ri-archive-2-line w-3 h-3 flex items-center justify-center text-xs"></i>
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