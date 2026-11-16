import type { RefObject } from "react";
import { Link } from "react-router-dom";
import ProductThumbnail from "@/pages/products/components/ProductThumbnail";
import {
  INVENTORY_STATUS_LABELS,
  PUBLISH_STATUS_LABELS,
  type AdminProduct,
} from "@/pages/products/types";
import {
  formatStoragePosition,
  type PokecaLightInfoMap,
} from "@/pages/pokeka/lib/rawStorage";

// 列幅は「商品名（可変）」以外を固定し、長い商品名でも隣の列に重ならないようにする。
// 狭い画面ではカード名・作家・参考価格・保管場所を段階的に畳み、横スクロールを出さない。
const COL_CARD = "hidden w-[176px] shrink-0 lg:block";
const COL_AUTHOR = "hidden w-[104px] shrink-0 xl:block";
const COL_PRICE = "hidden w-[92px] shrink-0 text-right md:block";
const COL_STORAGE = "hidden w-[112px] shrink-0 lg:block";
const COL_STATUS = "w-[96px] shrink-0";
const HEAD_TEXT = "text-xs font-medium text-foreground-500";

interface StorageProductTableProps {
  products: AdminProduct[];
  infoMap: PokecaLightInfoMap;
  selectedIds: Set<string>;
  allSelected: boolean;
  partlySelected: boolean;
  disabled?: boolean;
  onToggle: (productId: string) => void;
  onToggleAll: () => void;
  selectAllRef: RefObject<HTMLInputElement | null>;
}

const EMPTY = "—";

function formatPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return value.toLocaleString("ja-JP");
}

/**
 * ストレージ（旧裏）タブの一覧。
 * 行クリックで既存の商品詳細（/products/:id）へ移動する。
 * カード名・番号・作家・参考価格は、ライト版AIのステータスに商品別情報がある場合のみ表示する。
 */
export default function StorageProductTable({
  products,
  infoMap,
  selectedIds,
  allSelected,
  partlySelected,
  disabled = false,
  onToggle,
  onToggleAll,
  selectAllRef,
}: StorageProductTableProps) {
  return (
    <div className="ui-card w-full overflow-hidden rounded-lg">
      <div className="product-table-head hidden border-b border-background-200 bg-white py-2 lg:flex lg:items-center">
        <div className="flex w-10 shrink-0 items-center justify-center">
          <label className="product-checkbox">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              disabled={disabled || products.length === 0}
              onChange={onToggleAll}
              aria-label="表示中をすべて選択"
            />
            <span className="product-checkbox-box" aria-hidden="true">
              <i
                className={
                  partlySelected ? "ri-subtract-line" : "ri-check-line"
                }
              ></i>
            </span>
          </label>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
          <span className="w-10 shrink-0 text-xs font-medium text-foreground-500">
            画像
          </span>
          <span className="min-w-0 flex-1 text-xs font-medium text-foreground-500">
            商品名 / 商品ID
          </span>
          <span className={`${COL_CARD} ${HEAD_TEXT}`}>カード名・番号</span>
          <span className={`${COL_AUTHOR} ${HEAD_TEXT}`}>作家</span>
          <span className={`${COL_PRICE} ${HEAD_TEXT}`}>参考価格</span>
          <span className={`${COL_STORAGE} ${HEAD_TEXT}`}>保管場所</span>
          <span className={`${COL_STATUS} ${HEAD_TEXT}`}>状態</span>
        </div>
      </div>

      {products.map((product) => {
        const selected = selectedIds.has(product.product_id);
        const info = infoMap.get(product.product_id);
        const cardName = info?.cardName ?? "";
        const cardNumber = info?.cardNumber ?? "";
        const author = info?.illustrator ?? "";
        const price = formatPrice(info?.candidatePrice ?? null);
        const publishLabel =
          PUBLISH_STATUS_LABELS[product.publish_status] ??
          product.publish_status ??
          EMPTY;
        const inventoryLabel =
          INVENTORY_STATUS_LABELS[product.inventory_status] ??
          product.inventory_status ??
          EMPTY;
        const isPublished = product.publish_status === "published";

        return (
          <div
            key={product.product_id}
            className={`product-row flex items-center border-b border-background-200 last:border-b-0 ${
              selected ? "is-selected" : ""
            }`}
          >
            <div className="flex w-10 shrink-0 items-center justify-center self-stretch">
              <label className="product-checkbox">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onToggle(product.product_id)}
                  aria-label={`${product.product_name || product.product_id} を選択`}
                />
                <span className="product-checkbox-box" aria-hidden="true">
                  <i className="ri-check-line"></i>
                </span>
              </label>
            </div>

            <Link
              to={`/products/${product.product_id}`}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-background-50"
            >
              <span className="w-10 shrink-0">
                <ProductThumbnail
                  src={product.main_image_display_url}
                  alt={`${product.product_name || "商品"}のサムネイル`}
                  size="sm"
                />
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-sm font-medium leading-snug text-foreground-950"
                  title={product.product_name || undefined}
                >
                  {product.product_name || "（商品名なし）"}
                </span>
                <span className="admin-numeric mt-0.5 block truncate text-[11px] leading-none text-foreground-400">
                  {product.product_id}
                </span>
              </span>

              <span className={`${COL_CARD} min-w-0`}>
                {cardName || cardNumber ? (
                  <span className="block min-w-0">
                    {cardName && (
                      <span
                        className="block truncate text-[12px] leading-snug text-foreground-800"
                        title={cardName}
                      >
                        {cardName}
                      </span>
                    )}
                    <span className="admin-numeric block truncate text-[11px] leading-snug text-foreground-400">
                      {cardNumber || EMPTY}
                    </span>
                  </span>
                ) : (
                  <span className="text-[12px] text-foreground-300">{EMPTY}</span>
                )}
              </span>

              <span className={`${COL_AUTHOR} min-w-0`}>
                {author ? (
                  <span
                    className="block truncate text-[12px] text-foreground-700"
                    title={author}
                  >
                    {author}
                  </span>
                ) : (
                  <span className="text-[12px] text-foreground-300">{EMPTY}</span>
                )}
              </span>

              <span className={`${COL_PRICE} admin-numeric`}>
                {price ? (
                  <span className="text-[12px] font-medium text-foreground-900">
                    {price}
                  </span>
                ) : (
                  <span className="text-[12px] text-foreground-300">{EMPTY}</span>
                )}
              </span>

              <span className={`${COL_STORAGE} min-w-0`}>
                <span
                  className="admin-numeric block truncate text-[12px] text-foreground-600"
                  title={formatStoragePosition(product.storage_location)}
                >
                  {formatStoragePosition(product.storage_location)}
                </span>
              </span>

              <span
                className={`${COL_STATUS} flex items-center gap-1 whitespace-nowrap text-[11px] leading-none`}
              >
                <span
                  className={
                    isPublished
                      ? "font-medium text-primary-700"
                      : "text-foreground-400"
                  }
                >
                  {publishLabel}
                </span>
                <span className="text-foreground-300" aria-hidden="true">
                  /
                </span>
                <span className="text-foreground-600">{inventoryLabel}</span>
              </span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}