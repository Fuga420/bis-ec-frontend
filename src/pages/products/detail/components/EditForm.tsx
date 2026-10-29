import { useMemo, useState } from "react";
import FormField, { inputClass } from "@/pages/register/components/FormField";
import FormSection from "@/pages/register/components/FormSection";
import SneakerFields, {
  type SneakerValues,
} from "@/pages/register/components/SneakerFields";
import JewelryFields, {
  type JewelryValues,
} from "@/pages/register/components/JewelryFields";
import PokemonCardFields, {
  type PokemonCardValues,
} from "@/pages/register/components/PokemonCardFields";
import {
  categories,
  conditions,
  sneakerBrands,
  jewelryBrands,
  otherBrands,
  pokemonBrands,
  apparelBrands,
  fashionGoodsBrands,
  sneakerSizes,
  type CategoryId,
} from "@/mocks/productForm";
import type { AdminProductDetail } from "@/pages/products/types";
import SaveStatusMessage from "@/components/base/SaveStatusMessage";

interface EditFormProps {
  product: AdminProductDetail;
  saving: boolean;
  error: string;
  // AIドラフト（get_ai_product_draft）の candidate.price。
  // 本票の販売予定価格が未設定のときだけ編集可能な初期値として提示する。
  aiPriceSuggestion?: number | null;
  onCancel: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}

const toPriceStr = (value: number | null | undefined): string =>
  value != null && value > 0 ? String(value) : "";

const normalizeSneakerSize = (value: number | null | undefined): string => {
  if (value == null) return "";
  const str = String(value);
  if (sneakerSizes.includes(str)) return str;
  const dotted = `${value}.0`;
  return sneakerSizes.includes(dotted) ? dotted : str;
};

const initialSneaker = (p: AdminProductDetail): SneakerValues => ({
  sku: p.sneaker_sku ?? "",
  size: normalizeSneakerSize(p.sneaker_size),
  color: p.sneaker_colorway ?? "",
  box: p.sneaker_box ?? "",
  year: p.sneaker_release_year ?? "",
});

const initialJewelry = (p: AdminProductDetail): JewelryValues => ({
  type: p.jewelry_type ?? "",
  material: p.jewelry_material ?? "",
  carat: p.carat ?? "",
  shape: p.shape ?? "",
  color: p.color_grade ?? "",
  clarity: p.clarity ?? "",
  cut: p.cut ?? "",
  stone: p.main_stone ?? "",
  size: p.jewelry_size ?? "",
  weight: p.weight_g ?? "",
  certPresence: p.certificate_available ?? "",
  certNumber: p.certificate_number ?? "",
});

const initialPokemonCard = (p: AdminProductDetail): PokemonCardValues => ({
  card_name: p.pokemon_card?.card_name ?? "",
  set_name: p.pokemon_card?.set_name ?? "",
  card_number: p.pokemon_card?.card_number ?? "",
  rarity: p.pokemon_card?.rarity ?? "",
  language: p.pokemon_card?.language ?? "Japanese",
  grading_status:
    p.pokemon_card?.grading_status === "graded" ? "graded" : "ungraded",
  grader: p.pokemon_card?.grader ?? "",
  grade: p.pokemon_card?.grade ?? "",
  certification_number: p.pokemon_card?.certification_number ?? "",
  card_condition: p.pokemon_card?.card_condition ?? "",
});

export default function EditForm({
  product,
  saving,
  error,
  aiPriceSuggestion = null,
  onCancel,
  onSave,
}: EditFormProps) {
  const category: CategoryId | "" = (product.category as CategoryId) ?? "";

  // 本票の販売予定価格が未設定（0・null）で、AI価格案が正の整数のときだけ、
  // その価格案を販売予定価格欄の初期値として提示する。
  // 本票価格が既に入っている場合は上書きしない（AI価格案は一切使わない）。
  const productPriceUnset =
    product.planned_sale_price == null || product.planned_sale_price <= 0;
  const showAiPriceSuggestion =
    productPriceUnset &&
    aiPriceSuggestion != null &&
    Number.isInteger(aiPriceSuggestion) &&
    aiPriceSuggestion > 0;

  const [name, setName] = useState(product.product_name ?? "");
  // 仕入台帳（オークション等）の商品番号。文字列のまま扱う（数値変換しない）。
  // 詳細APIが項目自体を返さない（古い応答・部分表示）場合は編集させない。
  const hasAuctionNumberField = Object.prototype.hasOwnProperty.call(
    product,
    "auction_item_number"
  );
  const [auctionItemNumber, setAuctionItemNumber] = useState(
    typeof product.auction_item_number === "string"
      ? product.auction_item_number
      : ""
  );
  const [brand, setBrand] = useState(product.brand ?? "");
  const [condition, setCondition] = useState(
    conditions.find((c) => c.label === product.condition)?.id ??
      product.condition ??
      ""
  );
  const [purchasePrice, setPurchasePrice] = useState(
    toPriceStr(product.purchase_price)
  );
  const [sellPrice, setSellPrice] = useState(
    toPriceStr(product.planned_sale_price) ||
      (showAiPriceSuggestion ? String(aiPriceSuggestion) : "")
  );
  const [storageLocation, setStorageLocation] = useState(
    product.storage_location ?? ""
  );
  const [description, setDescription] = useState(product.description ?? "");
  const [notes, setNotes] = useState(product.notes ?? "");

  const [sneaker, setSneaker] = useState<SneakerValues>(initialSneaker(product));
  const [sneakerAccessories, setSneakerAccessories] = useState<string[]>(
    product.sneaker_accessories
      ? product.sneaker_accessories.split(", ").filter(Boolean)
      : []
  );
  const [jewelry, setJewelry] = useState<JewelryValues>(initialJewelry(product));
  const [pokemonCard, setPokemonCard] = useState<PokemonCardValues>(
    initialPokemonCard(product)
  );

  const brandOptions = useMemo(() => {
    let base: string[] = [];
    if (category === "sneaker") base = sneakerBrands;
    else if (category === "jewelry") base = jewelryBrands;
    else if (category === "pokemon_card") base = pokemonBrands;
    else if (category === "apparel") base = apparelBrands;
    else if (category === "fashion_goods") base = fashionGoodsBrands;
    else if (category === "other") base = otherBrands;
    // 保存済みのブランドが選択肢に無い場合も、その値を選択状態のまま表示できるようにする
    if (brand && !base.includes(brand)) return [...base, brand];
    return base;
  }, [category, brand]);

  const buildPayload = (): Record<string, unknown> => {
    const conditionLabel =
      conditions.find((c) => c.id === condition)?.label ?? condition;

    const payload: Record<string, unknown> = {
      category: category || null,
      brand: brand || null,
      product_name: name.trim() || null,
      // ポケモンカードは共通状態を使わず、専用の pokemon_card.card_condition を使う。
      // 共通状態は画面上で変更できないため、既存値をそのまま維持する。
      condition:
        category === "pokemon_card"
          ? product.condition ?? null
          : conditionLabel || null,
      purchase_price: purchasePrice || null,
      planned_sale_price: sellPrice || null,
      storage_location: storageLocation || null,
      description: description || null,
      notes: notes || null,
    };

    // 仕入台帳の商品番号は、取得できている場合のみ送る（項目を省略すればGAS側は既存値を維持）。
    // 画面上で空にしたときは "" を明示送信してクリアする。
    // 商品名など他項目だけの保存でも、現在値を送るため既存値は消えない。
    if (hasAuctionNumberField) {
      payload.auction_item_number = auctionItemNumber.trim();
    }

    if (category === "sneaker") {
      payload.sneaker_sku = sneaker.sku || null;
      payload.sneaker_size = sneaker.size || null;
      payload.sneaker_colorway = sneaker.color || null;
      payload.sneaker_box = sneaker.box || null;
      payload.sneaker_accessories =
        sneakerAccessories.length > 0 ? sneakerAccessories.join(", ") : null;
      payload.sneaker_release_year = sneaker.year || null;
    } else {
      payload.sneaker_sku = product.sneaker_sku ?? null;
      payload.sneaker_size = product.sneaker_size ?? null;
      payload.sneaker_colorway = product.sneaker_colorway ?? null;
      payload.sneaker_box = product.sneaker_box ?? null;
      payload.sneaker_accessories = product.sneaker_accessories ?? null;
      payload.sneaker_release_year = product.sneaker_release_year ?? null;
    }

    if (category === "jewelry") {
      payload.jewelry_type = jewelry.type || null;
      payload.jewelry_material = jewelry.material || null;
      payload.carat = jewelry.carat || null;
      payload.shape = jewelry.shape || null;
      payload.color_grade = jewelry.color || null;
      payload.clarity = jewelry.clarity || null;
      payload.cut = jewelry.cut || null;
      payload.main_stone = jewelry.stone || null;
      payload.jewelry_size = jewelry.size || null;
      payload.weight_g = jewelry.weight || null;
      payload.certificate_available = jewelry.certPresence || null;
      payload.certificate_number = jewelry.certNumber || null;
    } else {
      payload.jewelry_type = product.jewelry_type ?? null;
      payload.jewelry_material = product.jewelry_material ?? null;
      payload.carat = product.carat ?? null;
      payload.shape = product.shape ?? null;
      payload.color_grade = product.color_grade ?? null;
      payload.clarity = product.clarity ?? null;
      payload.cut = product.cut ?? null;
      payload.main_stone = product.main_stone ?? null;
      payload.jewelry_size = product.jewelry_size ?? null;
      payload.weight_g = product.weight_g ?? null;
      payload.certificate_available = product.certificate_available ?? null;
      payload.certificate_number = product.certificate_number ?? null;
    }

    if (category === "pokemon_card") {
      const isGraded = pokemonCard.grading_status === "graded";
      payload.pokemon_card = {
        card_name: pokemonCard.card_name.trim(),
        set_name: pokemonCard.set_name.trim(),
        card_number: pokemonCard.card_number.trim(),
        rarity: pokemonCard.rarity,
        language: pokemonCard.language,
        grading_status: pokemonCard.grading_status,
        grader: isGraded ? pokemonCard.grader : "",
        grade: isGraded ? pokemonCard.grade : "",
        certification_number: isGraded ? pokemonCard.certification_number : "",
        card_condition: isGraded ? "" : pokemonCard.card_condition,
      };
    }

    return payload;
  };

  const handleSubmit = () => {
    onSave(buildPayload());
  };

  return (
    <div className="rounded-lg border border-background-200 bg-white p-4 md:p-5">
      <h2 className="text-[15px] font-semibold text-foreground-950">商品情報の編集</h2>

      <FormSection className="mt-4">
        <div className="flex flex-col gap-3">
        <FormField
          label="カテゴリー"
          hint="カテゴリは登録後に変更できません"
        >
          <select
            className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
            value={category}
            disabled
          >
            <option value="">選択してください</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="ブランド">
          <select
            className={inputClass}
            value={brand}
            disabled={!category}
            onChange={(e) => setBrand(e.target.value)}
          >
            <option value="">
              {category ? "選択してください" : "先にカテゴリを選択してください"}
            </option>
            {brandOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="商品名">
          <input
            className={inputClass}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>

        <FormField
          label="仕入台帳の商品番号"
          badge="社内用"
          badgeColor="secondary"
          hint={
            hasAuctionNumberField
              ? "先頭のゼロやハイフンはそのまま保存されます。空欄にすると未設定に戻ります（この項目を変更しない保存では消えません）。"
              : "この商品では現在の値を取得できていないため、この欄は編集できません。他の項目を保存しても、登録済みの番号は変更されません。"
          }
        >
          <input
            className={`${inputClass} font-mono`}
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder="例: 00842-01"
            value={auctionItemNumber}
            disabled={!hasAuctionNumberField || saving}
            onChange={(e) => setAuctionItemNumber(e.target.value)}
          />
        </FormField>

        {/* ポケモンカードは専用の pokemon_card.card_condition（A/B/C）を使うため、
            共通の状態欄は表示しない（両方を状態として見せて矛盾させない）。 */}
        {category !== "pokemon_card" && (
          <FormField label="商品の状態">
            <select
              className={inputClass}
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            >
              <option value="">選択してください</option>
              {conditions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormField>
        )}
        </div>
      </FormSection>

      {category === "sneaker" && (
        <>
          <div className="my-3 border-t border-background-200"></div>
          <FormSection title="スニーカー詳細" headingLevel="h3">
            <SneakerFields
              values={sneaker}
              accessories={sneakerAccessories}
              onChange={(patch) => setSneaker((prev) => ({ ...prev, ...patch }))}
              onAccessoriesChange={setSneakerAccessories}
            />
          </FormSection>
        </>
      )}

      {category === "jewelry" && (
        <>
          <div className="my-3 border-t border-background-200"></div>
          <FormSection title="ジュエリー詳細" headingLevel="h3">
            <JewelryFields
              values={jewelry}
              onChange={(patch) => setJewelry((prev) => ({ ...prev, ...patch }))}
            />
          </FormSection>
        </>
      )}

      {category === "pokemon_card" && (
        <>
          <div className="my-3 border-t border-background-200"></div>
          <FormSection title="ポケモンカード詳細" headingLevel="h3">
            <PokemonCardFields
              values={pokemonCard}
              onChange={(patch) =>
                setPokemonCard((prev) => ({ ...prev, ...patch }))
              }
            />
          </FormSection>
        </>
      )}

      <div className="my-3 border-t border-background-200"></div>

      <FormSection>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormField label="仕入価格 (円)">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400">
              ¥
            </span>
            <input
              className={`${inputClass} pl-7`}
              type="text"
              inputMode="numeric"
              value={purchasePrice}
              onChange={(e) =>
                setPurchasePrice(e.target.value.replace(/[^0-9]/g, ""))
              }
            />
          </div>
        </FormField>

        <FormField label="販売予定価格 (円)">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400">
              ¥
            </span>
            <input
              className={`${inputClass} pl-7`}
              type="text"
              inputMode="numeric"
              value={sellPrice}
              onChange={(e) =>
                setSellPrice(e.target.value.replace(/[^0-9]/g, ""))
              }
            />
          </div>
        </FormField>
      </div>

      {showAiPriceSuggestion && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-accent-300 bg-accent-50/70 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <i className="ri-sparkling-line mt-0.5 w-4 h-4 flex items-center justify-center shrink-0 text-accent-600"></i>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground-900">
                AIの価格案
                <strong className="ml-1 font-semibold text-foreground-950">
                  ¥{aiPriceSuggestion?.toLocaleString()}
                </strong>
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-foreground-500">
                本票の販売予定価格は未設定のため、上の欄にAI価格案を初期値として表示しています。必要に応じて修正してから保存してください（表示しただけでは保存されません）。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSellPrice(String(aiPriceSuggestion))}
            className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-accent-300 bg-white px-3 py-1.5 text-xs font-semibold text-accent-800 transition-colors hover:bg-accent-100"
          >
            <i className="ri-price-tag-3-line w-3.5 h-3.5 flex items-center justify-center"></i>
            AI価格案を適用
          </button>
        </div>
      )}

      <div className="mt-3">
        <FormField label="保管場所">
          <input
            className={inputClass}
            type="text"
            value={storageLocation}
            onChange={(e) => setStorageLocation(e.target.value)}
          />
        </FormField>
      </div>
      </FormSection>

      <div className="my-3 border-t border-background-200"></div>

      <FormSection>
        <div className="flex flex-col gap-3">
        <FormField
          label="商品説明"
          badge="販売用"
          badgeColor="primary"
          hint={`${description.length} / 1000 文字`}
        >
          <textarea
            className={`${inputClass} min-h-[100px] resize-y`}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>

        <FormField
          label="備考"
          badge="社内用"
          badgeColor="secondary"
          hint={`${notes.length} / 500 文字`}
        >
          <textarea
            className={`${inputClass} min-h-[80px] resize-y`}
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
        </div>
      </FormSection>

      {error && (
        <SaveStatusMessage tone="error" text={error} className="mt-4" />
      )}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="inline-flex min-w-[132px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <>
              <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
              保存中...
            </>
          ) : (
            <>
              <i className="ri-save-line w-4 h-4 flex items-center justify-center"></i>
              変更を保存
            </>
          )}
        </button>
      </div>
    </div>
  );
}