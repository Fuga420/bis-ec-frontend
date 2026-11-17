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

/**
 * ポケカページの対象範囲（ポケカカテゴリの商品）。
 * 旧裏ストレージ商品は、カテゴリが未設定でも従来どおり対象に含める
 * （既存の一覧から商品が黙って消えないようにするため）。
 */
export function pickPokecaScopeProducts(
  products: AdminProduct[]
): AdminProduct[] {
  return products.filter(
    (product) =>
      product.category === "pokemon_card" ||
      isPokecaRawStorageProduct(product)
  );
}

/**
 * グレードの有無を既存の一覧データから判定できなかった商品の件数。
 *
 * 一覧APIは鑑定状態・鑑定機関・グレード値を返さないため、
 * 「旧裏ストレージ（生カード保管）に該当しないポケカ商品」は
 * グレードあり／なしのどちらとも確定できない。その件数だけを返す。
 * 推測でどちらかへ振り分けることはしない。
 */
export function countUndeterminedGradeProducts(
  products: AdminProduct[]
): number {
  return pickPokecaScopeProducts(products).filter(
    (product) => !isPokecaRawStorageProduct(product)
  ).length;
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
 * 一覧に出す金額の出どころ。
 * reference: ライト版AIの候補価格（＝参考価格）
 * sale: 登録済みの販売価格（参考価格が未取得のときの代替表示）
 * 値そのものは商品データから変えず、どちらの金額かを画面で区別できるようにする。
 */
export type ReferencePriceSource = "reference" | "sale";

/**
 * 一覧に出す金額と、その出どころを返す。
 * 参考価格と販売価格を同じものとして見せないための判定をここ1か所に集約する。
 */
export function resolveReferencePriceWithSource(
  product: AdminProduct,
  info: PokecaLightProductInfo | undefined
): { value: number | null; source: ReferencePriceSource | null } {
  const candidate = info?.candidatePrice;
  if (
    typeof candidate === "number" &&
    Number.isFinite(candidate) &&
    candidate > 0
  ) {
    return { value: candidate, source: "reference" };
  }
  const planned = product.planned_sale_price;
  if (typeof planned === "number" && Number.isFinite(planned) && planned > 0) {
    return { value: planned, source: "sale" };
  }
  return { value: null, source: null };
}

/**
 * ライト版AIの整備状況の集計。
 *
 * 価格は status 応答トップレベルの集計値（price_found_count）を優先して使う。
 * 商品別の items[] には価格フィールドが含まれない場合があるため、items 由来の集計は
 * 集計値が無いときのフォールバックに留める（0件と誤表示しないため）。
 * 作家は商品別情報（items[]）を優先し、無ければ集計値（illustrator_counts）を使う。
 */
export interface PokecaLightCoverage {
  /** 集計できた件数（対象件数を基準にする） */
  known: number | null;
  /** 対象件数 */
  total: number | null;
  priced: number | null;
  unpriced: number | null;
  /** 価格カバレッジ（％・小数第1位）。算出できない場合は null */
  priceRate: number | null;
  authorKnown: number | null;
  authorMissing: number | null;
  authorList: Array<{ illustrator: string; count: number }>;
  source: "items" | "worker";
}

/**
 * パネルの整備状況を組み立てる。
 * 価格はサーバーの集計値、作家は商品別情報を優先し、どちらも無い場合は null。
 */
export function buildLightCoverage(
  worker: PokecaLightWorkerState | null,
  products: AdminProduct[],
  infoMap: PokecaLightInfoMap
): PokecaLightCoverage | null {
  // 商品別情報から数えられる範囲（価格・作家のフォールバック用）
  let itemsKnown = 0;
  let itemsPriced = 0;
  let itemsAuthorKnown = 0;
  const authors = new Map<string, number>();

  products.forEach((product) => {
    const info = infoMap.get(product.product_id);
    // 商品別情報に含まれない商品は「未取得」なので集計しない
    if (!info) return;
    itemsKnown += 1;
    if (
      info.candidatePrice !== null &&
      Number.isFinite(info.candidatePrice) &&
      info.candidatePrice > 0
    ) {
      itemsPriced += 1;
    }
    if (info.illustrator) {
      itemsAuthorKnown += 1;
      authors.set(info.illustrator, (authors.get(info.illustrator) ?? 0) + 1);
    }
  });

  const storageTotal = products.length;
  const targetTotal =
    worker && worker.totalCount > 0 ? worker.totalCount : storageTotal;
  const known = targetTotal > 0 ? targetTotal : itemsKnown || null;
  if (known === null) return null;

  // 価格: status 応答トップレベルの集計値を優先（items には価格が含まれない場合がある）
  const aggregatePriced = worker?.priceFoundCount ?? null;
  let priced: number | null = null;
  if (aggregatePriced !== null) {
    priced = Math.max(0, Math.min(aggregatePriced, known));
  } else if (itemsKnown > 0) {
    priced = itemsPriced;
  }
  const unpriced =
    priced === null ? null : Math.max(0, known - priced);
  const priceRate =
    priced === null || known <= 0
      ? null
      : Math.round((priced / known) * 1000) / 10;

  // 作家: 商品別情報を優先し、無ければサーバーの集計値（illustrator_counts）
  let authorList = Array.from(authors.entries())
    .map(([illustrator, count]) => ({ illustrator, count }))
    .sort(
      (a, b) => b.count - a.count || a.illustrator.localeCompare(b.illustrator)
    );
  let authorKnown: number | null = itemsAuthorKnown > 0 ? itemsAuthorKnown : null;

  if (authorKnown === null && worker && worker.illustratorCounts.length > 0) {
    authorList = worker.illustratorCounts;
    authorKnown = authorList.reduce((sum, entry) => sum + entry.count, 0);
  }
  const authorMissing =
    authorKnown === null ? null : Math.max(0, known - authorKnown);

  if (priced === null && authorList.length === 0) return null;

  return {
    known,
    total: targetTotal > 0 ? targetTotal : null,
    priced,
    unpriced,
    priceRate,
    authorKnown,
    authorMissing,
    authorList,
    source: aggregatePriced !== null ? "worker" : "items",
  };
}

/**
 * 一覧の並び順。
 * position: 既定（箱番・枝番の順）
 * price_*: 一覧に表示している参考価格
 * created_*: 登録日時（商品の作成日時）
 */
export type StorageSortKey =
  | "position"
  | "name"
  | "price_desc"
  | "price_asc"
  | "created_desc"
  | "created_asc";

// 箱番・枝番は「BOX2」と「BOX10」のような数字入りの値を数値として比較する。
const NATURAL_OPTIONS: Intl.CollatorOptions = {
  numeric: true,
  sensitivity: "base",
};

function comparePosition(a: AdminProduct, b: AdminProduct): number {
  const pa = parseStoragePosition(a.storage_location);
  const pb = parseStoragePosition(b.storage_location);

  // 箱番が無い商品は末尾にまとめる。
  if (!pa.box && pb.box) return 1;
  if (pa.box && !pb.box) return -1;

  const box = pa.box.localeCompare(pb.box, "ja", NATURAL_OPTIONS);
  if (box !== 0) return box;

  // 枝番が無い商品は、同じ箱の中で先頭に置く。
  if (!pa.branch && pb.branch) return -1;
  if (pa.branch && !pb.branch) return 1;

  const branch = pa.branch.localeCompare(pb.branch, "ja", NATURAL_OPTIONS);
  if (branch !== 0) return branch;

  return a.product_id.localeCompare(b.product_id, "ja", NATURAL_OPTIONS);
}

function readCreatedAt(product: AdminProduct): number | null {
  if (!product.created_at) return null;
  const time = Date.parse(product.created_at);
  return Number.isFinite(time) ? time : null;
}

/**
 * 一覧の並べ替え。取得済みの商品配列をコピーして並べ替えるだけで、
 * 商品データ自体は変更しない。
 *
 * - 既定（position）は箱番・枝番の順
 * - 価格・登録日時が無い商品は、昇順・降順どちらでも末尾に置く
 * - 同値のときは箱番・枝番の順で並べ、表示順を安定させる
 */
export function sortStorageProducts(
  products: AdminProduct[],
  sortKey: StorageSortKey,
  infoMap: PokecaLightInfoMap
): AdminProduct[] {
  const list = [...products];
  if (sortKey === "position") return list.sort(comparePosition);

  // 商品名順。名前が空の商品は末尾にまとめ、同名列は箱番・枝番の順で固定する。
  if (sortKey === "name") {
    return list.sort((a, b) => {
      const nameA = (a.product_name || "").trim();
      const nameB = (b.product_name || "").trim();
      if (!nameA && nameB) return 1;
      if (nameA && !nameB) return -1;
      if (nameA !== nameB) {
        return nameA.localeCompare(nameB, "ja", NATURAL_OPTIONS);
      }
      return comparePosition(a, b);
    });
  }

  if (sortKey === "price_desc" || sortKey === "price_asc") {
    const direction = sortKey === "price_desc" ? -1 : 1;
    return list.sort((a, b) => {
      const priceA = resolveReferencePrice(a, infoMap.get(a.product_id));
      const priceB = resolveReferencePrice(b, infoMap.get(b.product_id));
      if (priceA === null && priceB === null) return comparePosition(a, b);
      if (priceA === null) return 1;
      if (priceB === null) return -1;
      if (priceA !== priceB) return (priceA - priceB) * direction;
      return comparePosition(a, b);
    });
  }

  const direction = sortKey === "created_desc" ? -1 : 1;
  return list.sort((a, b) => {
    const timeA = readCreatedAt(a);
    const timeB = readCreatedAt(b);
    if (timeA === null && timeB === null) return comparePosition(a, b);
    if (timeA === null) return 1;
    if (timeB === null) return -1;
    if (timeA !== timeB) return (timeA - timeB) * direction;
    return comparePosition(a, b);
  });
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