import { invokeRelay, fetchAllExistingDocuments } from "./drive_auto_import_worker.mjs";

async function main() {
  console.log("=== 全書類と明細行の内訳・作成日時調査 ===");
  const docs = await fetchAllExistingDocuments(invokeRelay);

  console.log(`取得書類総数: ${docs.length} 件`);

  let totalActiveLines = 0;
  let totalAllLines = 0;
  const docSummary = [];

  for (const d of docs) {
    if (d.document_type === "batch_import_job") {
      docSummary.push({
        id: d.id,
        type: "batch_import_job",
        name: d.file_name || d.document_number,
        created_at: d.created_at,
        lines_count: 0
      });
      continue;
    }

    const res = await invokeRelay({ action: "get_document", document_id: d.id });
    const lines = res.ok && res.data?.lines ? res.data.lines : [];
    totalActiveLines += lines.length;

    docSummary.push({
      id: d.id,
      type: d.document_type,
      name: d.file_name,
      supplier: d.supplier_name,
      status: d.status,
      created_at: d.created_at,
      drive_folder_id: d.drive_folder_id,
      notes: d.notes,
      lines_count: lines.length,
      lines_total: lines.reduce((s, l) => s + Number(l.total_line_amount || 0), 0),
      lines_detail: lines.map(l => ({
        id: l.id,
        line_number: l.line_number,
        type: l.transaction_type,
        amount: l.total_line_amount,
        name: l.item_name_raw,
        created_at: l.created_at
      }))
    });
  }

  console.log(`\n総有効明細行数 (active): ${totalActiveLines}`);
  console.log("\n--- 各書類ごとの明細行集計 ---");
  for (const ds of docSummary) {
    if (ds.type === "batch_import_job") continue;
    console.log(`\n[書類 ID: ${ds.id}]`);
    console.log(`  ファイル名: ${ds.name} | 仕入先: ${ds.supplier} | status: ${ds.status}`);
    console.log(`  作成日時: ${ds.created_at} | フォルダ: ${ds.drive_folder_id}`);
    console.log(`  明細件数: ${ds.lines_count} 行 | 明細合計: ${ds.lines_total} 円 | notes: ${ds.notes}`);
    for (const l of ds.lines_detail) {
      console.log(`    - Line #${l.line_number} (${l.id}): type=${l.type}, amount=${l.amount}, name=${l.name}`);
    }
  }
}

main().catch(console.error);

