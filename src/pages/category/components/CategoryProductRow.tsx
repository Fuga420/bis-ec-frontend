import { Link } from "react-router-dom";
import ProductThumbnail from "@/pages/products/components/ProductThumbnail";
import { getProductDisplayTitle } from "@/pages/products/lib/productTitle";
import {
  INVENTORY_STATUS_LABELS,
  PUBLISH_STATUS_LABELS,
  type AdminProduct,
} from "@/pages/products/types";

interface CategoryProductRowProps {
  product: AdminProduct;
}

/**
 * カテゴリ別一覧の1行。行全体が商品詳細へのリンク。
 * 表示は「画像・商品名・ブランド/商品ID・状態・販売予定価格」に絞る。
 */
export default function CategoryProductRow({
  product,
}: CategoryProductRowProps) {
  const name = getProductDisplayTitle(product);
  const brand = (product.brand ?? "").toString().trim();
  const hasPrice = Boolean(
    product.planned_sale_price && product.planned_sale_price > 0
  );
  const priceText = hasPrice
    ? `¥${product.planned_sale_price!.toLocaleString("ja-JP")}`
    : "—";

  // 状態は公開状態・在庫状態を短い1行にまとめる（未設定値は表示しない）。
  const statusText = [
    PUBLISH_STATUS_LABELS[product.publish_status],
    INVENTORY_STATUS_LABELS[product.inventory_status],
  ]
    .filter((label): label is string => Boolean(label))
    .join(" / ");

  return (
    <Link
      to={`/products/${product.product_id}`}
      className="flex cursor-pointer items-center gap-3.5 border-b border-background-200 px-4 py-3 last:border-b-0 transition-colors hover:bg-background-50 focus:outline-none focus-visible:bg-background-50"
    >
      <ProductThumbnail src={product.main_image_display_url} alt={name} size="lg" />

      <div className="min-w-0 flex-1">
        <p
          title={name}
          className="truncate text-[14px] font-semibold leading-[1.4] text-foreground-950"
        >
          {name}
        </p>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] leading-[1.5] text-foreground-500">
          {brand !== "" && (
            <span className="max-w-[180px] truncate text-foreground-600">
              {brand}
            </span>
          )}
          <span className="tabular-nums">{product.product_id}</span>
        </div>
      </div>

      {statusText !== "" && (
        <span className="hidden w-32 shrink-0 truncate text-right text-[12px] text-foreground-500 sm:block">
          {statusText}
        </span>
      )}

      <span
        className={`w-28 shrink-0 whitespace-nowrap text-right tabular-nums ${
          hasPrice
            ? "text-[15px] font-semibold text-foreground-950"
            : "text-[13px] text-foreground-400"
        }`}
      >
        {priceText}
      </span>
    </Link>
  );
}