import { getDriveAccessToken, CONFIG } from "./drive_auto_import_worker.mjs";

async function main() {
  const token = await getDriveAccessToken();
  const q = encodeURIComponent(`'${CONFIG.inboxFolderId}' in parents and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  const allFiles = data.files || [];
  const pdfs = allFiles.filter(f => f.name.endsWith(".pdf"));
  console.log(`Inbox 総ファイル件数: ${allFiles.length} 件`);
  console.log(`Inbox 内残存PDF件数: ${pdfs.length} 件`);
  if (allFiles.length > 0) {
    allFiles.forEach(f => console.log(`  - ${f.name} (ID: ${f.id}, mime: ${f.mimeType})`));
  }
}

main().catch(console.error);

