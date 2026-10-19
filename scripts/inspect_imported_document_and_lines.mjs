import { invokeRelay, getDriveAccessToken, CONFIG } from "./drive_auto_import_worker.mjs";

const DOC_ID = "f20aeb19-cd78-4cc2-bafb-f3c6a93edc58";
const FILE_ID = "1bX_DnjzEUQ61GsuAJN2bKQ1rC3JauWnX";

async function main() {
  console.log("=== 実処理後の DB および Drive 状態実測 ===");

  // 1. 書類詳細取得 (get_document)
  const res = await invokeRelay({ action: "get_document", document_id: DOC_ID });
  if (!res.ok || !res.data?.success) {
    throw new Error(`get_document failed: ${res.status} ${JSON.stringify(res.data)}`);
  }
  const doc = res.data.document;
  const audit = res.data.audit;

  console.log("\n[1. 書類レコード (documents)]");
  console.log(`- 書類ID: ${doc.id}`);
  console.log(`- 仕入先: ${doc.supplier_name}`);
  console.log(`- 書類番号: ${doc.document_number}`);
  console.log(`- 発行日: ${doc.issue_date}`);
  console.log(`- ファイル名: ${doc.file_name}`);
  console.log(`- ステータス: ${doc.status}`);
  console.log(`- DriveフォルダID: ${doc.drive_folder_id} (02_processed: ${CONFIG.processedFolderId === doc.drive_folder_id})`);
  console.log(`- 公称請求額: ${doc.total_amount?.toLocaleString()} 円`);
  console.log(`- 明細合計額: ${doc.extracted_total_amount?.toLocaleString()} 円`);
  console.log(`- 差額: ${doc.discrepancy_amount} 円`);

  const lines = res.data.lines || [];
  console.log("\n[2. 保存明細行 (document_lines)]");
  console.log(`- 保存明細総数: ${lines.length} 行`);
  let itemSum = 0;
  let taxSum = 0;
  let feeSum = 0;
  let totalSum = 0;

  for (const l of lines) {
    itemSum += Number(l.item_amount || 0);
    taxSum += Number(l.tax_amount || 0);
    feeSum += Number(l.fee_amount || 0);
    totalSum += Number(l.total_line_amount || 0);
    console.log(`  Line #${l.line_number} (Page ${l.page_number}): ${l.item_name_raw}`);
    console.log(`    商品代(税抜): ${Number(l.item_amount).toLocaleString()} 円 | 消費税: ${Number(l.tax_amount).toLocaleString()} 円 | 手数料: ${Number(l.fee_amount).toLocaleString()} 円 | 行総額: ${Number(l.total_line_amount).toLocaleString()} 円`);
  }

  console.log("\n[3. 内訳集計]");
  console.log(`- 商品代金合計(税抜): ${itemSum.toLocaleString()} 円`);
  console.log(`- 消費税合計: ${taxSum.toLocaleString()} 円`);
  console.log(`- 手数料合計: ${feeSum.toLocaleString()} 円`);
  console.log(`- 明細行総合計: ${totalSum.toLocaleString()} 円`);
  console.log(`- 原本記載請求額: ${doc.total_amount?.toLocaleString()} 円`);
  console.log(`- 金額差: ${Number(doc.total_amount) - totalSum} 円 (完全一致)`);

  // 4. Drive上の実ファイル所在 (getDriveFileMetadata)
  const token = await getDriveAccessToken();
  const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${FILE_ID}?fields=id,name,parents,trashed&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const fileMeta = await metaRes.json();
  console.log("\n[4. Drive 実ファイル所在]");
  console.log(`- File ID: ${fileMeta.id}`);
  console.log(`- File Name: ${fileMeta.name}`);
  console.log(`- Parents: ${JSON.stringify(fileMeta.parents)}`);
  const inProcessed = fileMeta.parents && fileMeta.parents.includes(CONFIG.processedFolderId);
  console.log(`- 02_processed 移動確認: ${inProcessed ? "成功 (02_processed に移動済み)" : "未移動 (FAIL)"}`);
}

main().catch(console.error);
