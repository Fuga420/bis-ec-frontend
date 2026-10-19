import { getDriveAccessToken } from "./drive_auto_import_worker.mjs";

const FILE_ID = "14v-ko8lvAFYAi2tWiVTCbQ0T9xZqxmsF";

async function main() {
  const token = await getDriveAccessToken();
  console.log(`Trashing TEST_RUN file: ${FILE_ID}...`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${FILE_ID}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ trashed: true })
  });
  if (!res.ok) {
    throw new Error(`Trash failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  console.log("SUCCESS trashed:", data);
}

main().catch(console.error);

