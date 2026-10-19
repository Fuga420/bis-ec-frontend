/**
 * scripts/inspect_tmp_000124_links.mjs
 * 
 * TMP-000124 に関連するすべての document_product_links レコード（is_deleted 含む）
 * および変更履歴を徹底調査するスクリプト
 */

import { invokeRelay, CONFIG } from "./drive_auto_import_worker.mjs";

const PRODUCT_ID = "TMP-000124";

async function main() {
  console.log("================================================================================");
  console.log(`=== ${PRODUCT_ID} の document_product_links & 履歴 調査 ===`);
  console.log("================================================================================\n");

  // 1. get_product_cost による現在の有効リンクと集計
  console.log("[1] get_product_cost による照会...");
  const costRes = await invokeRelay({ action: "get_product_cost", product_id: PRODUCT_ID });
  console.log("  get_product_cost status:", costRes.status, costRes.ok);
  console.log("  集計値:", {
    total_primary_cost: costRes.data?.total_primary_cost,
    total_commission_fee: costRes.data?.total_commission_fee,
    total_shipping_cost: costRes.data?.total_shipping_cost,
    total_allocated_cost: costRes.data?.total_allocated_cost,
    links_count: costRes.data?.links?.length
  });
  console.log("  現在の有効リンク一覧:");
  for (const l of costRes.data?.links || []) {
    console.log("    - リンクID:", l.id);
    console.log("      明細ID:", l.document_line_id);
    console.log("      種別:", l.link_type);
    console.log("      金額:", l.allocated_amount);
    console.log("      作成日時:", l.created_at);
    console.log("      削除日時:", l.deleted_at);
    console.log("      is_deleted:", l.is_deleted);
    console.log("      confirmed_by:", l.confirmed_by);
    console.log("      notes:", l.notes);
  }

  // 2. Supabase PostgREST API で document_product_links を全件（is_deleted 問わず）取得
  console.log("\n[2] PostgREST 直接照会: document_product_links (product_id = eq.TMP-000124)...");
  try {
    const url = `${CONFIG.supabaseUrl}/rest/v1/document_product_links?product_id=eq.${PRODUCT_ID}&select=*`;
    const res = await fetch(url, {
      headers: {
        "apikey": CONFIG.supabaseAnonKey,
        "Authorization": `Bearer ${CONFIG.supabaseAnonKey}`
      }
    });
    console.log("  PostgREST status:", res.status);
    if (res.ok) {
      const allLinks = await res.json();
      console.log(`  全リンクレコード件数: ${allLinks.length} 件`);
      for (const [i, link] of allLinks.entries()) {
        console.log(`\n  --- リンク [${i + 1}/${allLinks.length}] ---`);
        console.log("    ID:", link.id);
        console.log("    document_line_id:", link.document_line_id);
        console.log("    product_id:", link.product_id);
        console.log("    link_type:", link.link_type);
        console.log("    allocated_amount:", link.allocated_amount);
        console.log("    is_deleted:", link.is_deleted);
        console.log("    confirmed_by:", link.confirmed_by);
        console.log("    created_at:", link.created_at);
        console.log("    updated_at:", link.updated_at);
        console.log("    deleted_at:", link.deleted_at);
        console.log("    notes:", link.notes);
      }
    } else {
      console.warn("  PostgREST 照会失敗:", await res.text());
    }
  } catch (err) {
    console.warn("  PostgREST 照会例外:", err.message);
  }

  // 3. 履歴テーブル（もし存在すれば）の照会
  console.log("\n[3] 履歴テーブル照会試行...");
  const candidateHistoryTables = [
    "document_product_link_history",
    "document_product_links_history",
    "document_links_history",
    "product_cost_history"
  ];
  for (const tbl of candidateHistoryTables) {
    try {
      const url = `${CONFIG.supabaseUrl}/rest/v1/${tbl}?product_id=eq.${PRODUCT_ID}&select=*`;
      const res = await fetch(url, {
        headers: {
          "apikey": CONFIG.supabaseAnonKey,
          "Authorization": `Bearer ${CONFIG.supabaseAnonKey}`
        }
      });
      if (res.ok) {
        const history = await res.json();
        console.log(`  テーブル [${tbl}]: ${history.length} 件`);
        if (history.length > 0) {
          console.log("  履歴内容:", JSON.stringify(history, null, 2));
        }
      }
    } catch {
      // ignore
    }
  }

  console.log("\n================================================================================");
  console.log("=== 調査完了 ===");
  console.log("================================================================================");
}

main().catch(err => {
  console.error("調査エラー:", err);
  process.exit(1);
});

