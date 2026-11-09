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
  // 見出し（上部の商品情報パネルでは「商品スペック」として使う）
  title?: string;
}

/**
 * 型番・サイズ・番号類は数字を等幅（tabular）で組む項目。
 * 数字が縦に揃うことで、表として読み取りやすくする。
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
 * 商品詳細の「商品情報」欄。
 * 1項目1行ではなく、ラベル（小）＋値（本文）を2〜3カラムのグリッドに並べ、
 * 縦の高さを抑えつつ一覧性を保つ。
 * 項目・表示条件は従来の ProductSpecGrid の組み立てをそのまま使い、
 * 未入力の項目は折りたたんで表示する（表示専用・保存処理は持たない）。
 */
export default function CatalogueSpecPanel({
  product,
  cost,
  title = "商品情報",
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
      <CatalogueSectionHeading title={title} />

      {filledItems.length > 0 ? (
        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
          {filledItems.map((item) => {
            const isMono = MONO_VALUE_LABELS.has(item.label);
            return (
              <div key={item.label} className="min-w-0">
                <dt className="break-words text-[11px] leading-4 text-foreground-500">
                  {item.label}
                </dt>
                <dd className="mt-0.5 min-w-0">
                  <span
                    className={`break-words text-[13px] leading-[1.55] ${
                      item.tone === "error"
                        ? "font-medium text-amber-700"
                        : item.emphasize
                          ? "font-semibold text-foreground-950"
                          : "font-medium text-foreground-900"
                    } ${isMono ? "admin-numeric" : ""}`}
                  >
                    {item.value}
                  </span>
                  {item.note && (
                    <span
                      className={`mt-0.5 block break-words text-[10.5px] leading-4 ${
                        item.tone === "error"
                          ? "text-amber-700"
                          : "text-foreground-400"
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
        <p className="mt-2.5 rounded-md bg-background-50 px-3 py-2.5 text-[12px] leading-relaxed text-foreground-500">
          入力済みの項目はまだありません。「商品情報を編集」から入力できます。
        </p>
      )}

      {showCardConditionNote && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-foreground-500">
          ※ AはAI生成直後の初期値です（現物確認前）。現物を確認のうえ、必要に応じて「商品情報を編集」からB/Cへ修正してください。
        </p>
      )}

      {blankItems.length > 0 && (
        <div className="mt-3 border-t border-background-100 pt-2">
          <button
            type="button"
            onClick={() => setShowBlank((prev) => !prev)}
            aria-expanded={showBlank}
            className="flex cursor-pointer items-center gap-1 whitespace-nowrap py-1 text-[11.5px] text-foreground-500 transition-colors hover:text-foreground-900"
          >
            <i
              className={`${
                showBlank ? "ri-subtract-line" : "ri-add-line"
              } w-3.5 h-3.5 flex items-center justify-center text-[13px]`}
            ></i>
            未入力の項目（{blankItems.length}）
          </button>

          {showBlank && (
            <dl className="tab-fade mt-2 grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-3">
              {blankItems.map((item) => (
                <div key={item.label} className="min-w-0">
                  <dt className="break-words text-[10.5px] leading-4 text-foreground-500">
                    {item.label}
                  </dt>
                  <dd className="mt-0.5 text-[11.5px] leading-4 text-foreground-400">
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