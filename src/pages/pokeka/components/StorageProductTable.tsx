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
  parseStoragePosition,
  resolveReferencePrice,
  type PokecaLightInfoMap,
} from "@/pages/pokeka/lib/rawStorage";

// 列幅は「商品情報（可変）」以外を固定し、長い商品名でも隣の列に重ならないようにする。
// 狭い画面では参考価格・保管場所を段階的に畳み、横スクロールを出さない。
const COL_PRICE = "hidden w-[96px] shrink-0 text-right sm:block";
const COL_STORAGE = "hidden w-[108px] shrink-0 lg:block";
const COL_STATUS = "w-[104px] shrink-0";
const HEAD_TEXT = "text-[11px] font-medium text-foreground-500";

const EMPTY = "—";

interface StorageProductTableProps {
  products: AdminProduct[];
  infoMap: PokecaLightInfoMap;
  selectedIds: Set<string>;
  allSelected: boolean;
  partlySelected: boolean;
  disabled?: boolean;
  /** 商品詳細へ渡す遷移元（パンくずと戻り先の復元に使う） */
  detailLinkState?: unknown;
  onToggle: (productId: string) => void;
  onToggleAll: () => void;
  selectAllRef: RefObject<HTMLInputElement | null>;
}

function formatPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return value.toLocaleString("ja-JP");
}

/**
 * ストレージ（旧裏）タブの一覧。
 * 行クリックで既存の商品詳細（/products/:id）へ移動する。
 *
 * 情報は「商品情報 / 参考価格 / 保管場所 / 状態」の4列に整理し、
 * カード番号・作家は商品情報セルの中に補助情報としてまとめる。
 * 値が無い項目は空欄のままにし、記号を並べない（データ自体は変更しない）。
 */
export default function StorageProductTable({
  products,
  infoMap,
  selectedIds,
  allSelected,
  partlySelected,
  disabled = false,
  detailLinkState,
  onToggle,
  onToggleAll,
  selectAllRef,
}: StorageProductTableProps) {
  return (
    <div className="ui-card w-full overflow-hidden rounded-lg">
      <div className="product-table-head hidden items-center border-b border-background-200 bg-white py-2.5 lg:flex">
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
          <span className="min-w-0 flex-1 pl-[68px] text-xs font-medium text-foreground-500">
            商品情報
          </span>
          <span className={`${COL_PRICE} ${HEAD_TEXT}`}>参考価格</span>
          <span className={`${COL_STORAGE} ${HEAD_TEXT}`}>保管場所</span>
          <span className={`${COL_STATUS} ${HEAD_TEXT}`}>状態</span>
        </div>
      </div>

      {products.map((product) => {
        const selected = selectedIds.has(product.product_id);
        const info = infoMap.get(product.product_id);
        const cardNumber = info?.cardNumber?.trim() ?? "";
        const author = info?.illustrator?.trim() ?? "";
        const price = formatPrice(resolveReferencePrice(product, info));
        const publishLabel =
          PUBLISH_STATUS_LABELS[product.publish_status] ??
          product.publish_status ??
          "";
        const inventoryLabel =
          INVENTORY_STATUS_LABELS[product.inventory_status] ??
          product.inventory_status ??
          "";
        const isPublished = product.publish_status === "published";
        const { box, branch } = parseStoragePosition(product.storage_location);

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
              state={detailLinkState}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-background-50"
            >
              <span className="w-14 shrink-0">
                <ProductThumbnail
                  src={product.main_image_display_url}
                  alt={`${product.product_name || "商品"}のサムネイル`}
                  size="sm"
                />
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-[13px] font-medium leading-snug text-foreground-950 sm:text-sm"
                  title={product.product_name || undefined}
                >
                  {product.product_name || "（商品名なし）"}
                </span>
                <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] leading-none">
                  <span className="admin-numeric shrink-0 text-foreground-400">
                    {product.product_id}
                  </span>
                  {cardNumber && (
                    <>
                      <span
                        className="shrink-0 text-foreground-300"
                        aria-hidden="true"
                      >
                        ·
                      </span>
                      <span className="admin-numeric shrink-0 text-foreground-600">
                        {cardNumber}
                      </span>
                    </>
                  )}
                  {author && (
                    <>
                      <span
                        className="shrink-0 text-foreground-300"
                        aria-hidden="true"
                      >
                        ·
                      </span>
                      <span
                        className="min-w-0 truncate text-foreground-600"
                        title={author}
                      >
                        {author}
                      </span>
                    </>
                  )}
                </span>
              </span>

              <span className={`${COL_PRICE} admin-numeric`}>
                {price ? (
                  <span className="text-[12px] font-medium tabular-nums text-foreground-900">
                    {price}
                  </span>
                ) : (
                  <span className="text-[12px] text-foreground-300">{EMPTY}</span>
                )}
              </span>

              <span className={`${COL_STORAGE} min-w-0`}>
                {box ? (
                  <span
                    className="admin-numeric flex items-baseline gap-1 truncate text-[12px] tabular-nums"
                    title={`箱番 ${box}${branch ? ` / 枝番 ${branch}` : ""}`}
                  >
                    <span className="font-medium text-foreground-800">{box}</span>
                    {branch && (
                      <>
                        <span
                          className="text-[11px] text-foreground-300"
                          aria-hidden="true"
                        >
                          /
                        </span>
                        <span className="text-foreground-500">{branch}</span>
                      </>
                    )}
                  </span>
                ) : (
                  <span className="text-[12px] text-foreground-300">
                    {formatStoragePosition(product.storage_location)}
                  </span>
                )}
              </span>

              {/* 公開状態と在庫状態は別の意味を持つため、判定・データは統合せず
                  中黒で並べるだけにする（通常状態は強調しない）。 */}
              <span
                className={`${COL_STATUS} flex items-center gap-1.5 whitespace-nowrap text-[11px] leading-none`}
              >
                {publishLabel && (
                  <span
                    className={
                      isPublished
                        ? "text-foreground-600"
                        : "text-foreground-400"
                    }
                  >
                    {publishLabel}
                  </span>
                )}
                {publishLabel && inventoryLabel && (
                  <span className="text-foreground-300" aria-hidden="true">
                    ·
                  </span>
                )}
                {inventoryLabel && (
                  <span className="text-foreground-500">{inventoryLabel}</span>
                )}
              </span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}