import { getDriveAccessToken } from "./drive_auto_import_worker.mjs";

const FILE_ID = "1ctLRUQbwINARCDuGdYnpkrCkkK287HV5"; // 01_inbox folder

async function main() {
  const token = await getDriveAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${FILE_ID}/permissions?fields=permissions(id,type,emailAddress,role)&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  console.log("Permissions status:", res.status);
  const data = await res.json();
  console.log("Permissions:", data);
}

main().catch(console.error);
