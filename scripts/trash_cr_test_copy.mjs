import { getDriveAccessToken, CONFIG } from "./drive_auto_import_worker.mjs";

async function main() {
  const token = await getDriveAccessToken();
  const fileId = "1XIupNxRSRgOHq6l79sLHKO4MpHxxxFM0";

  console.log(`試験コピー (${fileId}) をゴミ箱へ除外中...`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ trashed: true })
  });
  const data = await res.json();
  console.log(`除外結果: HTTP ${res.status}`, data.name);

  // Inbox 内の残存PDF確認
  const q = encodeURIComponent(`'${CONFIG.inboxFolderId}' in parents and trashed = false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const listData = await r.json();
  const pdfs = (listData.files || []).filter(f => f.name.endsWith(".pdf"));
  console.log(`Inbox 内残存PDF件数: ${pdfs.length} 件`);
}

main().catch(console.error);

