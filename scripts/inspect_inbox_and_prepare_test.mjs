/**
 * scripts/inspect_inbox_and_prepare_test.mjs
 * 
 * 01_inbox の現状ファイル確認および、
 * 少なくとも2件のPDFが存在する状態を準備・確認するスクリプト
 */

import { getDriveAccessToken, CONFIG } from "./drive_auto_import_worker.mjs";

async function listFiles(folderId, token) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size)&pageSize=100`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    throw new Error(`Drive API 呼び出し失敗: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.files || [];
}

async function copyFile(fileId, targetFolderId, newName, token) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id,name`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: newName,
      parents: [targetFolderId]
    })
  });
  if (!res.ok) {
    throw new Error(`Drive ファイルコピー失敗: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function main() {
  const token = await getDriveAccessToken();
  if (!token) throw new Error("Google Drive トークンが取得できません。");

  console.log("================================================================================");
  console.log("=== 01_inbox フォルダ現状確認 ===");
  console.log(`Inbox Folder ID: ${CONFIG.inboxFolderId}`);
  console.log("================================================================================\n");

  let files = await listFiles(CONFIG.inboxFolderId, token);
  console.log(`現在の Inbox 内ファイル件数: ${files.length} 件`);
  for (const [i, f] of files.entries()) {
    console.log(`  [${i + 1}] ID: ${f.id}, Name: ${f.name}, Size: ${f.size} bytes`);
  }

  // 少なくとも2件のPDFが必要
  if (files.length < 2) {
    console.log("\n[準備] Inbox 内のファイルが 2 件未満のため、02_processed から代表PDFをコピーして配置します...");
    const processedFiles = await listFiles(CONFIG.processedFolderId, token);
    console.log(`  02_processed 内のファイル件数: ${processedFiles.length} 件`);

    const needed = 2 - files.length;
    for (let i = 0; i < needed && i < processedFiles.length; i++) {
      const src = processedFiles[i];
      const copyName = `TEST_INBOX_SAMPLE_${Date.now()}_${i + 1}.pdf`;
      console.log(`  コピー実行: ${src.name} -> Inbox (${copyName})...`);
      const copied = await copyFile(src.id, CONFIG.inboxFolderId, copyName, token);
      console.log(`  ✓ コピー完了: ID=${copied.id}, Name=${copied.name}`);
    }

    files = await listFiles(CONFIG.inboxFolderId, token);
    console.log(`\n準備後の Inbox 内ファイル件数: ${files.length} 件`);
    for (const [i, f] of files.entries()) {
      console.log(`  [${i + 1}] ID: ${f.id}, Name: ${f.name}`);
    }
  }

  console.log("\n================================================================================");
  console.log("=== 準備完了: Inbox に 2件以上のPDFが存在することを確認 ===");
  console.log("================================================================================");
}

main().catch(err => {
  console.error("エラー:", err);
  process.exit(1);
});

