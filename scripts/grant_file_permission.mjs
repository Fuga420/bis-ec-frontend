import { getDriveAccessToken } from "./drive_auto_import_worker.mjs";

const FILE_ID = "14v-ko8lvAFYAi2tWiVTCbQ0T9xZqxmsF";
const SA_EMAIL = "bis-drive-worker-sa@bis-square-integration-507508.iam.gserviceaccount.com";

async function main() {
  const token = await getDriveAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${FILE_ID}/permissions?supportsAllDrives=true`;
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
  console.log(`Grant file ${FILE_ID}: HTTP ${res.status}`, await res.text());
}

main().catch(console.error);

