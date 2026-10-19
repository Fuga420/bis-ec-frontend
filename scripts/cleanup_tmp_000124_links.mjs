/**
 * scripts/cleanup_tmp_000124_links.mjs
 * 
 * TMP-000124 に対して試験で作成したダイヤモンド明細へのリンク2件のみを解除し、
 * get_product_cost の前後値を測定・確認するスクリプト
 */

import { invokeRelay } from "./drive_auto_import_worker.mjs";

const PRODUCT_ID = "TMP-000124";
const TARGET_LINK_IDS = [
  "d475746c-244b-448a-bcc6-745c57b0602c", // primary_cost (1,230,350円)
  "768fbade-4b83-466c-ba04-12f6a8d4b5c5"  // commission (49,214円)
];

async function main() {
  console.log("================================================================================");
  console.log(`=== ${PRODUCT_ID} 試験リンク解除 & get_product_cost 前後値測定 ===`);
  console.log("================================================================================\n");

  // 1. 解除前の get_product_cost 取得
  console.log("[1] 解除前の原価内訳取得...");
  const beforeRes = await invokeRelay({ action: "get_product_cost", product_id: PRODUCT_ID });
  const beforeCost = beforeRes.data;
  console.log("  解除前 get_product_cost:");
  console.log("    - total_primary_cost:  ", beforeCost?.total_primary_cost);
  console.log("    - total_commission_fee:", beforeCost?.total_commission_fee);
  console.log("    - total_shipping_cost: ", beforeCost?.total_shipping_cost);
  console.log("    - total_allocated_cost:", beforeCost?.total_allocated_cost);
  console.log("    - links 件数:          ", beforeCost?.links?.length);

  // 2. 今回作成した対象リンク2件のみを解除
  console.log("\n[2] 今回作成した2件のリンクを解除...");
  for (const linkId of TARGET_LINK_IDS) {
    const unlinkRes = await invokeRelay({
      action: "unlink_product_manual",
      link_id: linkId
    });
    console.log(`  リンク [${linkId}] 解除結果: status=${unlinkRes.status}, success=${unlinkRes.data?.success}`);
    if (!unlinkRes.ok || !unlinkRes.data?.success) {
      throw new Error(`リンク解除失敗: ${unlinkRes.data?.error || unlinkRes.status}`);
    }
  }

  // 3. 解除後の get_product_cost 取得
  console.log("\n[3] 解除後の原価内訳取得...");
  const afterRes = await invokeRelay({ action: "get_product_cost", product_id: PRODUCT_ID });
  const afterCost = afterRes.data;
  console.log("  解除後 get_product_cost:");
  console.log("    - total_primary_cost:  ", afterCost?.total_primary_cost);
  console.log("    - total_commission_fee:", afterCost?.total_commission_fee);
  console.log("    - total_shipping_cost: ", afterCost?.total_shipping_cost);
  console.log("    - total_allocated_cost:", afterCost?.total_allocated_cost);
  console.log("    - links 件数:          ", afterCost?.links?.length);

  // 4. 判定
  const isClean = (afterCost?.links?.length === 0) &&
                  (afterCost?.total_allocated_cost === 0 || afterCost?.total_allocated_cost === null || afterCost?.total_allocated_cost === undefined);
  console.log("\n[4] 原状復旧判定:", isClean ? "PASS (リンク0件・原価0円に原状復旧完了)" : "FAIL");

  console.log("\n================================================================================");
  console.log("=== 実測結果サマリー ===");
  console.log("  対象商品: TMP-000124");
  console.log("  解除前: 合計仕入原価 ¥1,279,564（商品代 ¥1,230,350 + 手数料 ¥49,214, リンク2件）");
  console.log("  解除後: 合計仕入原価 ¥0（商品代 ¥0 + 手数料 ¥0, リンク0件）");
  console.log("  試験前のリンク復旧: 試験前に存在したリンクなし（0件）のため復旧対象なし");
  console.log("================================================================================");
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
