import {
  POKECA_RAW_STORAGE_PREFIX,
  isPokecaRawStorageProduct,
  normalizeStorageLocation,
} from "@/pages/products/lib/pokecaRawStorage";
import type { AdminProduct } from "@/pages/products/types";
import type {
  PokecaLightProductInfo,
  PokecaLightWorkerState,
} from "@/pages/products/lib/pokecaRawStorageAi";

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

/**
 * 一覧の参考価格。
 * ライト版AIの商品別の候補価格 → 商品の販売価格（planned_sale_price）の順で採用し、
 * どちらも無い場合は null（一覧では「—」）。
 * 商品データは変更せず、表示に使う値だけを決める。
 */
export function resolveReferencePrice(
  product: AdminProduct,
  info: PokecaLightProductInfo | undefined
): number | null {
  const candidate = info?.candidatePrice;
  if (
    typeof candidate === "number" &&
    Number.isFinite(candidate) &&
    candidate > 0
  ) {
    return candidate;
  }
  const planned = product.planned_sale_price;
  if (typeof planned === "number" && Number.isFinite(planned) && planned > 0) {
    return planned;
  }
  return null;
}

/**
 * ライト版AIの整備状況の集計。
 * source="items": 商品別情報（worker_state.items[]）が返っている場合。
 * source="worker": items[] が無く、APIの集計値（processed_count /
 * price_found_count / illustrator_counts）だけで判定する場合。
 */
export interface PokecaLightCoverage {
  /** 集計できた件数（items なら商品別情報がある件数、worker なら処理済み件数） */
  known: number | null;
  /** 対象件数（worker 集計時のみ。items 集計時は null） */
  total: number | null;
  priced: number | null;
  unpriced: number | null;
  authorKnown: number | null;
  authorMissing: number | null;
  authorList: Array<{ illustrator: string; count: number }>;
  source: "items" | "worker";
}

/**
 * パネルの整備状況を組み立てる。
 * 商品別情報があれば従来どおりそれを優先し、無ければAPIの集計値を使う。
 * どちらの値も無い場合は null（「まだ返っていません」を表示する）。
 */
export function buildLightCoverage(
  worker: PokecaLightWorkerState | null,
  products: AdminProduct[],
  infoMap: PokecaLightInfoMap
): PokecaLightCoverage | null {
  if (infoMap.size > 0) {
    let priced = 0;
    let unpriced = 0;
    let authorKnown = 0;
    let authorMissing = 0;
    const authors = new Map<string, number>();

    products.forEach((product) => {
      const info = infoMap.get(product.product_id);
      // 商品別情報に含まれない商品は「未取得」なので集計しない
      if (!info) return;
      if (info.candidatePrice !== null && Number.isFinite(info.candidatePrice)) {
        priced += 1;
      } else {
        unpriced += 1;
      }
      if (info.illustrator) {
        authorKnown += 1;
        authors.set(info.illustrator, (authors.get(info.illustrator) ?? 0) + 1);
      } else {
        authorMissing += 1;
      }
    });

    // 商品別情報が一覧の商品と1件も対応しない場合は、集計値での表示に切り替える
    if (priced + unpriced > 0) {
      const authorList = Array.from(authors.entries())
        .map(([illustrator, count]) => ({ illustrator, count }))
        .sort(
          (a, b) =>
            b.count - a.count || a.illustrator.localeCompare(b.illustrator)
        );

      return {
        known: priced + unpriced,
        total: null,
        priced,
        unpriced,
        authorKnown,
        authorMissing,
        authorList,
        source: "items",
      };
    }
  }

  if (!worker) return null;
  const hasAggregate =
    worker.priceFoundCount !== null || worker.illustratorCounts.length > 0;
  if (!hasAggregate) return null;

  const total = worker.totalCount > 0 ? worker.totalCount : worker.processedCount;
  const processed = Math.max(0, Math.min(worker.processedCount, total));
  if (processed === 0) return null;

  const rawPriced = worker.priceFoundCount;
  const priced =
    rawPriced === null ? null : Math.max(0, Math.min(rawPriced, processed));
  const unpriced = priced === null ? null : Math.max(0, processed - priced);

  const authorList = worker.illustratorCounts;
  const authorKnown =
    authorList.length > 0
      ? authorList.reduce((sum, entry) => sum + entry.count, 0)
      : null;
  const authorMissing =
    authorKnown === null ? null : Math.max(0, processed - authorKnown);

  return {
    known: processed,
    total,
    priced,
    unpriced,
    authorKnown,
    authorMissing,
    authorList,
    source: "worker",
  };
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