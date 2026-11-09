import type { AdminProductDetail } from "@/pages/products/types";
import SaveStatusMessage from "@/components/base/SaveStatusMessage";
import CatalogueSpecPanel from "./CatalogueSpecPanel";
import type { ProductCostSpecInput } from "./ProductSpecGrid";
import { formatPrice } from "../lib/format";

interface ProductProfilePanelProps {
  product: AdminProductDetail;
  categoryLabel: string;
  statusLabel: string;
  inventoryLabel: string;
  // AIの価格案（販売予定価格が未設定のときだけ表示する）
  aiPriceHint: { show: boolean; price: number | null };
  editMessage: { type: "success" | "error" | "warning"; text: string } | null;
  cost?: ProductCostSpecInput;
  onStartEdit: () => void;
}

const PUBLISH_BADGE: Record<string, string> = {
  published: "st-publish",
  draft: "st-publish-off",
  hidden: "st-publish-off",
};

const INVENTORY_BADGE: Record<string, string> = {
  in_stock: "st-inventory",
  reserved: "st-inventory-soft",
  sold: "st-inventory-off",
};

/**
 * 商品詳細の上部「商品情報」パネル（表示専用）。
 * 状態 → 商品名 → 補助情報 → 販売予定価格 → 商品スペック → 編集操作の順に並べ、
 * 画像ギャラリーの右側に置く。保存・取得の処理は持たない（操作は既存のハンドラを呼ぶだけ）。
 */
export default function ProductProfilePanel({
  product,
  categoryLabel,
  statusLabel,
  inventoryLabel,
  aiPriceHint,
  editMessage,
  cost,
  onStartEdit,
}: ProductProfilePanelProps) {
  const japaneseTitle = (product.product_name ?? "").trim();
  const hasPrice = Boolean(
    product.planned_sale_price && product.planned_sale_price > 0
  );
  const isArchived = product.record_status === "archived";

  return (
    <section className="min-w-0">
      {/* 1. 状態 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`st-badge ${
            PUBLISH_BADGE[product.publish_status] ?? "st-publish-off"
          }`}
        >
          {statusLabel}
        </span>
        <span
          className={`st-badge ${
            INVENTORY_BADGE[product.inventory_status] ?? "st-muted"
          }`}
        >
          {inventoryLabel}
        </span>
        {product.is_test && <span className="st-badge st-muted">テスト商品</span>}
        {isArchived && <span className="st-badge st-muted">アーカイブ済み</span>}
      </div>

      {/* 2. 商品名 */}
      <h2 className="mt-2 break-words text-[20px] font-semibold leading-snug text-foreground-950 md:text-[22px]">
        {japaneseTitle || "商品名未入力"}
      </h2>

      {/* 3. 補助情報（商品名と重複しない項目だけ） */}
      <dl className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-foreground-500">
        <div className="flex items-center gap-1.5">
          <dt>商品ID</dt>
          <dd className="admin-numeric font-medium text-foreground-800">
            {product.product_id}
          </dd>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <dt className="shrink-0">カテゴリ</dt>
          <dd className="min-w-0 break-words font-medium text-foreground-800">
            {categoryLabel}
          </dd>
        </div>
      </dl>

      {/* 4. 販売予定価格 */}
      <div className="mt-3.5">
        <p className="text-[11px] leading-4 text-foreground-500">販売予定価格</p>
        {hasPrice ? (
          <p className="admin-numeric mt-0.5 text-[22px] font-semibold leading-tight text-foreground-950 md:text-[24px]">
            {formatPrice(product.planned_sale_price)}
          </p>
        ) : (
          <p className="mt-0.5 text-[14px] text-foreground-400">価格未設定</p>
        )}

        {aiPriceHint.show && aiPriceHint.price != null && (
          <p className="mt-1 text-[11px] leading-relaxed text-foreground-500">
            AI価格案{" "}
            <span className="admin-numeric font-medium text-primary-700">
              ¥{aiPriceHint.price.toLocaleString("ja-JP")}
            </span>
          </p>
        )}
      </div>

      {/* 5-6. 商品スペック（未入力の項目は折りたたみ内で確認できる） */}
      <div className="mt-3.5 border-t border-background-200 pt-3.5">
        <CatalogueSpecPanel product={product} cost={cost} title="商品スペック" />
      </div>

      {/* 7. 編集操作 */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={onStartEdit}
          className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-white px-3.5 text-[13px] font-medium text-foreground-700 transition-colors hover:bg-background-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        >
          <i className="ri-edit-line w-4 h-4 flex items-center justify-center"></i>
          商品情報を編集
        </button>
      </div>

      {editMessage &&
        (editMessage.type === "success" || editMessage.type === "warning") && (
          <SaveStatusMessage
            tone={editMessage.type}
            text={editMessage.text}
            className="mt-2.5"
          />
        )}
    </section>
  );
}