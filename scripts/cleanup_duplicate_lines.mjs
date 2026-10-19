import { invokeRelay } from "./drive_auto_import_worker.mjs";

const DUP_DOC_ID = "a53c27a2-6645-4467-a6bb-57b117081894";

async function main() {
  console.log(`=== 重複書類 (${DUP_DOC_ID}) の明細行論理削除 (delete_document_line) ===`);

  // 1. 現状の明細取得
  const getRes = await invokeRelay({ action: "get_document", document_id: DUP_DOC_ID });
  if (!getRes.ok || !getRes.data?.success) {
    throw new Error(`get_document failed: ${getRes.status} ${JSON.stringify(getRes.data)}`);
  }
  const lines = getRes.data.lines || [];
  console.log(`削除対象明細行数: ${lines.length} 行`);

  // 2. 各明細行の delete_document_line 実行
  for (const l of lines) {
    console.log(`明細行削除実行: Line #${l.line_number} (ID: ${l.id}, 金額: ${l.total_line_amount} 円)...`);
    const delRes = await invokeRelay({
      action: "delete_document_line",
      document_line_id: l.id,
      deleted_by: "system_correction_duplicate_cleanup"
    });
    console.log(`  -> 削除結果: HTTP ${delRes.status}`, JSON.stringify(delRes.data));
  }

  // 3. 削除後の状態照会
  console.log(`\n=== 削除後の重複書類および監査状態照会 ===`);
  const afterRes = await invokeRelay({ action: "get_document", document_id: DUP_DOC_ID });
  const afterDoc = afterRes.data?.document;
  const afterAudit = afterRes.data?.audit;
  const afterLines = afterRes.data?.lines || [];

  console.log("重複書類状態:", {
    id: afterDoc?.id,
    file_name: afterDoc?.file_name,
    status: afterDoc?.status,
    extracted_line_count: afterDoc?.extracted_line_count,
    extracted_total_amount: afterDoc?.extracted_total_amount,
    active_lines_count: afterAudit?.active_lines_count,
    purchase_total: afterAudit?.purchase_total
  });
  console.log(`残存有効明細数: ${afterLines.length} 行 (0行であること)`);

  // 4. 元原本書類 (f20aeb19-...) の無事確認
  console.log(`\n=== 元書類 (f20aeb19-...) の保持確認 ===`);
  const origRes = await invokeRelay({ action: "get_document", document_id: "f20aeb19-cd78-4cc2-bafb-f3c6a93edc58" });
  const origDoc = origRes.data?.document;
  const origLines = origRes.data?.lines || [];
  console.log("元書類状態:", {
    id: origDoc?.id,
    file_name: origDoc?.file_name,
    status: origDoc?.status,
    extracted_line_count: origDoc?.extracted_line_count,
    extracted_total_amount: origDoc?.extracted_total_amount
  });
  console.log(`元書類保持明細数: ${origLines.length} 行 (6行保持されていること)`);
}

main().catch(console.error);

