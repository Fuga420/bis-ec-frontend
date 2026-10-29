import type { AdminProductDetail } from "@/pages/products/types";
import { formatYen, hasText } from "../lib/format";

interface ProductSpecItem {
  label: string;
  value: string;
  emphasize?: boolean;
  // 値の下に出す補足（税額未確認などの注意書き）
  note?: string;
  // 取得エラーなど、注意を引く表示にするか
  tone?: "error";
  // 値が空のときに「—」の代わりに表示する文言（例: 未設定）
  emptyText?: string;
}

/**
 * 上部サマリーに出す仕入価格の表示材料。
 * 下部「仕入・書類」と同じ取得結果（deriveProductCost）から作る。
 */
export interface ProductCostSpecInput {
  // 台帳原価の取得状態
  loadState: "loading" | "success" | "error";
  // 取得失敗時のメッセージ
  errorText: string;
  // 確定済みの仕入明細リンクがあるか
  hasLinks: boolean;
  // 確定済みの紐付けがあり、金額として表示できる値があるか
  hasCostAmount: boolean;
  // 商品代金＋落札手数料＋税額＋送料その他の総額（概算）
  costTotal: number;
  // 税額が確認できていない明細を含むか
  hasUnconfirmedTax: boolean;
}

const MANUAL_PRICE_LABEL = "仕入価格（手入力）";
const LEDGER_PRICE_LABEL = "仕入原価（台帳・概算）";
const UNSET_LABEL = "仕入価格";

/**
 * GAS の商品マスタに入っている手入力の仕入価格を読む（表示専用）。
 * null / undefined / 空文字は「未設定」、数値の 0 は「実際の0円」として区別する。
 */
function readManualPurchasePrice(
  product: AdminProductDetail
): { hasValue: boolean; value: number } {
  const raw = product.purchase_price as unknown;
  if (raw === null || raw === undefined || raw === "") {
    return { hasValue: false, value: 0 };
  }
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num)) return { hasValue: false, value: 0 };
  return { hasValue: true, value: num };
}

/**
 * 上部サマリーの仕入価格の項目を組み立てる。
 *
 * 表示優先順位:
 *  1. 確定済みリンクがあり台帳原価を取得できた → 「仕入原価（台帳・概算）」に総額
 *  2. 確定済みリンクがなく手入力の purchase_price がある → 「仕入価格（手入力）」
 *  3. どちらにも金額がない → 「未設定」
 *
 * - 台帳原価と手入力価格は合算しない。片方をもう片方へ書き戻さない（表示専用）。
 * - 台帳の取得に失敗した場合は、未照合と誤認させず取得エラーとして示す。
 *   その場合でも手入力価格があれば別項目として残す（既存の手入力値を消さない）。
 * - 未設定と実際の0円（¥0）は区別する。
 */
function buildPurchaseCostItems(
  product: AdminProductDetail,
  cost?: ProductCostSpecInput
): ProductSpecItem[] {
  const manual = readManualPurchasePrice(product);
  const manualItem: ProductSpecItem | null = manual.hasValue
    ? {
        label: MANUAL_PRICE_LABEL,
        value: formatYen(manual.value),
        note: "商品マスタに入力された仕入価格",
      }
    : null;

  const items: ProductSpecItem[] = [];
  let ledgerAmountShown = false;

  if (!cost || cost.loadState === "loading") {
    // 取得中。手入力があれば待たせずに表示しておく（台帳の結果が来たら優先される）。
    if (!manualItem) {
      items.push({ label: LEDGER_PRICE_LABEL, value: "確認中…" });
    }
  } else if (cost.loadState === "error") {
    items.push({
      label: LEDGER_PRICE_LABEL,
      value: "取得エラー",
      tone: "error",
      note: cost.errorText
        ? `${cost.errorText}「仕入・書類」から再取得をお試しください。`
        : "台帳原価を取得できませんでした（未照合とは限りません）。「仕入・書類」から再取得をお試しください。",
    });
  } else if (cost.hasLinks && cost.hasCostAmount) {
    items.push({
      label: LEDGER_PRICE_LABEL,
      value: formatYen(cost.costTotal),
      emphasize: true,
      note: cost.hasUnconfirmedTax
        ? "税額未確認の明細を含む概算（税込・税抜の厳密な配分はしていません）"
        : undefined,
    });
    ledgerAmountShown = true;
  } else if (cost.hasLinks) {
    // 紐付けはあるが金額が未取得。未設定と0円を混同せず、手入力も消さない。
    items.push({
      label: LEDGER_PRICE_LABEL,
      value: "未設定",
      note: "確定済みの明細はありますが、金額が取得できていません",
    });
  }

  if (!ledgerAmountShown && manualItem) {
    items.push(manualItem);
  }

  if (items.length === 0) {
    items.push({
      label: UNSET_LABEL,
      value: "未設定",
      note: "仕入・書類で照合するか、商品情報を編集で仕入価格を入力すると表示されます",
    });
  }

  return items;
}

/**
 * 商品詳細のスペック一覧（表示専用）。
 * カテゴリごとの項目を並べるだけで、データの取得・保存には一切関与しない。
 */
export function buildProductSpecItems(
  product: AdminProductDetail,
  cost?: ProductCostSpecInput
): ProductSpecItem[] {
  const items: ProductSpecItem[] = [
    { label: "ブランド", value: product.brand ?? "" },
    // 仕入台帳（オークション等）の商品番号。商品ID・メーカー品番・型番とは別項目。
    // 値を取得できていない（項目自体が無い）場合は、未設定と断定せず「—」にする。
    {
      label: "仕入台帳の商品番号",
      value: product.auction_item_number ?? "",
      emptyText:
        typeof product.auction_item_number === "string" ? "未設定" : "—",
    },
  ];

  // ポケモンカードは専用の pokemon_card.card_condition を状態として表示するため、
  // 共通の商品状態は表示しない（矛盾させない）。
  if (product.category !== "pokemon_card") {
    items.push({ label: "商品状態", value: product.condition ?? "" });
  }

  items.push(
    ...buildPurchaseCostItems(product, cost),
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
  cost?: ProductCostSpecInput;
}

/**
 * 商品スペックをコンパクトなグリッドで表示する。
 * 狭い幅では2カラム、広い幅では3カラム。
 */
export default function ProductSpecGrid({ product, cost }: ProductSpecGridProps) {
  const items = buildProductSpecItems(product, cost);
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
              item.tone === "error"
                ? "font-semibold text-accent-700"
                : !hasText(item.value)
                  ? "text-foreground-300"
                  : item.emphasize
                    ? "font-semibold text-foreground-950"
                    : "font-medium text-foreground-900"
            }`}
          >
            {hasText(item.value) ? item.value : item.emptyText ?? "—"}
          </dd>
          {item.note && (
            <p
              className={`mt-0.5 text-[11px] leading-4 ${
                item.tone === "error"
                  ? "text-accent-700"
                  : "text-foreground-400"
              }`}
            >
              {item.note}
            </p>
          )}
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