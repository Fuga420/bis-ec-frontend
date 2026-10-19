import { invokeRelay, fetchAllExistingDocuments } from "./drive_auto_import_worker.mjs";

async function main() {
  const docs = await fetchAllExistingDocuments(invokeRelay);

  console.log("=== 実書類一覧と明細行数集計表 ===");
  console.log("No | 書類ID | 作成日時 | ファイル名 | status | 明細行数 | 明細合計 | notes");
  console.log("---|---|---|---|---|---|---|---");

  let idx = 1;
  let runningTotal = 0;
  for (const d of docs) {
    if (d.document_type === "batch_import_job") continue;

    const res = await invokeRelay({ action: "get_document", document_id: d.id });
    const lines = res.ok && res.data?.lines ? res.data.lines : [];
    runningTotal += lines.length;
    const notesStr = d.notes ? d.notes.replace(/\r?\n/g, " ") : "";

    console.log(`${idx++} | ${d.id} | ${d.created_at} | ${d.file_name} | ${d.status} | ${lines.length} | ${lines.reduce((s, l) => s + Number(l.total_line_amount || 0), 0)} | ${notesStr}`);
  }
  console.log(`\n総合計実明細行数: ${runningTotal} 行`);
}

main().catch(console.error);

