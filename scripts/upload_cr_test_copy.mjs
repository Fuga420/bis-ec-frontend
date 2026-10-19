import { getDriveAccessToken, downloadDriveFile, CONFIG } from "./drive_auto_import_worker.mjs";

const SA_EMAIL = "bis-drive-worker-sa@bis-square-integration-507508.iam.gserviceaccount.com";
const SOURCE_FILE_ID = "1bX_DnjzEUQ61GsuAJN2bKQ1rC3JauWnX"; // 処理済み原本 (577-...)
const TARGET_FILE_NAME = "CR_TEST_COPY_577-20260126-20260129-10773.pdf";

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
  console.log(`Downloading source PDF: ${SOURCE_FILE_ID}...`);
  const buf = await downloadDriveFile(SOURCE_FILE_ID, token);
  console.log(`Downloaded ${buf.length} bytes.`);

  console.log(`Uploading as new Drive ID to 01_inbox: ${TARGET_FILE_NAME}...`);
  const uploaded = await uploadToInbox(buf, TARGET_FILE_NAME, token);
  console.log("Upload SUCCESS:", {
    id: uploaded.id,
    name: uploaded.name
  });

  console.log(`Granting SA permission on uploaded file (${uploaded.id})...`);
  const granted = await grantFilePermission(uploaded.id, token);
  console.log(`Permission grant result: ${granted ? "SUCCESS" : "FAILED"}`);

  console.log("\nREADY FOR CLOUD RUN TEST:");
  console.log(`FILE_ID=${uploaded.id}`);
}

main().catch(console.error);

