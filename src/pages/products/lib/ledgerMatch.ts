import { getSupabaseClient } from "@/lib/supabaseClient";

/**
 * 商品一覧の「仕入照合」列の判定（表示専用）。
 *
 * 商品一覧APIは照合情報を返さないため、表示中の1ページ分の商品IDをまとめて
 * 既存の書類台帳テーブル（読み取り専用・anon SELECT可）から1回だけ引く。
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
 * 表示中の商品IDに対する紐付け状態を1回のまとめ読みで解決する。
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

  const client = getSupabaseClient();
  if (!client) {
    throw new Error("BACKEND_NOT_CONNECTED");
  }

  // 対象商品の有効な紐付け（status が空 か "confirmed"）をまとめて取得する。
  const matchedProductIds = new Set<string>();
  for (const ids of chunk(targets, ID_CHUNK_SIZE)) {
    const { data, error } = await client
      .from("document_product_links")
      .select("product_id, document_line_id, status, is_deleted")
      .in("product_id", ids)
      .eq("is_deleted", false);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as RelayRecord[]) {
      const productId = asString(row.product_id).trim();
      if (productId === "") continue;
      const status = asString(row.status);
      // 紐付けは status が空 か "confirmed" のものだけを有効として扱う
      // （商品詳細の仕入内訳と同じ条件）。
      if (status !== "" && status !== "confirmed") continue;
      matchedProductIds.add(productId);
    }
  }

  targets.forEach((id) => {
    result.set(id, matchedProductIds.has(id) ? "matched" : "unlinked");
  });

  return result;
}