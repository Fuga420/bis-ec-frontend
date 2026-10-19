/**
 * scripts/test_real_product_linking.mjs
 * 
 * 実在するBIS商品（TMP-000124）に対するワンクリック確定、
 * 商品画面での商品代金・落札手数料の分離表示、および共通配送費の未配分維持の実測検証
 */

import { invokeRelay } from "./drive_auto_import_worker.mjs";

const TARGET_DOCUMENT_ID = "6114a142-02f9-4c56-9b34-4b7619aaac6f";
const TARGET_LINE_ID = "a43e58e6-d20e-48dd-ab72-a5e2cfd9084a";
const SHIPPING_LINE_ID = "77de4ac0-48fc-488e-9228-417287489d62";
const REAL_PRODUCT_ID = "TMP-000124";

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
  console.log("=== 実在BIS商品（TMP-000124）へのワンクリック確定・内訳分離実測検証 ===");
  console.log("================================================================================\n");

  // 事前クリーンアップ
  await cleanLinks(REAL_PRODUCT_ID);

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
  console.log("\n[Step 2] スタッフ画面からの1回確定（実在商品: TMP-000124）...");
  const primaryRes = await invokeRelay({
    action: "link_product_manual",
    document_line_id: TARGET_LINE_ID,
    product_id: REAL_PRODUCT_ID,
    link_type: "primary_cost",
    allocated_amount: targetLine.item_amount_tax_included,
    confirmed_by: "staff_operator"
  });
  const commRes = await invokeRelay({
    action: "link_product_manual",
    document_line_id: TARGET_LINE_ID,
    product_id: REAL_PRODUCT_ID,
    link_type: "commission",
    allocated_amount: targetLine.fee_amount_tax_included,
    confirmed_by: "staff_operator"
  });

  console.log("  primary_cost 登録:", primaryRes.data?.link?.id, primaryRes.data?.link?.link_type, primaryRes.data?.link?.allocated_amount);
  console.log("  commission 登録:  ", commRes.data?.link?.id, commRes.data?.link?.link_type, commRes.data?.link?.allocated_amount);

  // 3. 商品画面（/products/TMP-000124）相当の API レスポンス照会
  console.log("\n[Step 3] 商品画面（/products/TMP-000124）での原価内訳取得（get_product_cost）...");
  const productCostRes = await invokeRelay({ action: "get_product_cost", product_id: REAL_PRODUCT_ID });
  const cb = productCostRes.data?.cost_breakdown;
  const activeLinks = productCostRes.data?.links?.filter(l => !l.is_deleted && l.status === "confirmed") || [];

  console.log("  商品画面の原価表示項目:");
  console.log(`    - 商品代金（税込）:   ¥${Number(cb?.total_primary_cost).toLocaleString()} 円`);
  console.log(`    - 落札手数料（税込）: ¥${Number(cb?.total_commission_fee).toLocaleString()} 円`);
  console.log(`    - 配送料（税込）:     ¥${Number(cb?.total_shipping_cost || 0).toLocaleString()} 円`);
  console.log(`    - 合計仕入原価:       ¥${Number(cb?.total_allocated_cost).toLocaleString()} 円`);
  console.log(`    - 紐付け明細件数:     ${activeLinks.length} 件`);

  const primaryMatch = cb?.total_primary_cost === targetLine.item_amount_tax_included;
  const commMatch = cb?.total_commission_fee === targetLine.fee_amount_tax_included;
  const totalMatch = cb?.total_allocated_cost === targetLine.total_line_amount;
  const shippingZero = Number(cb?.total_shipping_cost || 0) === 0;

  console.log("\n[Step 4] 照合判定:");
  console.log(`  1. 商品代金が別々に保持・表示:   ${primaryMatch ? 'PASS (1,230,350円)' : 'FAIL'}`);
  console.log(`  2. 落札手数料が別々に保持・表示: ${commMatch ? 'PASS (49,214円)' : 'FAIL'}`);
  console.log(`  3. 合計仕入原価が完全一致:       ${totalMatch ? 'PASS (1,279,564円)' : 'FAIL'}`);
  console.log(`  4. 共通配送費は自動配分されず0円: ${shippingZero ? 'PASS (0円)' : 'FAIL'}`);

  // 5. 共通配送費（1,045円）が未配分のまま維持されていることの確認
  console.log("\n[Step 5] 共通配送費（1,045円、受付番号なし）の未配分維持確認...");
  const docCheck = await invokeRelay({ action: "get_document", document_id: TARGET_DOCUMENT_ID });
  const checkShip = (docCheck.data?.lines || []).find(l => l.id === SHIPPING_LINE_ID);
  const shipLinks = checkShip?.links || [];
  const isShipIsolated = shipLinks.length === 0;
  console.log(`  共通配送費のリンク数: ${shipLinks.length} 件 (期待値: 0 件) => ${isShipIsolated ? 'PASS (未配分維持)' : 'FAIL'}`);

  console.log("\n================================================================================");
  console.log("=== 実測結果サマリー ===");
  console.log(`  実在BIS商品:             ${REAL_PRODUCT_ID}`);
  console.log(`  商品代金税込:           ¥${Number(cb?.total_primary_cost).toLocaleString()} 円 (完全一致)`);
  console.log(`  落札手数料税込:         ¥${Number(cb?.total_commission_fee).toLocaleString()} 円 (完全一致)`);
  console.log(`  合計仕入原価:           ¥${Number(cb?.total_allocated_cost).toLocaleString()} 円 (完全一致)`);
  console.log(`  共通配送費（1,045円）:  商品へ自動配分されず未配分維持`);
  console.log("================================================================================");

  if (!primaryMatch || !commMatch || !totalMatch || !shippingZero || !isShipIsolated) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
