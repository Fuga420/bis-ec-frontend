import { invokeRelay, fetchAllExistingDocuments } from "./drive_auto_import_worker.mjs";

async function main() {
  const docs = await fetchAllExistingDocuments(invokeRelay);
  console.log("=== 実行前 DB 状態 ===");
  console.log(`documents 総件数: ${docs.length} 件`);

  // 明細行の総件数を調べるため、既存書類の明細を合算
  let totalLines = 0;
  for (const d of docs) {
    if (d.document_type === "batch_import_job") continue;
    const res = await invokeRelay({ action: "get_document", document_id: d.id });
    if (res.ok && res.data?.document?.lines) {
      totalLines += res.data.document.lines.length;
    }
  }
  console.log(`登録済み実明細行総数: ${totalLines} 行`);

  // 今回の対象ファイル名がDBに存在しないことを最終確認
  const match = docs.find(d => d.file_name === "577-20260126-20260129-10773.pdf");
  console.log(`対象ファイル (577-...) の既存DB登録: ${match ? `あり (ID: ${match.id})` : "なし (未登録実原本であることを確認)"}`);
}

main().catch(console.error);

