import { getDriveAccessToken, CONFIG } from "./drive_auto_import_worker.mjs";

async function main() {
  const token = await getDriveAccessToken();
  const q = encodeURIComponent(`'${CONFIG.processedFolderId}' in parents and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,size,sha256Checksum)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  console.log("=== 02_processed 内ファイルの sha256Checksum 一覧 ===");
  for (const f of data.files || []) {
    console.log(`- ${f.name} (ID: ${f.id}): sha256=${f.sha256Checksum}`);
  }
}

main().catch(console.error);

