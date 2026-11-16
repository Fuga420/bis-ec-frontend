import { resolveReferencePrice } from "@/pages/pokeka/lib/rawStorage";
import type { PokecaLightWorkerState } from "@/pages/products/lib/pokecaRawStorageAi";
import type { AdminProduct } from "@/pages/products/types";

/**
 * ライト版AIの結果ビュー用の表示データ。
 *
 * 既存のステータス取得（worker_state と商品別集計）だけで組み立てる。
 * 新しいAPIは呼ばず、取得できていない項目は空欄（null）のまま扱う。
 */

export type PokecaLightResultStatus =
  | "success"
  | "failed"
  | "skipped"
  | "pending";

export interface PokecaLightResultRow {
  productId: string;
  productName: string;
  cardName: string;
  cardNumber: string;
  illustrator: string;
  /**
   * 参考価格。status 応答の items[] に価格が無い場合があるため、
   * 商品IDで一覧の商品データと突き合わせて解決した値を入れる。
   */
  candidatePrice: number | null;
  /** 価格を突き合わせできたか（false のときは「価格なし」と断定しない） */
  priceKnown: boolean;
  status: PokecaLightResultStatus;
  errorMessage: string;
}

const SUCCESS_STATUSES = new Set([
  "success",
  "succeeded",
  "completed",
  "complete",
  "done",
  "ok",
  "applied",
]);
const FAILED_STATUSES = new Set(["failed", "failure", "error", "errored"]);
const SKIPPED_STATUSES = new Set(["skipped", "skip", "excluded", "cancelled"]);

function resolveStatus(
  rawStatus: string,
  hasInfo: boolean,
  hasFailure: boolean,
  isFinished: boolean
): PokecaLightResultStatus {
  if (hasFailure) return "failed";
  const status = rawStatus.trim().toLowerCase();
  if (FAILED_STATUSES.has(status)) return "failed";
  if (SKIPPED_STATUSES.has(status)) return "skipped";
  if (SUCCESS_STATUSES.has(status)) return "success";
  if (status !== "") return "pending";
  // ステータス文字列が無い場合、完了済みジョブで商品別情報が返っていれば処理済みとみなす
  if (hasInfo && isFinished) return "success";
  return "pending";
}

/**
 * 商品別の結果行を作る。
 * 並び順は API が返した対象商品の順（worker.productIds）を優先し、
 * 対象一覧が無い場合は商品別情報の順に並べる。
 *
 * 価格は items[] の候補価格を優先し、無ければ商品IDで突き合わせた商品データから
 * 既存の参考価格の解決規則（下書き価格 → 販売予定価格）で求める。
 * 商品データと突き合わせできない行は priceKnown=false（表示は「—」）。
 */
export function buildPokecaLightResultRows(
  worker: PokecaLightWorkerState,
  products: AdminProduct[] = []
): PokecaLightResultRow[] {
  const infoMap = new Map(worker.items.map((item) => [item.product_id, item]));
  const failureMap = new Map(
    worker.failures.map((failure) => [failure.product_id, failure])
  );
  const productMap = new Map(products.map((product) => [product.product_id, product]));

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  const pushId = (id: string) => {
    const trimmed = (id ?? "").trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    orderedIds.push(trimmed);
  };

  worker.productIds.forEach(pushId);
  worker.items.forEach((item) => pushId(item.product_id));
  worker.failures.forEach((failure) => pushId(failure.product_id));

  const isFinished =
    worker.status === "completed" || worker.status === "failed";

  return orderedIds.map((productId) => {
    const info = infoMap.get(productId);
    const failure = failureMap.get(productId);
    const hasInfo = Boolean(
      info &&
        (info.cardName ||
          info.cardNumber ||
          info.illustrator ||
          info.candidatePrice !== null)
    );

    const errorMessage =
      (failure?.error_message ?? "").trim() ||
      (info?.errorMessage ?? "").trim();

    const product = productMap.get(productId);
    const resolvedPrice = product
      ? resolveReferencePrice(product, info)
      : info?.candidatePrice ?? null;

    return {
      productId,
      productName: (info?.product_name ?? failure?.product_name ?? "").trim(),
      cardName: info?.cardName ?? "",
      cardNumber: info?.cardNumber ?? "",
      illustrator: info?.illustrator ?? "",
      candidatePrice: resolvedPrice,
      priceKnown: Boolean(product) || resolvedPrice !== null,
      status: resolveStatus(
        info?.status ?? "",
        hasInfo,
        Boolean(failure),
        isFinished
      ),
      errorMessage,
    };
  });
}

export interface PokecaLightResultCounts {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  pending: number;
}

/** 結果行の内訳（絞り込みタブの件数に使う）。 */
export function countPokecaLightResultRows(
  rows: PokecaLightResultRow[]
): PokecaLightResultCounts {
  const counts: PokecaLightResultCounts = {
    total: rows.length,
    success: 0,
    failed: 0,
    skipped: 0,
    pending: 0,
  };
  rows.forEach((row) => {
    counts[row.status] += 1;
  });
  return counts;
}

/** 参考価格の有無（商品別情報が無い場合は API の集計値で数える）。 */
export function countPokecaLightPrices(worker: PokecaLightWorkerState): {
  known: number;
  priced: number;
  unpriced: number;
} {
  let priced = 0;
  let unpriced = 0;
  worker.items.forEach((item) => {
    if (item.candidatePrice !== null && Number.isFinite(item.candidatePrice)) {
      priced += 1;
    } else {
      unpriced += 1;
    }
  });
  const itemKnown = priced + unpriced;

  // items[] に価格が含まれない応答があるため、集計値（price_found_count）があれば
  // 対象件数を基準に内訳を作る（items 由来の集計はフォールバック）。
  if (worker.priceFoundCount !== null) {
    const total = worker.totalCount > 0 ? worker.totalCount : worker.processedCount;
    const base = Math.max(worker.processedCount, worker.priceFoundCount, itemKnown);
    const known = total > 0 ? Math.min(base, total) : base;
    const pricedCount = Math.max(0, Math.min(worker.priceFoundCount, known));
    return {
      known,
      priced: pricedCount,
      unpriced: Math.max(0, known - pricedCount),
    };
  }

  return { known: itemKnown, priced, unpriced };
}

/** 再実行の対象になる失敗商品ID（重複なし）。 */
export function pickFailedProductIds(
  rows: PokecaLightResultRow[]
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  rows.forEach((row) => {
    if (row.status !== "failed") return;
    if (!row.productId || seen.has(row.productId)) return;
    seen.add(row.productId);
    ids.push(row.productId);
  });
  return ids;
}