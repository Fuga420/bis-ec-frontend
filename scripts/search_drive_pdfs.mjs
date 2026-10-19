import { getDriveAccessToken } from "./drive_auto_import_worker.mjs";

async function main() {
  const token = await getDriveAccessToken();
  const q = encodeURIComponent("mimeType = 'application/pdf' and trashed = false");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,size,parents,createdTime)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  console.log("Total PDFs found in accessible Drive:", data.files?.length);
  for (const f of data.files || []) {
    console.log(`- ID: ${f.id}, Name: ${f.name}, Size: ${f.size}, Parents: ${JSON.stringify(f.parents)}, Created: ${f.createdTime}`);
  }
}

main().catch(console.error);

