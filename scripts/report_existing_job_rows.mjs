import { invokeRelay, fetchAllExistingDocuments } from "./drive_auto_import_worker.mjs";

async function main() {
  const docs = await fetchAllExistingDocuments(invokeRelay);
  const jobDocs = docs.filter(d => 
    d.document_type === "batch_import_job" ||
    (d.supplier_name && d.supplier_name.startsWith("SYSTEM_BATCH_JOB")) ||
    (d.file_name && d.file_name.startsWith("import_job_"))
  );

  console.log("================================================================================");
  console.log("=== 既存のジョブ行一覧 (削除せず現状報告のみ) ===");
  console.log("================================================================================");
  console.log(`ジョブ行総件数: ${jobDocs.length} 件 (documentsテーブル内)`);
  console.log("--------------------------------------------------------------------------------");
  for (const [idx, d] of jobDocs.entries()) {
    console.log(`[#${idx + 1}] ID: ${d.id}`);
    console.log(`     Supplier: ${d.supplier_name}`);
    console.log(`     File: ${d.file_name}`);
    console.log(`     Status: ${d.status}`);
    console.log(`     Created At: ${d.created_at}`);
  }
  console.log("================================================================================");
}

main().catch(console.error);

