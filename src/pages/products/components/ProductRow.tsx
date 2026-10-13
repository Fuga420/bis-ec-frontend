import { Link } from "react-router-dom";
import ProductThumbnail from "./ProductThumbnail";
import type { AdminProduct } from "../types";
import { CATEGORY_LABELS, PUBLISH_STATUS_LABELS, INVENTORY_STATUS_LABELS, RECORD_STATUS_LABELS, SQUARE_LINK_LABELS } from "../types";

interface ProductRowProps {
  product: AdminProduct;
  isSelected: boolean;
  onToggleSelect: (productId: string) => void;
  selectDisabled: boolean;
}

// 全ステータスバッジ共通の見た目（角丸6px・高さ22px・11px/500・余白を圧縮して統一）
const badgeBase =
  "inline-flex h-[22px] max-w-full items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium leading-none";

const statusStyles: Record<string, string> = {
  draft: "bg-background-100 text-foreground-600",
  published: "bg-primary-100 text-primary-500",
  hidden: "bg-background-100 text-foreground-600",
};

const inventoryStyles: Record<string, string> = {
  in_stock: "bg-primary-100 text-primary-500",
  reserved: "bg-amber-100 text-amber-800",
  sold: "bg-red-100 text-red-800",
};

function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ProductRow({
  product,
  isSelected,
  onToggleSelect,
  selectDisabled,
}: ProductRowProps) {
  const categoryLabel =
    CATEGORY_LABELS[product.category] ?? (product.category || "—");
  const statusLabel =
    PUBLISH_STATUS_LABELS[product.publish_status] ??
    (product.publish_status || "—");
  const statusClass =
    statusStyles[product.publish_status] ?? "bg-foreground-100 text-foreground-600";
  const inventoryLabel =
    INVENTORY_STATUS_LABELS[product.inventory_status] ??
    (product.inventory_status || "—");
  const inventoryClass =
    inventoryStyles[product.inventory_status] ??
    "bg-foreground-100 text-foreground-600";
  const priceText =
    product.planned_sale_price && product.planned_sale_price > 0
      ? `¥${product.planned_sale_price.toLocaleString("ja-JP")}`
      : "価格未設定";
  const name = product.product_name || "（商品名なし）";

  const statusBadge = (
    <span className={`${badgeBase} ${statusClass}`}>{statusLabel}</span>
  );

  const inventoryBadge = (
    <span className={`${badgeBase} ${inventoryClass}`}>{inventoryLabel}</span>
  );

  const recordStatusLabel =
    RECORD_STATUS_LABELS[product.record_status] ??
    (product.record_status || "—");
  const recordStatusBadge =
    product.record_status === "archived" ? (
      <span className={`${badgeBase} bg-background-100 text-foreground-600`}>
        {recordStatusLabel}
      </span>
    ) : null;

  // Square連携の有無（Variation/Item ID のどちらかが入っていれば連携済みとみなす）
  const isSquareLinked = Boolean(
    (product.square_variation_id || product.square_item_id || "")
      .toString()
      .trim()
  );
  const squareBadge = (
    <span
      className={`${badgeBase} ${
        isSquareLinked
          ? "bg-primary-100 text-primary-500"
          : "bg-amber-100 text-amber-800"
      }`}
    >
      <i
        className={`${
          isSquareLinked ? "ri-link" : "ri-link-unlink"
        } w-3 h-3 flex items-center justify-center text-xs`}
      ></i>
      {isSquareLinked
        ? SQUARE_LINK_LABELS.linked
        : SQUARE_LINK_LABELS.unlinked}
    </span>
  );

  return (
    // 選択中はごく薄いグリーン系の背景を保持し、ホバー時はその選択色を一段濃くして
    // 「選択中の背景」と「ホバー」が競合しないようにする（未選択はホバーで薄いニュートラルグレー）。
    <div
      className={`group/row flex items-stretch border-b border-background-200 transition-colors duration-150 last:border-b-0 ${
        isSelected
          ? "bg-primary-100/60 hover:bg-primary-100"
          : "hover:bg-background-100"
      }`}
    >
      {/* チェックボックスは Link の外に配置し、操作時に詳細へ遷移しないようにする */}
      <div className="flex w-10 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={isSelected}
          disabled={selectDisabled}
          onChange={() => onToggleSelect(product.product_id)}
          aria-label={`${name} を選択`}
          className="h-4 w-4 cursor-pointer accent-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <Link
        to={`/products/${product.product_id}`}
        className="block min-w-0 flex-1 cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
      >
        {/* デスクトップ（一覧表） */}
        <div className="hidden items-center gap-4 px-4 py-2.5 lg:flex lg:min-h-[80px]">
          <ProductThumbnail
            src={product.main_image_display_url}
            alt={name}
          />
          <span className="w-[96px] shrink-0 truncate text-xs font-normal tabular-nums text-foreground-500">
            {product.product_id}
          </span>
          <div className="min-w-0 flex-1">
            {/* 商品名は最大2行まで表示し、長い場合は末尾を省略する */}
            <p className="line-clamp-2 text-sm font-semibold leading-normal text-foreground-950 group-hover/row:text-primary-600">
              {name}
            </p>
            {/* 商品名の下（余白2px）にSquare連携ラベルを縦配置。セル幅を超えないようにする */}
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
              {squareBadge}
              {recordStatusBadge}
              <p className="min-w-0 truncate text-xs text-foreground-500">
                {product.brand || "—"}
              </p>
            </div>
          </div>
          <span className="w-[88px] shrink-0 truncate text-xs text-foreground-500">
            {categoryLabel}
          </span>
          <span className="w-[100px] shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-foreground-950">
            {priceText}
          </span>
          <span className="w-20 shrink-0 truncate text-xs text-foreground-500">
            {product.condition || "—"}
          </span>
          <span className="flex w-[84px] shrink-0 overflow-hidden">
            {statusBadge}
          </span>
          <span className="flex w-[84px] shrink-0 overflow-hidden">
            {inventoryBadge}
          </span>
          <span className="w-[110px] shrink-0 whitespace-nowrap text-xs text-foreground-500">
            {formatDate(product.created_at)}
          </span>
          <i className="ri-arrow-right-s-line w-5 shrink-0 text-lg text-foreground-300 transition-colors duration-150 group-hover/row:text-foreground-600"></i>
        </div>

        {/* モバイル */}
        <div className="flex items-center gap-3 px-4 py-3 lg:hidden">
          <ProductThumbnail
            src={product.main_image_display_url}
            alt={name}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-normal text-foreground-950">
              {name}
            </p>
            <p className="mt-0.5 truncate text-xs text-foreground-500">
              {product.brand || "—"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-xs font-normal tabular-nums text-foreground-500">
                {product.product_id}
              </span>
              {statusBadge}
              {inventoryBadge}
              {squareBadge}
              {recordStatusBadge}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground-950">
              {priceText}
            </p>
            <p className="mt-0.5 text-xs text-foreground-500">{categoryLabel}</p>
          </div>
        </div>
      </Link>
    </div>
  );
}