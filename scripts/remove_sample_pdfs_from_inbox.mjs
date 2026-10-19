/**
 * scripts/remove_sample_pdfs_from_inbox.mjs
 * 
 * 01_inbox 内に試験用に作成したサンプルPDF 2件のみを特定し、
 * 原本（02_processed に保管中の原本）を一切変更せず保持したまま、
 * Inbox から安全に除外 (trashed: true) するスクリプト
 */

import { getDriveAccessToken, CONFIG } from "./drive_auto_import_worker.mjs";

const TARGET_SAMPLE_FILE_IDS = [
  "1qyzDL713-CCHmsxb_ENSSP9YcpZRBFFS", // 20261019_INBOX_SAMPLE_1792389181999_2.pdf
  "1GjVLCO50cBdkuh5yvAbTa2ldfwTw7xf9"  // 20261019_INBOX_SAMPLE_1792389179814_1.pdf
];

async function listPdfs(folderId, token) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType = 'application/pdf'`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,parents)&pageSize=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive list error: ${res.status}`);
  const data = await res.json();
  return data.files || [];
}

async function trashFile(fileId, token) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ trashed: true })
  });
  if (!res.ok) {
    throw new Error(`Trash failed for ${fileId}: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function main() {
  const token = await getDriveAccessToken();
  if (!token) throw new Error("Google Drive トークンが取得できません。");

  console.log("================================================================================");
  console.log("=== 01_inbox 試験用サンプルPDF 2件の除外処理 ===");
  console.log("================================================================================\n");

  // 1. 02_processed 原本の安全確認
  console.log("[Step 1] 02_processed の原本保護確認...");
  const processedPdfs = await listPdfs(CONFIG.processedFolderId, token);
  console.log(`  02_processed 内原本総件数: ${processedPdfs.length} 件 (保護対象)`);
  for (const p of processedPdfs) {
    console.log(`    - 原本: ID=${p.id}, Name=${p.name}`);
  }

  // 2. 01_inbox 内の現状確認
  console.log("\n[Step 2] 01_inbox 内のファイル確認...");
  const inboxPdfs = await listPdfs(CONFIG.inboxFolderId, token);
  console.log(`  除外前 01_inbox 内 PDF 件数: ${inboxPdfs.length} 件`);
  for (const p of inboxPdfs) {
    console.log(`    - ファイル: ID=${p.id}, Name=${p.name}`);
  }

  // 3. 対象2件のみを除外
  console.log("\n[Step 3] 試験用PDF 2件の除外実行...");
  for (const targetId of TARGET_SAMPLE_FILE_IDS) {
    const targetInInbox = inboxPdfs.find(p => p.id === targetId);
    if (targetInInbox) {
      console.log(`  除外実行: ID=${targetId}, Name=${targetInInbox.name}...`);
      await trashFile(targetId, token);
      console.log(`  ✓ 除外成功 (trashed: true)`);
    } else {
      console.log(`  [Info] ファイルID (${targetId}) は既にInboxに存在しません。`);
    }
  }

  // 4. 除外後の確認
  console.log("\n[Step 4] 除外後の確認...");
  const remainingInboxPdfs = await listPdfs(CONFIG.inboxFolderId, token);
  console.log(`  除外後 01_inbox 内 PDF 件数: ${remainingInboxPdfs.length} 件`);

  const remainingProcessedPdfs = await listPdfs(CONFIG.processedFolderId, token);
  console.log(`  02_processed 内原本件数: ${remainingProcessedPdfs.length} 件 (変動なし・完全保護確認)`);

  const pass = remainingInboxPdfs.every(p => !TARGET_SAMPLE_FILE_IDS.includes(p.id)) &&
               remainingProcessedPdfs.length === processedPdfs.length;

  console.log("\n================================================================================");
  console.log(`=== 結果判定: ${pass ? "PASS (原本保護・Inbox除外完了)" : "FAIL"} ===`);
  console.log(`  除外した試験用PDF ID:`);
  console.log(`    1. 1qyzDL713-CCHmsxb_ENSSP9YcpZRBFFS`);
  console.log(`    2. 1GjVLCO50cBdkuh5yvAbTa2ldfwTw7xf9`);
  console.log(`  Inbox内残PDF件数: ${remainingInboxPdfs.length} 件`);
  console.log(`  02_processed 原本件数: ${remainingProcessedPdfs.length} 件 (完全維持)`);
  console.log("================================================================================");
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
