/**
 * 旧裏ストレージ（ポケカ素地取込）商品の判定。
 *
 * 判定には選択済み商品の `storage_location` のみを使う。
 * カテゴリの空欄・取込モードなどの推測では判定しない（誤判定を避ける）。
 */

export const POKECA_RAW_STORAGE_PREFIX = "旧裏ストレージ/";

/** 保管場所の表記ゆれ（前後空白・全角空白・Windows形式の区切り）を吸収する。 */
export function normalizeStorageLocation(value?: string | null): string {
  return (value ?? "")
    .replace(/\u3000/g, " ")
    .replace(/\\/g, "/")
    .trim();
}

/**
 * 商品が旧裏ストレージ商品かどうか。
 * `storage_location` が「旧裏ストレージ/」で始まる場合のみ該当とする。
 */
export function isPokecaRawStorageProduct(product: {
  storage_location?: string | null;
}): boolean {
  return normalizeStorageLocation(product.storage_location).startsWith(
    POKECA_RAW_STORAGE_PREFIX
  );
}

export interface PokecaSelectionSummary {
  /** 旧裏ストレージ商品の件数 */
  pokecaCount: number;
  /** 旧裏ストレージではない（通常の）商品の件数 */
  normalCount: number;
  /** 選択商品がすべて旧裏ストレージ商品か（0件のときは false） */
  allPokeca: boolean;
}

/** 選択済み商品の `storage_location` から内訳を集計する。 */
export function summarizePokecaSelection(
  products: Array<{ storage_location?: string | null }>
): PokecaSelectionSummary {
  let pokecaCount = 0;
  products.forEach((product) => {
    if (isPokecaRawStorageProduct(product)) pokecaCount += 1;
  });
  const normalCount = products.length - pokecaCount;
  return {
    pokecaCount,
    normalCount,
    allPokeca: products.length > 0 && normalCount === 0,
  };
}