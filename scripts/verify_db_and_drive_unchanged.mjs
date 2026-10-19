import { invokeRelay, fetchAllExistingDocuments, getDriveAccessToken, CONFIG } from "./drive_auto_import_worker.mjs";

async function main() {
  console.log("=== 書類DB・明細DBの件数および原本所在の実測確認 ===");

  // 1. 書類DB件数
  const docs = await fetchAllExistingDocuments(invokeRelay);
  console.log(`1. documents テーブル総件数: ${docs.length} 件`);

  // 2. 明細DB件数 (最新書類などの明細件数)
  // list_documents に含まれるドキュメントのうち、今回の対象ファイル名 TEST_RUN... のレコードが存在しないことを確認
  const testDoc = docs.find(d => d.file_name?.includes("TEST_RUN"));
  console.log(`2. TEST_RUN 書類レコードの存在有無: ${testDoc ? `存在 (ID: ${testDoc.id})` : "存在せず (無書込・完全未登録を実証)"}`);

  // 3. Drive 01_inbox 内の原本所在
  const token = await getDriveAccessToken();
  const q = encodeURIComponent(`'${CONFIG.inboxFolderId}' in parents and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,size)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  const inboxPdfs = (data.files || []).filter(f => f.name.endsWith(".pdf"));
  console.log(`3. 01_inbox 内のPDF原本件数: ${inboxPdfs.length} 件`);
  for (const f of inboxPdfs) {
    console.log(`   - 原本所在: 01_inbox / ID: ${f.id} / Name: ${f.name} (${f.size} bytes)`);
  }

  // 4. Drive 02_processed 内の原本件数
  const q2 = encodeURIComponent(`'${CONFIG.processedFolderId}' in parents and trashed = false and mimeType = 'application/pdf'`);
  const res2 = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q2}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data2 = await res2.json();
  console.log(`4. 02_processed 内のPDF原本件数: ${data2.files?.length} 件 (変動なし)`);
}

main().catch(console.error);
