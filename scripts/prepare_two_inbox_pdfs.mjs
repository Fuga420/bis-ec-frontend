/**
 * scripts/prepare_two_inbox_pdfs.mjs
 * 
 * 02_processed から代表原本PDFを2件コピーし、
 * 01_inbox に「少なくとも2件のPDFが存在する状態」を作成・確認するスクリプト
 */

import { getDriveAccessToken, CONFIG } from "./drive_auto_import_worker.mjs";

async function listPdfs(folderId, token) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType = 'application/pdf'`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size)&pageSize=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive list error: ${res.status}`);
  const data = await res.json();
  return data.files || [];
}

async function copyFile(fileId, targetFolderId, newName, token) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id,name,size,mimeType`;
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
  if (!res.ok) throw new Error(`Drive copy error: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function main() {
  const token = await getDriveAccessToken();
  if (!token) throw new Error("Google Drive トークンが取得できません。");

  console.log("================================================================================");
  console.log("=== 01_inbox PDF 2件配置スクリプト ===");
  console.log("================================================================================\n");

  let inboxPdfs = await listPdfs(CONFIG.inboxFolderId, token);
  console.log(`現在の Inbox 内 PDF 件数: ${inboxPdfs.length} 件`);

  if (inboxPdfs.length < 2) {
    console.log("[配置処理] 02_processed から代表PDFをコピーして 2件のPDFを配置します...");
    const processedPdfs = await listPdfs(CONFIG.processedFolderId, token);
    console.log(`  02_processed 内の PDF 件数: ${processedPdfs.length} 件`);

    const needed = 2 - inboxPdfs.length;
    for (let i = 0; i < needed && i < processedPdfs.length; i++) {
      const src = processedPdfs[i];
      const copyName = `TEST_VERIFY_${Date.now()}_${i + 1}_${src.name}`;
      console.log(`  コピー: ${src.name} -> Inbox (${copyName})...`);
      const copied = await copyFile(src.id, CONFIG.inboxFolderId, copyName, token);
      console.log(`  ✓ コピー成功: ID=${copied.id}, Name=${copied.name}`);
    }

    inboxPdfs = await listPdfs(CONFIG.inboxFolderId, token);
  }

  console.log(`\n配置確認後の Inbox 内 PDF 件数: ${inboxPdfs.length} 件 (条件達成: 2件以上)`);
  for (const [i, p] of inboxPdfs.entries()) {
    console.log(`  [PDF ${i + 1}] ID: ${p.id}, Name: ${p.name}, Size: ${p.size} bytes`);
  }
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});

