import { getDriveAccessToken, CONFIG } from "./drive_auto_import_worker.mjs";

async function main() {
  const token = await getDriveAccessToken();
  const q = encodeURIComponent(`'${CONFIG.inboxFolderId}' in parents and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,size,mimeType)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  console.log("Inbox files count:", data.files?.length);
  for (const f of data.files || []) {
    console.log(`- ID: ${f.id}, Name: ${f.name}, Size: ${f.size} bytes`);
  }
}

main().catch(console.error);

