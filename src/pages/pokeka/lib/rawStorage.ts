import {
  POKECA_RAW_STORAGE_PREFIX,
  isPokecaRawStorageProduct,
  normalizeStorageLocation,
} from "@/pages/products/lib/pokecaRawStorage";
import type { AdminProduct } from "@/pages/products/types";
import type { PokecaLightProductInfo } from "@/pages/products/lib/pokecaRawStorageAi";

/**
 * 保管場所（例: 旧裏ストレージ/BOX01/03）から、箱番・枝番を取り出す。
 * 「旧裏ストレージ/」より後ろの1階層目を箱番、2階層目を枝番として扱う。
 */
export function parseStoragePosition(storageLocation?: string | null): {
  box: string;
  branch: string;
} {
  const normalized = normalizeStorageLocation(storageLocation);
  if (!normalized.startsWith(POKECA_RAW_STORAGE_PREFIX)) {
    return { box: "", branch: "" };
  }
  const rest = normalized.slice(POKECA_RAW_STORAGE_PREFIX.length);
  const segments = rest.split("/").map((part) => part.trim());
  return {
    box: segments[0] ?? "",
    branch: segments[1] ?? "",
  };
}

/** 保管場所の表示用文字列（箱番・枝番）。未設定は「-」。 */
export function formatStoragePosition(storageLocation?: string | null): string {
  const { box, branch } = parseStoragePosition(storageLocation);
  if (!box && !branch) return "-";
  if (!branch) return box;
  return `${box} / ${branch}`;
}

/** 旧裏ストレージ商品だけを取り出す。判定は storage_location のみで行う。 */
export function pickRawStorageProducts(
  products: AdminProduct[]
): AdminProduct[] {
  return products.filter((product) => isPokecaRawStorageProduct(product));
}

/** 商品IDをキーにした、ライト版AIの商品別情報マップ。 */
export type PokecaLightInfoMap = Map<string, PokecaLightProductInfo>;

export function buildLightInfoMap(
  items: PokecaLightProductInfo[] | undefined
): PokecaLightInfoMap {
  const map: PokecaLightInfoMap = new Map();
  (items ?? []).forEach((item) => {
    if (item.product_id) map.set(item.product_id, item);
  });
  return map;
}

export interface StorageSummary {
  totalCount: number;
  /** 参考価格が取得できている件数 */
  pricedCount: number;
  /** 価格カバレッジ（％・小数切り捨て）。価格情報が無い場合は null */
  priceCoverage: number | null;
  /** 作家（イラストレーター）の種類数。作家情報が無い場合は null */
  illustratorCount: number | null;
}

/**
 * ヘッダー集計。ライト版AIのステータス取得で得られた範囲だけで集計し、
 * 取得できない項目は null にして表示しない。
 */
export function summarizeStorage(
  products: AdminProduct[],
  infoMap: PokecaLightInfoMap
): StorageSummary {
  let pricedCount = 0;
  const illustrators = new Set<string>();

  products.forEach((product) => {
    const info = infoMap.get(product.product_id);
    if (!info) return;
    if (info.candidatePrice !== null && Number.isFinite(info.candidatePrice)) {
      pricedCount += 1;
    }
    if (info.illustrator) illustrators.add(info.illustrator);
  });

  const totalCount = products.length;
  return {
    totalCount,
    pricedCount,
    priceCoverage:
      totalCount > 0 ? Math.floor((pricedCount / totalCount) * 100) : null,
    illustratorCount: illustrators.size > 0 ? illustrators.size : null,
  };
}

/** 作家別の件数（多い順）。作家情報が無ければ空配列。 */
export function countByIllustrator(
  infoMap: PokecaLightInfoMap
): Array<{ illustrator: string; count: number }> {
  const counts = new Map<string, number>();
  infoMap.forEach((info) => {
    if (!info.illustrator) return;
    counts.set(info.illustrator, (counts.get(info.illustrator) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([illustrator, count]) => ({ illustrator, count }))
    .sort((a, b) => b.count - a.count || a.illustrator.localeCompare(b.illustrator));
}

/** 箱番の選択肢（重複を除き、自然な順序で並べる）。 */
export function collectBoxOptions(products: AdminProduct[]): string[] {
  const boxes = new Set<string>();
  products.forEach((product) => {
    const { box } = parseStoragePosition(product.storage_location);
    if (box) boxes.add(box);
  });
  return Array.from(boxes).sort((a, b) =>
    a.localeCompare(b, "ja", { numeric: true, sensitivity: "base" })
  );
}

/** 作家の選択肢（多い順）。 */
export function collectIllustratorOptions(
  infoMap: PokecaLightInfoMap
): string[] {
  return countByIllustrator(infoMap).map((entry) => entry.illustrator);
}