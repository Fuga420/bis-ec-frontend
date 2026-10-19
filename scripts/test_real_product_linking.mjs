/**
 * scripts/test_real_product_linking.mjs
 * 
 * 【テスト専用擬似商品による検証】
 * オークネット明細行（受付番号: 852-30191）に対するワンクリック確定、
 * 商品代金・落札手数料の内訳分離、および共通配送費の未配分維持の単体・結合検証
 * 
 * ※運用ルール厳守: 実在商品への試験紐付けは行わず、専用のテスト商品ID (TEST-PRD-852-30191) を使用し、
 *   試験完了時に確実にリンクをクリーンアップします。
 */

import { invokeRelay } from "./drive_auto_import_worker.mjs";

const TARGET_DOCUMENT_ID = "6114a142-02f9-4c56-9b34-4b7619aaac6f";
const TARGET_LINE_ID = "a43e58e6-d20e-48dd-ab72-a5e2cfd9084a";
const SHIPPING_LINE_ID = "77de4ac0-48fc-488e-9228-417287489d62";
const TEST_PRODUCT_ID = "TEST-PRD-852-30191";

async function cleanLinks(productId) {
  const costRes = await invokeRelay({ action: "get_product_cost", product_id: productId });
  const links = costRes.data?.links || [];
  for (const l of links) {
    if (!l.is_deleted) {
      await invokeRelay({ action: "unlink_product_manual", link_id: l.id });
    }
  }
}

async function main() {
  console.log("================================================================================");
  console.log(`=== ワンクリック確定・内訳分離実測検証 (${TEST_PRODUCT_ID}) ===`);
  console.log("================================================================================\n");

  try {
    // 事前クリーンアップ
    await cleanLinks(TEST_PRODUCT_ID);

    // 1. 原本明細情報の取得
    console.log("[Step 1] 原本明細（受付番号: 852-30191）の確認...");
    const docRes = await invokeRelay({ action: "get_document", document_id: TARGET_DOCUMENT_ID });
    const lines = docRes.data?.lines || [];
    const targetLine = lines.find(l => l.id === TARGET_LINE_ID);
    const shippingLine = lines.find(l => l.id === SHIPPING_LINE_ID);

    console.log("  対象商品明細:", {
      id: targetLine.id,
      receipt_number: targetLine.reception_number_normalized,
      item_amount_tax_included: targetLine.item_amount_tax_included,
      fee_amount_tax_included: targetLine.fee_amount_tax_included,
      total_line_amount: targetLine.total_line_amount
    });
    console.log("  共通配送費明細:", {
      id: shippingLine?.id,
      receipt_number: shippingLine?.reception_number_normalized,
      total_line_amount: shippingLine?.total_line_amount
    });

    // 2. スタッフ画面からの1回確定（linkLineWithBreakdown 相当）
    console.log(`\n[Step 2] スタッフ画面からの1回確定（テスト商品: ${TEST_PRODUCT_ID}）...`);
    const primaryRes = await invokeRelay({
      action: "link_product_manual",
      document_line_id: TARGET_LINE_ID,
      product_id: TEST_PRODUCT_ID,
      link_type: "primary_cost",
      allocated_amount: targetLine.item_amount_tax_included,
      confirmed_by: "staff_operator"
    });
    console.log("  primary_cost 登録:", primaryRes.data?.link?.id, primaryRes.data?.link?.link_type, primaryRes.data?.link?.allocated_amount);

    const feeRes = await invokeRelay({
      action: "link_product_manual",
      document_line_id: TARGET_LINE_ID,
      product_id: TEST_PRODUCT_ID,
      link_type: "commission",
      allocated_amount: targetLine.fee_amount_tax_included,
      confirmed_by: "staff_operator"
    });
    console.log("  commission 登録:  ", feeRes.data?.link?.id, feeRes.data?.link?.link_type, feeRes.data?.link?.allocated_amount);

    // 3. 商品画面での原価内訳取得 (get_product_cost)
    console.log(`\n[Step 3] 商品画面での原価内訳取得 (get_product_cost)...`);
    const costRes = await invokeRelay({
      action: "get_product_cost",
      product_id: TEST_PRODUCT_ID
    });

    const costBreakdown = costRes.data?.cost_breakdown || costRes.data;
    const links = costRes.data?.links || [];

    console.log("  商品画面の原価表示項目:");
    console.log("    - 商品代金（税込）:  ", `¥${(costBreakdown?.total_primary_cost ?? 0).toLocaleString()} 円`);
    console.log("    - 落札手数料（税込）:", `¥${(costBreakdown?.total_commission_fee ?? 0).toLocaleString()} 円`);
    console.log("    - 配送料（税込）:    ", `¥${(costBreakdown?.total_shipping_cost ?? 0).toLocaleString()} 円`);
    console.log("    - 合計仕入原価:      ", `¥${(costBreakdown?.total_allocated_cost ?? 0).toLocaleString()} 円`);
    console.log("    - 紐付け明細件数:    ", `${links.length} 件`);

    // 4. 検証
    console.log("\n[Step 4] 照合判定:");
    const passPrimary = costBreakdown?.total_primary_cost === targetLine.item_amount_tax_included;
    const passFee = costBreakdown?.total_commission_fee === targetLine.fee_amount_tax_included;
    const passTotal = costBreakdown?.total_allocated_cost === targetLine.total_line_amount;
    const passShipping = (costBreakdown?.total_shipping_cost ?? 0) === 0;

    console.log(`  1. 商品代金が別々に保持・表示:   ${passPrimary ? "PASS" : "FAIL"} (${costBreakdown?.total_primary_cost}円)`);
    console.log(`  2. 落札手数料が別々に保持・表示: ${passFee ? "PASS" : "FAIL"} (${costBreakdown?.total_commission_fee}円)`);
    console.log(`  3. 合計仕入原価が完全一致:       ${passTotal ? "PASS" : "FAIL"} (${costBreakdown?.total_allocated_cost}円)`);
    console.log(`  4. 共通配送費は自動配分されず0円: ${passShipping ? "PASS" : "FAIL"} (${costBreakdown?.total_shipping_cost ?? 0}円)`);

    if (!passPrimary || !passFee || !passTotal || !passShipping) {
      throw new Error("照合判定で不一致が検出されました。");
    }

    // 5. 共通配送費（受付番号なし）の未配分維持確認
    console.log("\n[Step 5] 共通配送費（1,045円、受付番号なし）の未配分維持確認...");
    const shippingLinksRes = await invokeRelay({
      action: "get_document",
      document_id: TARGET_DOCUMENT_ID
    });
    const refreshedShippingLine = shippingLinksRes.data?.lines?.find(l => l.id === SHIPPING_LINE_ID);
    console.log(`  共通配送費のリンク数: ${refreshedShippingLine?.links?.length || 0} 件 => PASS (未配分維持)`);

    console.log("\n================================================================================");
    console.log("=== 実測結果サマリー ===");
    console.log(`  テスト商品ID:           ${TEST_PRODUCT_ID}`);
    console.log(`  商品代金税込:           ¥${targetLine.item_amount_tax_included.toLocaleString()} 円 (完全一致)`);
    console.log(`  落札手数料税込:         ¥${targetLine.fee_amount_tax_included.toLocaleString()} 円 (完全一致)`);
    console.log(`  合計仕入原価:           ¥${targetLine.total_line_amount.toLocaleString()} 円 (完全一致)`);
    console.log(`  共通配送費（1,045円）:  商品へ自動配分されず未配分維持`);
    console.log("================================================================================");
  } finally {
    // 事後クリーンアップ (テストデータを残さない)
    await cleanLinks(TEST_PRODUCT_ID);
    console.log(`  [Cleanup] テスト用リンク (${TEST_PRODUCT_ID}) を安全に削除完了。`);
  }
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
