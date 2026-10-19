import { invokeRelay } from "./drive_auto_import_worker.mjs";

async function checkDoc(id, label) {
  console.log(`\n=== ${label} (${id}) ===`);
  const res = await invokeRelay({ action: "get_document", document_id: id });
  if (!res.ok) {
    console.log("取得エラー:", res.status, res.data);
    return;
  }
  const doc = res.data.document;
  const audit = res.data.audit;
  const lines = res.data.lines || [];
  console.log("Document:", {
    id: doc.id,
    document_number: doc.document_number,
    supplier_name: doc.supplier_name,
    file_name: doc.file_name,
    file_fingerprint: doc.file_fingerprint,
    drive_file_id: doc.drive_file_id,
    status: doc.status,
    total_amount: doc.total_amount,
    extracted_total_amount: doc.extracted_total_amount,
    discrepancy_amount: doc.discrepancy_amount,
    is_deleted: doc.is_deleted,
    deleted_at: doc.deleted_at,
    notes: doc.notes
  });
  console.log("Audit:", audit);
  console.log("Lines count:", lines.length);
  for (const l of lines) {
    console.log(`  Line #${l.line_number}: id=${l.id}, line_status=${l.line_status}, match_status=${l.match_status}, product_id=${l.product_id}, linked_amount=${l.linked_amount}, item=${l.item_name_raw}, total=${l.total_line_amount}`);
  }

  // 商品リンク確認
  try {
    const linkRes = await invokeRelay({ action: "list_document_links", document_id: id });
    console.log("list_document_links API result:", linkRes.data);
  } catch (e) {
    console.log("list_document_links error:", e.message);
  }
}

async function main() {
  await checkDoc("f20aeb19-cd78-4cc2-bafb-f3c6a93edc58", "元書類 (577-...)");
  await checkDoc("a53c27a2-6645-4467-a6bb-57b117081894", "重複書類 (RETEST_577-...)");
}

main().catch(console.error);

