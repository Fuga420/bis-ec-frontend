import { getDriveAccessToken, downloadDriveFile, CONFIG } from "./drive_auto_import_worker.mjs";

const SOURCE_FILE_ID = "1fpIVNCi1jDwmzrP_XryD6ZHBy2EL0Sqs"; // 614-20260408-20260411-10773.pdf (オークネット代表PDF)
const TARGET_FILE_NAME = "TEST_RUN_614-20260408-20260411-10773.pdf";

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

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
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

async function main() {
  const token = await getDriveAccessToken();
  console.log("Downloading representative PDF binary from 02_processed...");
  const pdfBuf = await downloadDriveFile(SOURCE_FILE_ID, token);
  console.log(`Downloaded ${pdfBuf.length} bytes.`);

  console.log(`Uploading 1 representative PDF to 01_inbox (${CONFIG.inboxFolderId})...`);
  const uploaded = await uploadToInbox(pdfBuf, TARGET_FILE_NAME, token);
  console.log("Upload SUCCESS:", {
    id: uploaded.id,
    name: uploaded.name,
    mimeType: uploaded.mimeType
  });
}

main().catch(console.error);

