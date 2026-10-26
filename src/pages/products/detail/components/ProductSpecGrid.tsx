import type { AdminProductDetail } from "@/pages/products/types";
import { formatPrice, hasText } from "../lib/format";

interface ProductSpecItem {
  label: string;
  value: string;
  emphasize?: boolean;
}

/**
 * 商品詳細のスペック一覧（表示専用）。
 * カテゴリごとの項目を並べるだけで、データの取得・保存には一切関与しない。
 */
export function buildProductSpecItems(
  product: AdminProductDetail
): ProductSpecItem[] {
  const items: ProductSpecItem[] = [
    { label: "ブランド", value: product.brand ?? "" },
  ];

  // ポケモンカードは専用の pokemon_card.card_condition を状態として表示するため、
  // 共通の商品状態は表示しない（矛盾させない）。
  if (product.category !== "pokemon_card") {
    items.push({ label: "商品状態", value: product.condition ?? "" });
  }

  items.push(
    { label: "仕入価格", value: formatPrice(product.purchase_price) },
    { label: "保管場所", value: product.storage_location ?? "" }
  );

  if (product.category === "sneaker") {
    items.push(
      { label: "SKU", value: product.sneaker_sku ?? "" },
      {
        label: "サイズ",
        value:
          product.sneaker_size != null ? String(product.sneaker_size) : "",
      },
      { label: "カラー", value: product.sneaker_colorway ?? "" },
      { label: "箱の有無", value: product.sneaker_box ?? "" },
      { label: "付属品", value: product.sneaker_accessories ?? "" },
      {
        label: "発売年",
        value:
          product.sneaker_release_year != null
            ? String(product.sneaker_release_year)
            : "",
      }
    );
  }

  if (product.category === "jewelry") {
    items.push(
      { label: "種類", value: product.jewelry_type ?? "" },
      { label: "素材", value: product.jewelry_material ?? "" },
      { label: "カラット", value: product.carat ?? "" },
      { label: "シェイプ", value: product.shape ?? "" },
      { label: "カラーグレード", value: product.color_grade ?? "" },
      { label: "クラリティ", value: product.clarity ?? "" },
      { label: "カット", value: product.cut ?? "" },
      { label: "メインストーン", value: product.main_stone ?? "" },
      { label: "サイズ", value: product.jewelry_size ?? "" },
      { label: "重量", value: product.weight_g ?? "" },
      { label: "鑑定書", value: product.certificate_available ?? "" },
      { label: "鑑定書番号", value: product.certificate_number ?? "" }
    );
  }

  if (product.category === "pokemon_card") {
    items.push(
      { label: "カード名", value: product.pokemon_card?.card_name ?? "" },
      { label: "セット名", value: product.pokemon_card?.set_name ?? "" },
      { label: "カード番号", value: product.pokemon_card?.card_number ?? "" },
      { label: "レアリティ", value: product.pokemon_card?.rarity ?? "" },
      { label: "言語", value: product.pokemon_card?.language ?? "" },
      {
        label: "鑑定状態",
        value:
          product.pokemon_card?.grading_status === "graded"
            ? "鑑定済み"
            : product.pokemon_card?.grading_status === "ungraded"
              ? "未鑑定"
              : "",
      }
    );

    if (product.pokemon_card?.grading_status === "graded") {
      items.push(
        { label: "鑑定会社", value: product.pokemon_card?.grader ?? "" },
        { label: "グレード", value: product.pokemon_card?.grade ?? "" },
        {
          label: "鑑定番号",
          value: product.pokemon_card?.certification_number ?? "",
        }
      );
    } else {
      items.push({
        label: "カード状態",
        value: product.pokemon_card?.card_condition ?? "",
      });
    }
  }

  return items;
}

interface ProductSpecGridProps {
  product: AdminProductDetail;
}

/**
 * 商品スペックをコンパクトなグリッドで表示する。
 * 狭い幅では2カラム、広い幅では3カラム。
 */
export default function ProductSpecGrid({ product }: ProductSpecGridProps) {
  const items = buildProductSpecItems(product);
  const showCardConditionNote =
    product.category === "pokemon_card" &&
    product.pokemon_card?.grading_status !== "graded" &&
    product.pokemon_card?.card_condition === "A";

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[12px] leading-4 text-foreground-500">
            {item.label}
          </dt>
          <dd
            className={`mt-1 break-words text-[13px] leading-5 ${
              !hasText(item.value)
                ? "text-foreground-300"
                : item.emphasize
                  ? "font-semibold text-foreground-950"
                  : "font-medium text-foreground-900"
            }`}
          >
            {hasText(item.value) ? item.value : "—"}
          </dd>
        </div>
      ))}
      {showCardConditionNote && (
        <p className="col-span-full flex items-start gap-1.5 text-[11px] leading-relaxed text-foreground-500">
          <i className="ri-information-line mt-0.5 w-3.5 h-3.5 flex items-center justify-center shrink-0"></i>
          <span className="min-w-0 flex-1">
            AはAI生成直後の初期値です（現物確認前）。現物を確認のうえ、必要に応じて「商品情報を編集」からB/Cへ修正してください。
          </span>
        </p>
      )}
    </div>
  );
}