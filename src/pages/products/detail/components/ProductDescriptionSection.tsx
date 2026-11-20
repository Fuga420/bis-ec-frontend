import { useState } from "react";
import type {
  AdminProductDetail,
  ProductTranslation,
} from "@/pages/products/types";
import CatalogueDescription from "./CatalogueDescription";
import CatalogueConditionReport from "./CatalogueConditionReport";
import CatalogueSectionHeading from "./CatalogueSectionHeading";
import ProductTranslationSection from "./ProductTranslationSection";

type DescriptionLanguage = "ja" | "en";

const LANGUAGE_OPTIONS: Array<{ key: DescriptionLanguage; label: string }> = [
  { key: "ja", label: "日本語" },
  { key: "en", label: "English" },
];

interface ProductDescriptionSectionProps {
  product: AdminProductDetail;
  // 翻訳データが更新されたときに親の商品情報へ反映する（既存の処理をそのまま使う）
  onTranslationChange?: (translation: ProductTranslation | null) => void;
}

/**
 * 商品詳細の「商品説明」セクション。
 *
 * 商品説明は商品情報の別言語版という位置づけのため、独立した管理タブにはせず、
 * ここで「日本語 / English」を切り替えて同じ場所で確認できるようにする。
 * 切り替えは画面内の表示だけに影響し、商品名・価格・ステータスや
 * データの取得・保存には一切触れない。
 */
export default function ProductDescriptionSection({
  product,
  onTranslationChange,
}: ProductDescriptionSectionProps) {
  // 既定は日本語。商品を切り替えたときは呼び出し側の key で初期化される。
  const [language, setLanguage] = useState<DescriptionLanguage>("ja");

  // ポケモンカードは英語翻訳の対象外（従来の表示条件をそのまま維持）
  const translationSupported = product.category !== "pokemon_card";

  return (
    <div className="mt-5 rounded-lg border border-background-200 bg-white p-4 md:p-5">
      <CatalogueSectionHeading
        title="商品説明"
        right={
          <div
            role="group"
            aria-label="商品説明の言語切り替え"
            className="inline-flex items-center gap-0.5 rounded-full bg-background-100 p-1"
          >
            {LANGUAGE_OPTIONS.map((option) => {
              const active = language === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setLanguage(option.key)}
                  className={`cursor-pointer whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-medium leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
                    active
                      ? "bg-white text-foreground-950"
                      : "text-foreground-500 hover:text-foreground-800"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        }
      />

      <div className="mt-3">
        {language === "ja" ? (
          <div className="flex flex-col gap-4">
            <CatalogueDescription product={product} showHeading={false} />
            <div className="border-t border-background-100 pt-4">
              <CatalogueConditionReport product={product} />
            </div>
          </div>
        ) : translationSupported ? (
          <ProductTranslationSection
            productId={product.product_id}
            translation={product.translation}
            onTranslationChange={onTranslationChange}
          />
        ) : (
          <p className="text-[12px] leading-relaxed text-foreground-500">
            このカテゴリの商品は英語翻訳の対象外です
          </p>
        )}
      </div>
    </div>
  );
}