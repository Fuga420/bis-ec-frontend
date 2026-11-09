import type { AdminProductDetail } from "@/pages/products/types";
import SaveStatusMessage from "@/components/base/SaveStatusMessage";
import { formatPrice } from "../lib/format";

interface ProductSummaryHeaderProps {
  product: AdminProductDetail;
  categoryLabel: string;
  statusLabel: string;
  inventoryLabel: string;
  // AIの価格案（販売予定価格が未設定のときだけ表示する）
  aiPriceHint: { show: boolean; price: number | null };
  editMessage: { type: "success" | "error" | "warning"; text: string } | null;
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
 * 商品詳細の見出し（商品一覧と統一した業務管理UI）。
 * 上段に状態バッジ・商品名・商品ID・カテゴリ・ブランド・台帳番号をコンパクトに整理し、
 * 右側に販売予定価格と「商品情報を編集」を置く。
 * 表示専用で、保存や取得の処理は持たない（操作は既存のハンドラを呼ぶだけ）。
 */
export default function ProductSummaryHeader({
  product,
  categoryLabel,
  statusLabel,
  inventoryLabel,
  aiPriceHint,
  editMessage,
  onStartEdit,
}: ProductSummaryHeaderProps) {
  const englishTitle = (product.translation?.translated_title ?? "").trim();
  const japaneseTitle = (product.product_name ?? "").trim();
  const brand = (product.brand ?? "").trim();
  const auctionNumber = (product.auction_item_number ?? "").trim();

  const hasPrice = Boolean(
    product.planned_sale_price && product.planned_sale_price > 0
  );
  const isArchived = product.record_status === "archived";

  return (
    <section className="rounded-lg border border-background-200 bg-white p-3.5 md:p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-5">
        {/* 左: 商品の基本情報 */}
        <div className="min-w-0 flex-1">
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

          <h2 className="mt-2 break-words text-[20px] font-semibold leading-snug text-foreground-950 md:text-[22px]">
            {japaneseTitle || "商品名未入力"}
          </h2>

          {englishTitle && (
            <p className="mt-0.5 break-words text-[12px] leading-relaxed text-foreground-500">
              {englishTitle}
            </p>
          )}

          <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-foreground-500">
            <div className="flex items-center gap-1.5">
              <dt>商品ID</dt>
              <dd className="admin-numeric font-medium text-foreground-800">
                {product.product_id}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt>カテゴリ</dt>
              <dd className="font-medium text-foreground-800">{categoryLabel}</dd>
            </div>
            {brand && (
              <div className="flex min-w-0 items-center gap-1.5">
                <dt className="shrink-0">ブランド</dt>
                <dd className="min-w-0 break-words font-medium text-foreground-800">
                  {brand}
                </dd>
              </div>
            )}
            {auctionNumber && (
              <div className="flex items-center gap-1.5">
                <dt>仕入台帳NO.</dt>
                <dd className="admin-numeric font-medium text-foreground-800">
                  {auctionNumber}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* 右: 価格と編集導線 */}
        <div className="w-full shrink-0 border-t border-background-200 pt-3 lg:w-[208px] lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <p className="text-[11px] text-foreground-500">販売予定価格</p>
          {hasPrice ? (
            <p className="admin-numeric mt-0.5 text-[19px] font-semibold leading-tight text-foreground-950">
              {formatPrice(product.planned_sale_price)}
            </p>
          ) : (
            <p className="mt-0.5 text-[13px] text-foreground-400">価格未設定</p>
          )}

          {aiPriceHint.show && aiPriceHint.price != null && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-foreground-500">
              AI価格案{" "}
              <span className="admin-numeric font-medium text-primary-700">
                ¥{aiPriceHint.price.toLocaleString("ja-JP")}
              </span>
            </p>
          )}

          <button
            type="button"
            onClick={onStartEdit}
            className="mt-2.5 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary-500 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-600"
          >
            <i className="ri-edit-line w-4 h-4 flex items-center justify-center"></i>
            商品情報を編集
          </button>

          {editMessage &&
            (editMessage.type === "success" ||
              editMessage.type === "warning") && (
              <SaveStatusMessage
                tone={editMessage.type}
                text={editMessage.text}
                className="mt-2.5"
              />
            )}
        </div>
      </div>
    </section>
  );
}