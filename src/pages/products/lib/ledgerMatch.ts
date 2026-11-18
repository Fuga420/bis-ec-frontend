import { PRODUCTS_READ_API_URL } from "@/config/productsApi";
import { getAdminReadHeaders, notifyAdminUnauthorized } from "@/lib/adminAuth";

/**
 * 商品一覧の「仕入照合」列の判定（表示専用）。
 *
 * 商品一覧APIは照合情報を返さないため、表示中の1ページ分の商品IDをまとめて
 * Cloud Run `/documents`（`check_product_ledger_match`）から1回だけ引く。
 * 商品ごとに `get_product_cost` を呼ぶことはしない（追加通信は1ページ1回）。
 *
 * 判定（業務上の簡易定義）:
 *  - 紐付け = document_product_links（is_deleted=false / status が空 or "confirmed"）
 *  - 有効な紐付けが1件でもあれば「照合済み」
 *  - 紐付けが無い → 「未照合」
 */
export type LedgerMatchStatus = "matched" | "needs_check" | "unlinked";

type RelayRecord = Record<string, unknown>;

// IDのIN句が長くなりすぎないよう分割して問い合わせる。
const ID_CHUNK_SIZE = 100;

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * 表示中の商品IDに対する紐付け状態をまとめ読みで解決する。
 * 取得できなかった商品は Map に含めない（＝呼び出し側で「—」表示にする）。
 */
export async function fetchProductLedgerMatch(
  productIds: string[]
): Promise<Map<string, LedgerMatchStatus>> {
  const result = new Map<string, LedgerMatchStatus>();
  const targets = Array.from(new Set(productIds.map((id) => id.trim()))).filter(
    (id) => id !== ""
  );
  if (targets.length === 0) return result;

  if (!PRODUCTS_READ_API_URL) {
    throw new Error("BACKEND_NOT_CONNECTED");
  }

  // 対象商品の有効な紐付け（status が空 か "confirmed"）をまとめて取得する。
  const matchedProductIds = new Set<string>();
  for (const ids of chunk(targets, ID_CHUNK_SIZE)) {
    const response = await fetch(`${PRODUCTS_READ_API_URL}/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...getAdminReadHeaders(),
      },
      body: JSON.stringify({
        action: "check_product_ledger_match",
        product_ids: ids,
      }),
    });
    if (response.status === 401) {
      notifyAdminUnauthorized();
    }
    const payload = ((await response.json().catch(() => ({}))) ??
      {}) as RelayRecord;
    if (!response.ok || payload.success !== true) {
      throw new Error(
        asString(payload.message) ||
          asString(payload.error) ||
          `HTTP ${response.status}`
      );
    }

    const matchedIds = Array.isArray(payload.matched_product_ids)
      ? payload.matched_product_ids
      : [];
    for (const rawId of matchedIds) {
      const pid = asString(rawId).trim();
      if (pid) matchedProductIds.add(pid);
    }
  }

  targets.forEach((id) => {
    result.set(id, matchedProductIds.has(id) ? "matched" : "unlinked");
  });

  return result;
}