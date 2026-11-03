import type { AdminProductDetail } from "@/pages/products/types";
import { RECORD_STATUS_LABELS } from "@/pages/products/types";
import SaveStatusMessage from "@/components/base/SaveStatusMessage";
import { formatPrice } from "../lib/format";

interface CatalogueLotHeaderProps {
  product: AdminProductDetail;
  categoryLabel: string;
  statusLabel: string;
  inventoryLabel: string;
  // AIの価格案（販売予定価格が未設定のときだけ表示する）
  aiPriceHint: { show: boolean; price: number | null };
  editMessage: { type: "success" | "error" | "warning"; text: string } | null;
  onStartEdit: () => void;
}

type RowTone = "green" | "warn" | "neutral";

/**
 * 商品ID（例: TMP-000163）から図録のロット番号を作る。
 * 末尾の数字だけを使い、先頭のゼロは落とす（000163 → 163）。
 * 数字が取れない場合は商品IDをそのまま出す。
 */
function readLotNumber(productId: string): string {
  if (!productId) return "—";
  const matched = productId.match(/(\d+)\s*$/);
  if (!matched) return productId;
  return matched[1].replace(/^0+(?=\d)/, "");
}

function StatusRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: RowTone;
}) {
  const dotClass =
    tone === "green"
      ? "bg-[var(--cat-green)]"
      : tone === "warn"
        ? "bg-amber-600"
        : "bg-[var(--cat-rule)]";
  const valueClass =
    tone === "green"
      ? "text-[var(--cat-green)]"
      : tone === "warn"
        ? "text-amber-700"
        : "text-[var(--cat-ink)]";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="cat-mono shrink-0 text-[10px] tracking-[0.16em] text-[var(--cat-ink-soft)]">
        {label}
      </dt>
      <dd
        className={`flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[12px] leading-5 ${valueClass}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
        {value}
      </dd>
    </div>
  );
}

/**
 * 商品詳細の見出し（図録の本票）。
 * 左に LOT 番号・ブランド・英字タイトル・日本語商品名・台帳/管理番号、
 * 右の細いサイド欄（左罫線）に価格・公開・在庫・レコード状態と編集導線をまとめる。
 * 表示専用で、保存や取得の処理は持たない（操作は既存のハンドラを呼ぶだけ）。
 */
export default function CatalogueLotHeader({
  product,
  categoryLabel,
  statusLabel,
  inventoryLabel,
  aiPriceHint,
  editMessage,
  onStartEdit,
}: CatalogueLotHeaderProps) {
  const englishTitle = (product.translation?.translated_title ?? "").trim();
  const japaneseTitle = (product.product_name ?? "").trim();
  const brand = (product.brand ?? "").trim();
  const auctionNumber = (product.auction_item_number ?? "").trim();
  const lotNumber = readLotNumber(product.product_id ?? "");

  const hasPrice = Boolean(
    product.planned_sale_price && product.planned_sale_price > 0
  );
  const isPublished = product.publish_status === "published";
  const isArchived = product.record_status === "archived";
  const recordLabel =
    RECORD_STATUS_LABELS[product.record_status] ??
    (product.record_status || "—");

  const mainTitle = englishTitle || japaneseTitle || "商品名未入力";

  return (
    <section className="border-b border-[var(--cat-rule)] pb-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        {/* 左: 本票の見出し */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <span className="cat-mono shrink-0 text-[11px] tracking-[0.3em] text-[var(--cat-ink-soft)]">
              LOT
            </span>
            <span className="cat-display text-[46px] leading-[0.9] tracking-[0.01em] text-[var(--cat-ink)] md:text-[58px]">
              {lotNumber}
            </span>
          </div>

          {brand && (
            <p className="cat-mono mt-4 text-[10px] uppercase leading-none tracking-[0.32em] text-[var(--cat-ink-soft)]">
              {brand}
            </p>
          )}

          <h1
            className={`mt-3 break-words leading-[1.1] text-[var(--cat-ink)] ${
              englishTitle
                ? "cat-display text-[30px] md:text-[38px]"
                : "cat-serif text-[22px] md:text-[26px]"
            }`}
          >
            {mainTitle}
          </h1>

          {englishTitle && japaneseTitle && (
            <p className="cat-serif mt-2.5 break-words text-[14px] leading-relaxed text-[var(--cat-ink-soft)] md:text-[15px]">
              {japaneseTitle}
            </p>
          )}

          <div className="cat-mono mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] leading-5 tracking-[0.12em] text-[var(--cat-ink-soft)]">
            {auctionNumber && (
              <span className="whitespace-nowrap">
                仕入台帳NO.{" "}
                <span className="text-[var(--cat-ink)]">{auctionNumber}</span>
              </span>
            )}
            <span className="whitespace-nowrap">
              管理NO.{" "}
              <span className="text-[var(--cat-ink)]">{product.product_id}</span>
            </span>
            <span className="whitespace-nowrap">分類 {categoryLabel}</span>
          </div>
        </div>

        {/* 右: 価格・状態のサイド欄（左罫線） */}
        <aside className="w-full shrink-0 border-t border-[var(--cat-rule)] pt-5 lg:w-[268px] lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
          <p className="cat-mono text-[9px] uppercase tracking-[0.26em] text-[var(--cat-ink-soft)]">
            Estimated Price
          </p>
          <p
            className={`cat-mono mt-2 leading-none ${
              hasPrice
                ? "text-[24px] text-[var(--cat-ink)]"
                : "text-[16px] text-[var(--cat-ink-soft)]"
            }`}
          >
            {formatPrice(product.planned_sale_price)}
          </p>

          {aiPriceHint.show && aiPriceHint.price != null && (
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--cat-ink-soft)]">
              AI価格案{" "}
              <span className="cat-mono text-[var(--cat-green)]">
                ¥{aiPriceHint.price.toLocaleString("ja-JP")}
              </span>
            </p>
          )}

          <dl className="mt-5 flex flex-col gap-2.5 border-t border-[var(--cat-rule)] pt-4">
            <StatusRow
              label="公開"
              value={statusLabel}
              tone={isPublished ? "green" : "neutral"}
            />
            <StatusRow label="在庫" value={inventoryLabel} />
            <StatusRow
              label="レコード"
              value={recordLabel}
              tone={isArchived ? "warn" : "neutral"}
            />
          </dl>

          <button
            type="button"
            onClick={onStartEdit}
            className="mt-5 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border border-[var(--cat-ink)] px-4 py-2.5 text-[12px] tracking-[0.08em] text-[var(--cat-ink)] transition-colors hover:bg-[var(--cat-ink)] hover:text-[var(--cat-paper)]"
          >
            <i className="ri-edit-line w-3.5 h-3.5 flex items-center justify-center"></i>
            商品情報を編集
          </button>

          {editMessage &&
            (editMessage.type === "success" ||
              editMessage.type === "warning") && (
              <SaveStatusMessage
                tone={editMessage.type}
                text={editMessage.text}
                className="mt-3"
              />
            )}
        </aside>
      </div>
    </section>
  );
}