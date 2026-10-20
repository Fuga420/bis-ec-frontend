import { getDriveAccessToken, downloadDriveFile, CONFIG, invokeRelay, fetchAllExistingDocuments } from "./drive_auto_import_worker.mjs";
import crypto from "crypto";

const SOURCE_FILE_ID = "1FJNZZayuGswfyp4fpIKghwbdnfSdKv5I"; // 20260303_計算書【請求】_K026021_2051.pdf
const TARGET_FILE_NAME = "20260303_計算書【請求】_K026021_2051.pdf";
const SA_EMAIL = "bis-drive-worker-sa@bis-square-integration-507508.iam.gserviceaccount.com";

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

  console.log("=== 1. 事前確認: 既存DB照合 ===");
  const docs = await fetchAllExistingDocuments(invokeRelay);
  console.log(`DB総書類数: ${docs.length} 件`);

  console.log(`\n=== 2. 実原本ダウンロード: ${TARGET_FILE_NAME} (${SOURCE_FILE_ID}) ===`);
  const buf = await downloadDriveFile(SOURCE_FILE_ID, token);
  const fingerprint = crypto.createHash("sha256").update(buf).digest("hex");
  console.log(`ダウンロード完了: ${buf.length} bytes, SHA-256: ${fingerprint}`);

  const matchFingerprint = docs.find(d => d.file_fingerprint === fingerprint);
  if (matchFingerprint) {
    throw new Error(`エラー: 指紋重複を検知しました! 既存ID: ${matchFingerprint.id}`);
  }
  const matchName = docs.find(d => d.file_name === TARGET_FILE_NAME);
  if (matchName) {
    throw new Error(`エラー: 同名ファイルを検知しました! 既存ID: ${matchName.id}`);
  }
  console.log("-> 既存DBに完全未登録（重複指紋なし）を確認しました。");

  console.log(`\n=== 3. 01_inbox (${CONFIG.inboxFolderId}) へ配置 ===`);
  const uploaded = await uploadToInbox(buf, TARGET_FILE_NAME, token);
  console.log("アップロード成功:", {
    id: uploaded.id,
    name: uploaded.name,
    mimeType: uploaded.mimeType
  });

  console.log(`\n=== 4. SA (${SA_EMAIL}) へ writer 権限付与 ===`);
  const granted = await grantFilePermission(uploaded.id, token);
  console.log(`権限付与結果: ${granted ? "SUCCESS" : "FAILED"}`);

  console.log("\n=== 配置完了 ===");
  console.log(`ファイルID: ${uploaded.id}`);
  console.log(`ファイル名: ${uploaded.name}`);
  console.log(`SHA-256: ${fingerprint}`);
}

main().catch(console.error);

