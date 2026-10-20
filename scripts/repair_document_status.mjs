import { invokeRelay, getDriveAccessToken, CONFIG } from "./drive_auto_import_worker.mjs";

const DOC_ID = "c7dae6ee-ee45-40d3-b37d-78eb3f37e680";
const FILE_ID = "1pO-KdUEzBjGE40Aj4fa2pCLTCTCddQZ4";

async function main() {
  console.log("=== 書類 c7dae6ee-... Drive所在再確認 & status修復 ===");

  // 1. Drive実機所在の再確認
  const token = await getDriveAccessToken();
  const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${FILE_ID}?fields=id,name,parents,trashed`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!fileRes.ok) {
    throw new Error(`Drive API 呼び出し失敗: ${fileRes.status}`);
  }
  const fileData = await fileRes.json();
  console.log("Drive実体情報:", fileData);
  const isInProcessed = fileData.parents?.includes(CONFIG.processedFolderId);
  console.log(`Drive 02_processed 所在確認: ${isInProcessed ? "✓ 存在確認 (OK)" : "✗ 不在 (NG)"}`);
  if (!isInProcessed) {
    throw new Error("原本が 02_processed に存在しないため、修復を中断します。");
  }

  // 2. 修復前の状態取得
  const preDocRes = await invokeRelay({ action: "get_document", document_id: DOC_ID });
  console.log("\n--- 修復前 DB 状態 ---");
  console.log({
    id: preDocRes.data?.document?.id,
    status: preDocRes.data?.document?.status,
    supplier_name: preDocRes.data?.document?.supplier_name,
    document_number: preDocRes.data?.document?.document_number,
    total_amount: preDocRes.data?.document?.total_amount,
    extracted_total_amount: preDocRes.data?.document?.extracted_total_amount,
    discrepancy_amount: preDocRes.data?.document?.discrepancy_amount,
    lines_count: preDocRes.data?.lines?.length,
    links_count: preDocRes.data?.links?.length
  });

  // 3. update_document_folder (mark_processed: true) によるヘッダー status 修復
  console.log("\n--- update_document_folder による status: processed 修復 ---");
  const updateRes = await invokeRelay({
    action: "update_document_folder",
    document_id: DOC_ID,
    mark_processed: true
  });
  console.log("update_document_folder 応答 status:", updateRes.status, "success:", updateRes.data?.success);
  if (!updateRes.ok || !updateRes.data?.success) {
    throw new Error(`update_document_folder 失敗: ${JSON.stringify(updateRes.data)}`);
  }

  // 4. 修復後の状態取得 (get_document 実測)
  const postDocRes = await invokeRelay({ action: "get_document", document_id: DOC_ID });
  const postDoc = postDocRes.data?.document;
  const postAudit = postDocRes.data?.audit;
  const postLines = postDocRes.data?.lines || [];
  const postLinks = postDocRes.data?.links || [];

  console.log("\n--- 修復後 DB 状態 (get_document 実測値) ---");
  console.log("ID:", postDoc?.id);
  console.log("ファイル名:", postDoc?.file_name);
  console.log("書類番号 (document_number):", postDoc?.document_number);
  console.log("日付 (issue_date):", postDoc?.issue_date);
  console.log("仕入先 (supplier_name):", postDoc?.supplier_name);
  console.log("DBステータス (status):", postDoc?.status);
  console.log("DriveフォルダID (drive_folder_id):", postDoc?.drive_folder_id);

  console.log("\n--- 金額3値 ---");
  console.log("1. 原本記載額 (total_amount / declared_total_amount):", {
    doc_total_amount: postDoc?.total_amount,
    audit_declared_total_amount: postAudit?.declared_total_amount
  });
  console.log("2. 抽出明細合計 (extracted_total_amount):", {
    doc_extracted_total_amount: postDoc?.extracted_total_amount,
    audit_extracted_total_amount: postAudit?.extracted_total_amount
  });
  console.log("3. 検算差額 (discrepancy_amount):", {
    doc_discrepancy_amount: postDoc?.discrepancy_amount,
    audit_discrepancy_amount: postAudit?.discrepancy_amount,
    is_balanced: postAudit?.is_balanced
  });

  console.log("\n--- 明細3行確認 (件数: " + postLines.length + ") ---");
  postLines.forEach((l, idx) => {
    console.log(`行 ${idx + 1} (ID: ${l.id}): 品名="${l.item_name_raw}", 本体=${l.item_amount}, 税=${l.tax_amount}, 手数料=${l.fee_amount}, 行総額=${l.total_line_amount}, match_status=${l.match_status}`);
  });

  console.log("\n--- 商品リンク確認 (件数: " + postLinks.length + ") ---");
  postLinks.forEach((link, idx) => {
    console.log(`リンク ${idx + 1}: link_id=${link.id}, product_id=${link.product_id}`);
  });

  // 5. list_documents (/documents 画面データソース) での表示確認
  console.log("\n--- list_documents (/documents 画面表示相当) 実測 ---");
  const listRes = await invokeRelay({ action: "list_documents", page: 1, page_size: 50 });
  const targetInList = (listRes.data?.documents || []).find(d => d.id === DOC_ID);
  console.log("list_documents 内の対象書類レコード:", {
    id: targetInList?.id,
    supplier_name: targetInList?.supplier_name,
    document_number: targetInList?.document_number,
    issue_date: targetInList?.issue_date,
    status: targetInList?.status,
    total_amount: targetInList?.total_amount,
    extracted_total_amount: targetInList?.extracted_total_amount,
    discrepancy_amount: targetInList?.discrepancy_amount
  });
}

main().catch(err => {
  console.error("エラー:", err);
  process.exit(1);
});
