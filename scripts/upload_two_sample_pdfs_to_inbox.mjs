/**
 * scripts/upload_two_sample_pdfs_to_inbox.mjs
 * 
 * 02_processed の原本PDFをダウンロードし、
 * multipartアップロードにより 01_inbox に 2件のPDFを確実に配置するスクリプト
 */

import { getDriveAccessToken, downloadDriveFile, CONFIG } from "./drive_auto_import_worker.mjs";

async function listPdfs(folderId, token) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType = 'application/pdf'`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size)&pageSize=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive list error: ${res.status}`);
  const data = await res.json();
  return data.files || [];
}

async function uploadPdfToFolder(folderId, fileName, buffer, token) {
  const metadata = {
    name: fileName,
    mimeType: "application/pdf",
    parents: [folderId]
  };

  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";

  const pre = Buffer.from(
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/pdf\r\n\r\n"
  );
  const post = Buffer.from(closeDelim);

  const multipartBody = Buffer.concat([pre, buffer, post]);

  const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body: multipartBody
  });

  if (!res.ok) {
    throw new Error(`Upload error: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function main() {
  const token = await getDriveAccessToken();
  if (!token) throw new Error("Google Drive トークンが取得できません。");

  console.log("================================================================================");
  console.log("=== 01_inbox へ 2件の PDF を配置 ===");
  console.log("================================================================================\n");

  let inboxFiles = await listPdfs(CONFIG.inboxFolderId, token);
  console.log(`現在の Inbox 内 PDF 件数: ${inboxFiles.length} 件`);

  if (inboxFiles.length < 2) {
    console.log("[1] 02_processed から代表原本PDFを取得中...");
    const processedFiles = await listPdfs(CONFIG.processedFolderId, token);
    console.log(`  02_processed 内 PDF 件数: ${processedFiles.length} 件`);
    if (processedFiles.length === 0) {
      throw new Error("02_processed にPDFが見つかりません。");
    }

    const src = processedFiles[0];
    console.log(`  元ファイル: ${src.name} (ID: ${src.id})`);
    const pdfBuf = await downloadDriveFile(src.id, token);
    console.log(`  ダウンロード成功: ${pdfBuf.length} bytes`);

    const needed = 2 - inboxFiles.length;
    for (let i = 0; i < needed; i++) {
      const uploadName = `20261019_INBOX_SAMPLE_${Date.now()}_${i + 1}.pdf`;
      console.log(`  [${i + 1}/${needed}] 01_inbox へアップロード中: ${uploadName}...`);
      const created = await uploadPdfToFolder(CONFIG.inboxFolderId, uploadName, pdfBuf, token);
      console.log(`    ✓ アップロード成功: ID=${created.id}, Name=${created.name}`);
    }

    inboxFiles = await listPdfs(CONFIG.inboxFolderId, token);
  }

  console.log(`\n================================================================================`);
  console.log(`=== 準備完了: 01_inbox 内の PDF 件数 = ${inboxFiles.length} 件 ===`);
  for (const [i, f] of inboxFiles.entries()) {
    console.log(`  [PDF ${i + 1}] ID: ${f.id}, Name: ${f.name}, Size: ${f.size} bytes`);
  }
  console.log("================================================================================");
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});

