import { invokeRelay, fetchAllExistingDocuments, getDriveAccessToken, CONFIG } from "./drive_auto_import_worker.mjs";

const NORMAL_DOC_ID = "5a61fe8b-ed56-41b9-b7f5-262108fc3c52";
const FLAGGED_DOC_ID = "a983140b-6d02-4840-8143-f85f0bc52202";

async function main() {
  console.log("=== 実測後 DB および Drive 詳細実測 ===");

  // 1. 全体件数確認
  const docs = await fetchAllExistingDocuments(invokeRelay);
  console.log(`\n[全体件数]`);
  console.log(`- documents 総件数: ${docs.length} 件`);

  let totalLines = 0;
  for (const d of docs) {
    if (d.document_type === "batch_import_job") continue;
    const res = await invokeRelay({ action: "get_document", document_id: d.id });
    if (res.ok && res.data?.lines) {
      totalLines += res.data.lines.length;
    }
  }
  console.log(`- 登録済み実明細行総数: ${totalLines} 行`);

  // 2. 正常書類詳細
  console.log(`\n[正常原本 (オークネット) 詳細: ${NORMAL_DOC_ID}]`);
  const normRes = await invokeRelay({ action: "get_document", document_id: NORMAL_DOC_ID });
  const normDoc = normRes.data?.document;
  const normLines = normRes.data?.lines || [];
  console.log(`- ファイル名: ${normDoc?.file_name}`);
  console.log(`- 仕入先: ${normDoc?.supplier_name}`);
  console.log(`- 請求書番号: ${normDoc?.document_number}`);
  console.log(`- 発行日: ${normDoc?.issue_date}`);
  console.log(`- ステータス: ${normDoc?.status}`);
  console.log(`- DriveフォルダID: ${normDoc?.drive_folder_id} (02_processed: ${CONFIG.processedFolderId === normDoc?.drive_folder_id})`);
  console.log(`- 請求額: ${normDoc?.total_amount} 円`);
  console.log(`- 明細合計: ${normDoc?.extracted_total_amount} 円`);
  console.log(`- 差額: ${normDoc?.discrepancy_amount} 円`);
  console.log(`- 明細件数: ${normLines.length} 行`);
  for (const l of normLines) {
    console.log(`  Line #${l.line_number}: transaction_type=${l.transaction_type}, item_name="${l.item_name_raw}", item_amount=${l.item_amount}, tax_amount=${l.tax_amount}, fee_amount=${l.fee_amount}, total_line_amount=${l.total_line_amount}`);
  }

  // 3. 要確認書類詳細
  console.log(`\n[要確認原本 詳細: ${FLAGGED_DOC_ID}]`);
  const flagRes = await invokeRelay({ action: "get_document", document_id: FLAGGED_DOC_ID });
  const flagDoc = flagRes.data?.document;
  const flagLines = flagRes.data?.lines || [];
  console.log(`- ファイル名: ${flagDoc?.file_name}`);
  console.log(`- 仕入先: ${flagDoc?.supplier_name}`);
  console.log(`- ステータス: ${flagDoc?.status}`);
  console.log(`- DriveフォルダID: ${flagDoc?.drive_folder_id} (03_flagged: ${CONFIG.flaggedFolderId === flagDoc?.drive_folder_id})`);
  console.log(`- 明細件数: ${flagLines.length} 行 (0行であること)`);
  console.log(`- notes: ${flagDoc?.notes}`);

  // 4. Drive 実ファイル所在確認
  const token = await getDriveAccessToken();
  const checkFile = async (id, expectedFolder, label) => {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,parents,trashed&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const d = await r.json();
    const inExpected = d.parents && d.parents.includes(expectedFolder);
    console.log(`- ${label} (ID: ${id}): parents=${JSON.stringify(d.parents)} -> ${inExpected ? "OK (期待フォルダに移動済)" : "NG"}`);
  };

  console.log(`\n[Drive 実ファイル所在]`);
  await checkFile("1vofYNu6ruxMuqzjYeplmp9X2joGiU_y-", CONFIG.processedFolderId, "正常原本");
  await checkFile("1ceHNwPa3ay4LXv1L5Odk4DYVIwKjhYVG", CONFIG.flaggedFolderId, "要確認原本");

  // 5. Inbox が空であることの確認
  const inboxRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${CONFIG.inboxFolderId}' in parents and trashed = false`)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const inboxData = await inboxRes.json();
  const inboxPdfs = (inboxData.files || []).filter(f => f.name.endsWith(".pdf"));
  console.log(`\n[Inbox 残存PDF]`);
  console.log(`- Inbox内残存PDF数: ${inboxPdfs.length} 件`);
}

main().catch(console.error);

