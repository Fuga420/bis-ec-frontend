import { useState } from "react";
import type { AdminProductDetail } from "@/pages/products/types";
import {
  buildProductSpecItems,
  isBlankSpecItem,
  type ProductCostSpecInput,
} from "./ProductSpecGrid";
import CatalogueSectionHeading from "./CatalogueSectionHeading";

interface CatalogueSpecPanelProps {
  product: AdminProductDetail;
  cost?: ProductCostSpecInput;
}

/**
 * 型番・サイズ・番号類は等幅（IBM Plex Mono）で組む項目。
 * 数字が並ぶ行だけ字面が揃うことで、図録の「データ欄」らしく見える。
 */
const MONO_VALUE_LABELS = new Set([
  "SKU",
  "サイズ",
  "カラット",
  "重量",
  "発売年",
  "型番",
  "カード番号",
  "鑑定書番号",
  "鑑定番号",
  "認証番号",
  "仕入台帳の商品番号",
  "仕入原価（台帳・概算）",
  "仕入価格（手入力）",
  "仕入価格",
]);

/**
 * 図録体裁の「商品情報」欄。
 * 白カードは使わず、罫線だけの表（左に小さな項目名、右に値）で組む。
 * 項目・表示条件は従来の ProductSpecGrid の組み立てをそのまま使い、
 * 未入力の項目は折りたたんで表示する（表示専用・保存処理は持たない）。
 */
export default function CatalogueSpecPanel({
  product,
  cost,
}: CatalogueSpecPanelProps) {
  const items = buildProductSpecItems(product, cost);
  const filledItems = items.filter((item) => !isBlankSpecItem(item));
  const blankItems = items.filter(isBlankSpecItem);
  const [showBlank, setShowBlank] = useState(false);

  const showCardConditionNote =
    product.category === "pokemon_card" &&
    product.pokemon_card?.grading_status !== "graded" &&
    product.pokemon_card?.card_condition === "A";

  return (
    <section>
      <CatalogueSectionHeading eyebrow="Specification" title="商品情報" />

      {filledItems.length > 0 ? (
        <dl className="mt-4">
          {filledItems.map((item) => {
            const isMono = MONO_VALUE_LABELS.has(item.label);
            return (
              <div
                key={item.label}
                className="flex items-baseline justify-between gap-5 border-b border-[var(--cat-rule-soft)] py-2.5"
              >
                <dt className="w-[104px] shrink-0 text-[10.5px] leading-[1.6] tracking-[0.16em] text-[var(--cat-ink-soft)]">
                  {item.label}
                </dt>
                <dd className="min-w-0 flex-1 text-right">
                  <span
                    className={`break-words text-[13px] leading-[1.7] ${
                      item.tone === "error"
                        ? "text-amber-700"
                        : item.emphasize
                          ? "font-semibold text-[var(--cat-ink)]"
                          : "text-[var(--cat-ink)]"
                    } ${isMono ? "cat-mono" : ""}`}
                  >
                    {item.value}
                  </span>
                  {item.note && (
                    <span
                      className={`mt-1 block text-[10.5px] leading-[1.6] ${
                        item.tone === "error"
                          ? "text-amber-700"
                          : "text-[var(--cat-ink-soft)]"
                      }`}
                    >
                      {item.note}
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="mt-4 border-b border-[var(--cat-rule-soft)] pb-3 text-[12px] leading-relaxed text-[var(--cat-ink-soft)]">
          入力済みの項目はまだありません。「商品情報を編集」から入力できます。
        </p>
      )}

      {showCardConditionNote && (
        <p className="mt-3 text-[10.5px] leading-[1.8] text-[var(--cat-ink-soft)]">
          ※ AはAI生成直後の初期値です（現物確認前）。現物を確認のうえ、必要に応じて「商品情報を編集」からB/Cへ修正してください。
        </p>
      )}

      {blankItems.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowBlank((prev) => !prev)}
            aria-expanded={showBlank}
            className="flex cursor-pointer items-center gap-1 whitespace-nowrap py-1 text-[10.5px] tracking-[0.12em] text-[var(--cat-ink-soft)] transition-colors hover:text-[var(--cat-ink)]"
          >
            <i
              className={`${
                showBlank ? "ri-subtract-line" : "ri-add-line"
              } w-3 h-3 flex items-center justify-center text-[11px]`}
            ></i>
            未入力の項目（{blankItems.length}）
          </button>

          {showBlank && (
            <dl className="tab-fade mt-2 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">
              {blankItems.map((item) => (
                <div key={item.label} className="min-w-0">
                  <dt className="truncate text-[10px] tracking-[0.1em] text-[var(--cat-ink-soft)]">
                    {item.label}
                  </dt>
                  <dd className="mt-0.5 text-[11.5px] leading-4 text-[var(--cat-ink-soft)]">
                    {item.emptyText && item.emptyText !== "—"
                      ? item.emptyText
                      : "未入力"}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </section>
  );
}