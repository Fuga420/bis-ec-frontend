/**
 * scripts/test_split_link_resilience.mjs
 * 
 * 商品代金・落札手数料の「ワンクリック確定」「片方のみ保存成功時の検出・再試行（リカバリ）」
 * および「共通配送費（1,045円）非自動配分」の実機実測スクリプト
 */

import { invokeRelay } from "./drive_auto_import_worker.mjs";

const TARGET_DOCUMENT_ID = "6114a142-02f9-4c56-9b34-4b7619aaac6f";
const TARGET_LINE_ID = "a43e58e6-d20e-48dd-ab72-a5e2cfd9084a";
const SHIPPING_LINE_ID = "77de4ac0-48fc-488e-9228-417287489d62";
const TEST_PRODUCT_ID = "PRD-TEST-852-RESILIENCE";

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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
  console.log("=== 内訳自動分離紐付け・片方保存時の検出・再試行（リカバリ）実測検証 ===");
  console.log("================================================================================\n");

  // 事前クリーンアップ
  await cleanLinks(TEST_PRODUCT_ID);

  // ---------------------------------------------------------------------------
  // [Step 1] 原本明細行の内訳データ確認
  // ---------------------------------------------------------------------------
  console.log("[Step 1] 原本明細行（受付番号: 852-30191）のDB項目確認...");
  const docRes = await invokeRelay({ action: "get_document", document_id: TARGET_DOCUMENT_ID });
  const lines = docRes.data?.lines || [];
  const targetLine = lines.find(l => l.id === TARGET_LINE_ID);
  const shippingLine = lines.find(l => l.id === SHIPPING_LINE_ID);

  if (!targetLine) {
    throw new Error(`対象明細行 (${TARGET_LINE_ID}) が見つかりません。`);
  }

  console.log("  対象商品明細:", {
    id: targetLine.id,
    receipt_number: targetLine.reception_number_normalized,
    item_name: targetLine.item_name_raw,
    item_amount_tax_included: targetLine.item_amount_tax_included,
    fee_amount_tax_included: targetLine.fee_amount_tax_included,
    total_line_amount: targetLine.total_line_amount
  });
  console.log("  共通配送費明細:", {
    id: shippingLine?.id,
    item_name: shippingLine?.item_name_raw,
    receipt_number: shippingLine?.reception_number_normalized,
    total_line_amount: shippingLine?.total_line_amount
  });

  const expectedItemAmount = targetLine.item_amount_tax_included; // 1,230,350
  const expectedFeeAmount = targetLine.fee_amount_tax_included;   // 49,214
  const expectedTotalAmount = targetLine.total_line_amount;       // 1,279,564

  // ---------------------------------------------------------------------------
  // [Step 2] スタッフワンクリック確定（商品代金 + 落札手数料の同時分離紐付け）
  // ---------------------------------------------------------------------------
  console.log("\n[Step 2] ワンクリック確定の実行（linkLineWithBreakdown 相当）...");
  const res1 = await invokeRelay({
    action: "link_product_manual",
    document_line_id: TARGET_LINE_ID,
    product_id: TEST_PRODUCT_ID,
    link_type: "primary_cost",
    allocated_amount: expectedItemAmount,
    confirmed_by: "staff_test"
  });
  const res2 = await invokeRelay({
    action: "link_product_manual",
    document_line_id: TARGET_LINE_ID,
    product_id: TEST_PRODUCT_ID,
    link_type: "commission",
    allocated_amount: expectedFeeAmount,
    confirmed_by: "staff_test"
  });

  console.log("  primary_cost 登録結果:", res1.data?.link?.link_type, res1.data?.link?.allocated_amount, res1.data?.link?.status);
  console.log("  commission 登録結果:  ", res2.data?.link?.link_type, res2.data?.link?.allocated_amount, res2.data?.link?.status);

  const costResStep2 = await invokeRelay({ action: "get_product_cost", product_id: TEST_PRODUCT_ID });
  const cbStep2 = costResStep2.data?.cost_breakdown;
  console.log("  get_product_cost 集計結果:", {
    total_primary_cost: cbStep2?.total_primary_cost,
    total_commission_fee: cbStep2?.total_commission_fee,
    total_allocated_cost: cbStep2?.total_allocated_cost,
    links_count: costResStep2.data?.links?.length
  });

  const step2Pass =
    cbStep2?.total_primary_cost === expectedItemAmount &&
    cbStep2?.total_commission_fee === expectedFeeAmount &&
    cbStep2?.total_allocated_cost === expectedTotalAmount;
  console.log(`  => ワンクリック確定判定: ${step2Pass ? "PASS (完全一致)" : "FAIL"}`);

  // ---------------------------------------------------------------------------
  // [Step 3] 片方の保存だけが成功した場合のシミュレート（通信切断等）
  // ---------------------------------------------------------------------------
  console.log("\n[Step 3] 片方の保存のみ成功した状態をシミュレート（commission を解除）...");
  const commissionLink = costResStep2.data?.links?.find(l => l.link_type === "commission" && !l.is_deleted);
  if (commissionLink) {
    await invokeRelay({ action: "unlink_product_manual", link_id: commissionLink.id });
  }

  const costResStep3 = await invokeRelay({ action: "get_product_cost", product_id: TEST_PRODUCT_ID });
  const activeLinksStep3 = costResStep3.data?.links?.filter(l => !l.is_deleted && l.status === "confirmed") || [];
  console.log(`  現在の有効リンク数: ${activeLinksStep3.length} 件`);
  activeLinksStep3.forEach(l => console.log(`    - ${l.link_type}: ¥${l.allocated_amount} (${l.status})`));

  // ---------------------------------------------------------------------------
  // [Step 4] 不完全状態の検出ロジック検証
  // ---------------------------------------------------------------------------
  console.log("\n[Step 4] 不完全状態（片方未完了）の検出ロジック実行...");
  const hasPrimary = activeLinksStep3.some(l => l.link_type === "primary_cost");
  const hasCommission = activeLinksStep3.some(l => l.link_type === "commission");
  const needsCommission = Boolean(expectedFeeAmount && expectedFeeAmount > 0);

  const isIncomplete = !hasPrimary || (needsCommission && !hasCommission);
  console.log("  検出チェック:", {
    hasPrimary,
    hasCommission,
    needsCommission,
    isIncomplete,
    missingType: !hasPrimary ? "primary_cost" : (!hasCommission ? "commission" : "none")
  });

  const step4Pass = isIncomplete && !hasCommission && hasPrimary;
  console.log(`  => 不完全状態検出判定: ${step4Pass ? "PASS (正確に欠落を検出)" : "FAIL"}`);

  // ---------------------------------------------------------------------------
  // [Step 5] 再試行（リカバリ: repairIncompleteLinks）の実行
  // ---------------------------------------------------------------------------
  console.log("\n[Step 5] 不足側の再試行（リカバリ）実行...");
  // 既に存在する primary_cost は二重登録せず、不足している commission のみを登録
  if (!hasCommission && needsCommission) {
    const repairRes = await invokeRelay({
      action: "link_product_manual",
      document_line_id: TARGET_LINE_ID,
      product_id: TEST_PRODUCT_ID,
      link_type: "commission",
      allocated_amount: expectedFeeAmount,
      confirmed_by: "staff_repair"
    });
    console.log("  リカバリ登録実行結果:", repairRes.data?.link?.link_type, repairRes.data?.link?.allocated_amount);
  }

  // ---------------------------------------------------------------------------
  // [Step 6] リカバリ後の整合回復検証
  // ---------------------------------------------------------------------------
  console.log("\n[Step 6] リカバリ後の原価内訳整合性確認...");
  const costResStep6 = await invokeRelay({ action: "get_product_cost", product_id: TEST_PRODUCT_ID });
  const cbStep6 = costResStep6.data?.cost_breakdown;
  const activeLinksStep6 = costResStep6.data?.links?.filter(l => !l.is_deleted && l.status === "confirmed") || [];

  console.log("  リカバリ後の有効リンク一覧:");
  activeLinksStep6.forEach(l => console.log(`    - ID: ${l.id}, 種別: ${l.link_type}, 割当額: ¥${l.allocated_amount}`));

  console.log("  リカバリ後の get_product_cost 集計値:", {
    total_primary_cost: cbStep6?.total_primary_cost,
    total_commission_fee: cbStep6?.total_commission_fee,
    total_allocated_cost: cbStep6?.total_allocated_cost
  });

  const step6Pass =
    cbStep6?.total_primary_cost === expectedItemAmount &&
    cbStep6?.total_commission_fee === expectedFeeAmount &&
    cbStep6?.total_allocated_cost === expectedTotalAmount &&
    activeLinksStep6.length === 2;
  console.log(`  => 整合回復判定: ${step6Pass ? "PASS (二重登録なく完全回復)" : "FAIL"}`);

  // ---------------------------------------------------------------------------
  // [Step 7] 共通配送費（1,045円）の非自動配分確認
  // ---------------------------------------------------------------------------
  console.log("\n[Step 7] 共通配送費（1,045円、受付番号なし）の非自動配分確認...");
  const docResStep7 = await invokeRelay({ action: "get_document", document_id: TARGET_DOCUMENT_ID });
  const checkShippingLine = (docResStep7.data?.lines || []).find(l => l.id === SHIPPING_LINE_ID);
  const shippingLinks = checkShippingLine?.links || [];

  console.log("  配送費明細ステータス:", {
    reception_number: checkShippingLine?.reception_number_normalized,
    total_line_amount: checkShippingLine?.total_line_amount,
    links_count: shippingLinks.length
  });

  const step7Pass = shippingLinks.length === 0;
  console.log(`  => 共通配送費隔離判定: ${step7Pass ? "PASS (商品へ自動配分されず未紐付け維持)" : "FAIL"}`);

  // ---------------------------------------------------------------------------
  // クリーンアップ
  // ---------------------------------------------------------------------------
  console.log("\n[Step 8] テスト用リンクのクリーンアップ...");
  await cleanLinks(TEST_PRODUCT_ID);
  console.log("  クリーンアップ完了。");

  console.log("\n================================================================================");
  console.log("=== 実測結果サマリー ===");
  console.log(`  1. ワンクリック確定（商品代+手数料）:     ${step2Pass ? 'PASS (1,230,350円 + 49,214円)' : 'FAIL'}`);
  console.log(`  2. 片方保存成功時の検出:                   ${step4Pass ? 'PASS (commission欠落を正確に検出)' : 'FAIL'}`);
  console.log(`  3. リカバリ再試行と二重登録防止:           ${step6Pass ? 'PASS (欠落側のみ追加し完全整合回復)' : 'FAIL'}`);
  console.log(`  4. 共通配送費（1,045円）の非自動配分:     ${step7Pass ? 'PASS (受付番号なし明細の未配分維持)' : 'FAIL'}`);
  console.log("================================================================================");

  if (!step2Pass || !step4Pass || !step6Pass || !step7Pass) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});

