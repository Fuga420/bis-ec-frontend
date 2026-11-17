import type { CategoryId } from "@/mocks/productForm";
import { CHROME_HEARTS_BRAND } from "@/pages/chrome-hearts/lib/chromeHearts";

/**
 * 商品登録画面（/register）の遷移元。
 *
 * カテゴリ別ページの「商品を追加」から開いた場合にだけ `?from=` を付け、
 * 登録画面でパンくずとカテゴリの初期値を決める。
 * 保存値・必須条件・保存処理は一切変えない（あくまで入力欄の初期状態だけ）。
 *
 * カテゴリを事前選択してよいのは、遷移元のページと保存するカテゴリ値が
 * 一意に対応する場合だけ。
 * - Sneakers  → category=sneaker
 * - Apparel   → category=apparel
 * - Pokémon Card → category=pokemon_card
 * - Chrome Hearts はブランド名の入口であり、商品種別（カテゴリ）は
 *   apparel / jewelry / fashion_goods / other など複数に分かれるため、
 *   遷移元だけを根拠にカテゴリを決めない（事前選択しない）。
 */
export type RegisterOriginSource =
  | "sneakers"
  | "apparel"
  | "chrome-hearts"
  | "pokeka";

export interface RegisterOrigin {
  source: RegisterOriginSource;
  /** パンくずに出す遷移元一覧の表示名 */
  label: string;
  /** 遷移元一覧のパス */
  listPath: string;
  /** 既存のカテゴリ値と一意に対応する場合だけ、その値（それ以外は空） */
  initialCategory: CategoryId | "";
}

const REGISTER_ORIGINS: Record<RegisterOriginSource, RegisterOrigin> = {
  sneakers: {
    source: "sneakers",
    label: "Sneakers",
    listPath: "/sneakers",
    initialCategory: "sneaker",
  },
  apparel: {
    source: "apparel",
    label: "Apparel",
    listPath: "/apparel",
    initialCategory: "apparel",
  },
  pokeka: {
    source: "pokeka",
    label: "Pokémon Card",
    listPath: "/pokeka",
    initialCategory: "pokemon_card",
  },
  "chrome-hearts": {
    source: "chrome-hearts",
    label: CHROME_HEARTS_BRAND,
    listPath: "/chrome-hearts",
    // ブランドの入口のため、カテゴリ（商品種別）は決められない。
    initialCategory: "",
  },
};

function isRegisterOriginSource(
  value: string
): value is RegisterOriginSource {
  return Object.prototype.hasOwnProperty.call(REGISTER_ORIGINS, value);
}

/** `?from=` の値を検証して遷移元を返す（想定外の値は遷移元なしとして扱う） */
export function readRegisterOrigin(
  value: string | null | undefined
): RegisterOrigin | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (!key || !isRegisterOriginSource(key)) return null;
  return REGISTER_ORIGINS[key];
}

/** カテゴリ別ページから登録画面へ渡すパス（既存の /register にクエリを足すだけ） */
export function buildRegisterPath(from?: RegisterOriginSource): string {
  return from ? `/register?from=${from}` : "/register";
}

export interface SavedProductListLink {
  label: string;
  to: string;
}

/**
 * 登録した商品を確認できるカテゴリ別一覧。
 *
 * 商品の保存値から一覧を決められる場合だけ返す（ブランド名からカテゴリを推測しない）。
 * Pokémon Card は一覧の対象が保管場所（旧裏ストレージ）判定のため、
 * 一般登録した商品が必ず出るとは限らないのでリンクに含めない。
 */
export function getSavedProductListLinks(params: {
  category?: string | null;
  brand?: string | null;
}): SavedProductListLink[] {
  const links: SavedProductListLink[] = [];
  if (params.category === "sneaker") {
    links.push({ label: "Sneakers", to: "/sneakers" });
  }
  if (params.category === "apparel") {
    links.push({ label: "Apparel", to: "/apparel" });
  }
  if ((params.brand ?? "").trim() === CHROME_HEARTS_BRAND) {
    links.push({ label: CHROME_HEARTS_BRAND, to: "/chrome-hearts" });
  }
  return links;
}