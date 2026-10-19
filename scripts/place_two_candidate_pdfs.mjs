import { getDriveAccessToken, downloadDriveFile, CONFIG } from "./drive_auto_import_worker.mjs";

const SA_EMAIL = "bis-drive-worker-sa@bis-square-integration-507508.iam.gserviceaccount.com";

const TARGETS = [
  {
    name: "20260210_計算書【請求】_K026021_2025.pdf",
    sourceFileId: "1gauYsI_2kYT7pq_liS11vgHNjFnO6gri",
    category: "normal (期待値: 02_processed, 差額0円, 2明細)"
  },
  {
    name: "811-36148 ３ピース　クラシック　ＯＴＪ　ベルト　バッ.pdf",
    sourceFileId: "1HJzzgBSe38wANn2NkRR3aDusgX2dDVm7",
    category: "flagged (期待値: 03_flagged, フォーマット未対応/要確認)"
  }
];

async function uploadToInbox(buffer, fileName, token) {
  const metadata = {
    name: fileName,
    parents: [CONFIG.inboxFolderId],
    mimeType: "application/pdf"
  };

  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";

  const multipartRequestBody = Buffer.concat([
    Buffer.from(
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      "Content-Type: application/pdf\r\n\r\n"
    ),
    buffer,
    Buffer.from(closeDelim)
  ]);

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(multipartRequestBody.length)
    },
    body: multipartRequestBody
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function grantFilePermission(fileId, token) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      role: "writer",
      type: "user",
      emailAddress: SA_EMAIL
    })
  });
  return res.ok;
}

async function main() {
  const token = await getDriveAccessToken();
  console.log("=== 正常原本 & 要確認原本の 01_inbox 配置 ===");

  const results = [];

  for (const t of TARGETS) {
    console.log(`\n[${t.category}]`);
    console.log(`- 元原本取得: ${t.name} (ID: ${t.sourceFileId})...`);
    const buf = await downloadDriveFile(t.sourceFileId, token);
    console.log(`  取得サイズ: ${buf.length} bytes`);

    console.log(`- 01_inbox へアップロード中...`);
    const uploaded = await uploadToInbox(buf, t.name, token);
    console.log(`  アップロード成功: 新ID=${uploaded.id}`);

    console.log(`- SA (${SA_EMAIL}) への書き込み権限付与...`);
    const granted = await grantFilePermission(uploaded.id, token);
    console.log(`  権限付与結果: ${granted ? "成功" : "失敗"}`);

    results.push({
      name: t.name,
      inboxFileId: uploaded.id,
      sourceFileId: t.sourceFileId,
      category: t.category
    });
  }

  console.log("\n=== 配置完了 ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);

