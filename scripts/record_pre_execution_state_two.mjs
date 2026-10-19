import { invokeRelay, fetchAllExistingDocuments } from "./drive_auto_import_worker.mjs";

async function main() {
  const docs = await fetchAllExistingDocuments(invokeRelay);
  console.log("=== 実測直前 DB 状態 ===");
  console.log(`documents 総件数: ${docs.length} 件`);

  let totalLines = 0;
  for (const d of docs) {
    if (d.document_type === "batch_import_job") continue;
    const res = await invokeRelay({ action: "get_document", document_id: d.id });
    if (res.ok && res.data?.lines) {
      totalLines += res.data.lines.length;
    }
  }
  console.log(`登録済み実明細行総数: ${totalLines} 行`);

  // 今回の対象ファイル名がDBに存在しないことを確認
  const match1 = docs.find(d => d.file_name === "20260210_計算書【請求】_K026021_2025.pdf");
  const match2 = docs.find(d => d.file_name === "811-36148 ３ピース　クラシック　ＯＴＪ　ベルト　バッ.pdf");
  console.log(`20260210...pdf 既存登録: ${match1 ? `あり (${match1.id})` : "なし (未登録確認)"}`);
  console.log(`811-36148...pdf 既存登録: ${match2 ? `あり (${match2.id})` : "なし (未登録確認)"}`);
}

main().catch(console.error);

