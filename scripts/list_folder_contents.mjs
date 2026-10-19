import { getDriveAccessToken, CONFIG } from "./drive_auto_import_worker.mjs";

async function main() {
  const token = await getDriveAccessToken();

  const listFolder = async (folderId, name) => {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,size,createdTime)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const d = await r.json();
    console.log(`=== ${name} (${folderId}) ===`);
    console.log(`件数: ${d.files?.length}`);
    for (const f of d.files || []) {
      console.log(`  - ${f.name} (ID: ${f.id}, Size: ${f.size})`);
    }
  };

  await listFolder(CONFIG.inboxFolderId, "01_inbox");
  await listFolder(CONFIG.processedFolderId, "02_processed");
  await listFolder(CONFIG.flaggedFolderId, "03_flagged");
}

main().catch(console.error);

