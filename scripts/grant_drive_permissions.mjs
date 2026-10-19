import { getDriveAccessToken, CONFIG } from "./drive_auto_import_worker.mjs";

const SA_EMAIL = "bis-drive-worker-sa@bis-square-integration-507508.iam.gserviceaccount.com";
const FOLDERS = [
  { name: "01_inbox", id: CONFIG.inboxFolderId },
  { name: "02_processed", id: CONFIG.processedFolderId },
  { name: "03_flagged", id: CONFIG.flaggedFolderId }
];

async function grantPermission(folderId, folderName, token) {
  const url = `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?supportsAllDrives=true`;
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

  const text = await res.text();
  console.log(`Grant ${folderName} (${folderId}): HTTP ${res.status}`, text);
  return res.ok;
}

async function main() {
  const token = await getDriveAccessToken();
  console.log("Attempting to grant writer permission to service account via Drive API...");
  for (const f of FOLDERS) {
    await grantPermission(f.id, f.name, token);
  }
}

main().catch(console.error);

