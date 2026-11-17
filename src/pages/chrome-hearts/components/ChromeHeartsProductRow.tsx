import { Link } from "react-router-dom";
import ProductThumbnail from "@/pages/products/components/ProductThumbnail";
import { getProductDisplayTitle } from "@/pages/products/lib/productTitle";
import {
  CATEGORY_LABELS,
  INVENTORY_STATUS_LABELS,
  PUBLISH_STATUS_LABELS,
  type AdminProduct,
} from "@/pages/products/types";
import { CHROME_HEARTS_COL } from "./chromeHeartsTableColumns";

interface ChromeHeartsProductRowProps {
  product: AdminProduct;
  /** 商品詳細へ渡す遷移元（検索・絞り込み・並び順・ページを戻したときに復元する） */
  detailLinkState: unknown;
}

function formatPrice(price: number | null | undefined): string {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return "";
  }
  return `¥${price.toLocaleString("ja-JP")}`;
}

/**
 * 仕入価格（商品マスタの手入力値 purchase_price）の表示用フォーマット。
 *
 * - null / undefined / 空文字 / 数値でない → null（呼び出し側で「未設定」と表示）
 * - 0 は「実際の0円」として有効な値なのでそのまま ¥0 と表示する（未設定と区別する）
 */
function formatPurchasePrice(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return `¥${num.toLocaleString("ja-JP")}`;
}

// ブランド名が商品名に含まれているかを判定するための正規化（空白・大文字小文字の差を無視）。
function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

/**
 * Chrome Heartsページの1行。行全体が既存の商品詳細（/products/:id）へのリンク。
 *
 * 表示は「画像 > 商品名 > 商品ID > ブランド > 種別 > 公開状態 > 在庫状態 > 販売価格」に絞る。
 * 元データが無い項目は空欄のままにし、存在しない項目の列は作らない。
 */
export default function ChromeHeartsProductRow({
  product,
  detailLinkState,
}: ChromeHeartsProductRowProps) {
  const name = getProductDisplayTitle(product);
  const brand = (product.brand ?? "").toString().trim();
  const showBrand =
    brand !== "" &&
    !normalizeForCompare(name).includes(normalizeForCompare(brand));
  const categoryLabel = CATEGORY_LABELS[product.category] ?? "";
  const publishLabel = PUBLISH_STATUS_LABELS[product.publish_status] ?? "";
  const inventoryLabel =
    INVENTORY_STATUS_LABELS[product.inventory_status] ?? "";
  const priceText = formatPrice(product.planned_sale_price);
  const purchasePriceText = formatPurchasePrice(product.purchase_price);
  // 売却済みは既存の在庫状態（inventory_status = "sold"）だけで判定する
  // （在庫数0・非公開・アーカイブは売却済み扱いにしない）。
  const isSold = product.inventory_status === "sold";

  return (
    <Link
      to={`/products/${product.product_id}`}
      state={detailLinkState}
      className={`flex cursor-pointer items-center gap-3 border-b border-background-200 px-3 py-2 last:border-b-0 transition-colors hover:bg-background-50 focus:outline-none focus-visible:bg-background-50 ${
        isSold ? "row-sold" : ""
      }`}
    >
      <ProductThumbnail
        src={product.main_image_display_url}
        alt={name}
        size="xs"
      />

      {/* 商品名を主役に、商品ID・ブランド・種別を補助情報としてまとめる */}
      <div className="min-w-0 flex-1">
        <p
          title={name}
          className="truncate text-[13.5px] font-semibold leading-[1.35] text-foreground-950"
        >
          {name}
        </p>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden text-[11.5px] leading-[1.5] text-foreground-500">
          {showBrand && (
            <span className="min-w-0 max-w-[200px] truncate text-foreground-600">
              {brand}
            </span>
          )}
          {/* 種別は狭い画面では商品名の下、広い画面では専用の列に出す */}
          {categoryLabel !== "" && (
            <span className="whitespace-nowrap md:hidden">
              {categoryLabel}
            </span>
          )}
          {/* 仕入価格は狭い画面では商品名の下、広い画面では専用の列に出す */}
          <span className="whitespace-nowrap tabular-nums md:hidden">
            {purchasePriceText !== null
              ? `仕入 ${purchasePriceText}`
              : "仕入 未設定"}
          </span>
          <span className="shrink-0 tabular-nums text-foreground-400">
            {product.product_id}
          </span>
        </div>
      </div>

      <span
        className={`hidden truncate text-right text-[12px] text-foreground-600 md:block ${CHROME_HEARTS_COL.type}`}
      >
        {categoryLabel}
      </span>

      {/* 仕入価格（商品マスタの手入力値）。販売価格と比較しやすいよう右揃え・同じ文字サイズにする */}
      <span
        className={`hidden whitespace-nowrap text-right text-[13.5px] tabular-nums md:block ${CHROME_HEARTS_COL.purchase} ${
          purchasePriceText !== null
            ? "text-foreground-700"
            : "text-[11.5px] text-foreground-300"
        }`}
      >
        {purchasePriceText !== null ? purchasePriceText : "未設定"}
      </span>

      {/* 価格は常に表示。狭い画面では在庫状態を価格の下に置き、重要情報を優先する */}
      <div className={`text-right ${CHROME_HEARTS_COL.price}`}>
        <span
          className={
            priceText !== ""
              ? "text-[13.5px] font-semibold tabular-nums text-foreground-950"
              : "text-[11.5px] text-foreground-300"
          }
        >
          {priceText !== "" ? priceText : "価格未設定"}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-foreground-500 sm:hidden">
          {inventoryLabel}
        </span>
      </div>

      <span
        className={`hidden truncate text-right text-[12px] text-foreground-500 lg:block ${CHROME_HEARTS_COL.publish}`}
      >
        {publishLabel}
      </span>

      <span
        className={`hidden truncate text-right text-[12px] text-foreground-600 sm:block ${CHROME_HEARTS_COL.inventory}`}
      >
        {inventoryLabel}
      </span>
    </Link>
  );
}