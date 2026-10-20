import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDriveAccessToken, CONFIG, invokeRelay, fetchAllExistingDocuments } from "./drive_auto_import_worker.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvAnonKey() {
  const envFiles = [
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../.env.local")
  ];
  for (const envPath of envFiles) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("VITE_PUBLIC_SUPABASE_ANON_KEY=")) {
          return trimmed.split("=")[1].trim().replace(/^["']|["']$/g, '');
        }
      }
    }
  }
  return "sb_publishable_nxzkup046upZPNCAmh0qdgG3dJ3mr9ZJ";
}

const ANON_KEY = loadEnvAnonKey();
const RELAY_URL = "https://yg9qauzldubdo1ca5z0z.helloreaddy.com/functions/v1/documents-batch-relay";

const TARGET_FILE_NAME = "20260303_計算書【請求】_K026021_2051.pdf";
const TARGET_FINGERPRINT = "c4c29eb5605b090e162242f5ae57eae3f40a5933db0ca98df432c5b72ab02a0c";

async function postRelay(body) {
  const res = await fetch(RELAY_URL, {
    method: "POST",
    headers: {
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function checkDriveFolder(folderId, folderName, token) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  const files = data.files || [];
  return files;
}

async function main() {
  console.log("================================================================================");
  console.log("STEP 1: 配信済み documents-batch-relay ドライラン実測 (dry_run: true, max_files: 1)");
  console.log("================================================================================");

  const driveToken = await getDriveAccessToken();

  // 1. 実行前状態の記録
  console.log("\n[1] 実行前状態チェック");
  const preDocs = await fetchAllExistingDocuments(invokeRelay);
  console.log(`DB総書類数: ${preDocs.length} 件`);
  const preInboxFiles = await checkDriveFolder(CONFIG.inboxFolderId, "01_inbox", driveToken);
  console.log(`01_inbox ファイル数: ${preInboxFiles.length} 件 (${preInboxFiles.map(f => f.name).join(", ")})`);
  const preProcessedFiles = await checkDriveFolder(CONFIG.processedFolderId, "02_processed", driveToken);
  console.log(`02_processed ファイル数: ${preProcessedFiles.length} 件`);

  if (preInboxFiles.length !== 1 || preInboxFiles[0].name !== TARGET_FILE_NAME) {
    throw new Error(`予期せぬInbox状態: ${JSON.stringify(preInboxFiles)}`);
  }

  // 2. 配信済み documents-batch-relay への起動リクエスト
  console.log("\n[2] 配信済み documents-batch-relay へ起動リクエスト送信");
  console.log(`URL: ${RELAY_URL}`);
  const launchPayload = {
    action: "start_inbox_import",
    dry_run: true,
    max_files: 1,
    confirmed_by: "staff"
  };
  console.log("送信ペイロード:", JSON.stringify(launchPayload));
  const t0 = Date.now();
  const launchRes = await postRelay(launchPayload);
  console.log(`起動レスポンス HTTP ${launchRes.status}:`, JSON.stringify(launchRes.data, null, 2));

  if (!launchRes.ok || !launchRes.data?.job_id) {
    throw new Error(`起動失敗: ${JSON.stringify(launchRes.data)}`);
  }

  const jobId = launchRes.data.job_id;
  const executionName = launchRes.data.current_job?.execution_name || jobId;
  console.log(`起動成功: job_id=${jobId}, execution_name=${executionName}`);

  // 3. 状態ポーリング
  console.log("\n[3] 実行状態ポーリング開始 (get_inbox_import_status)");
  let finalStatus = null;
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, 4000));
    const statusRes = await postRelay({
      action: "get_inbox_import_status",
      job_id: jobId
    });

    const job = statusRes.data?.current_job;
    const s = job?.status;
    const rStatus = job?.result_status;
    console.log(`[attempt ${attempt}/${maxAttempts}] status=${s}, result_status=${rStatus}, detected=${job?.summary?.total_detected}, processed=${job?.summary?.processed_count}`);

    if (s === "completed" || s === "failed") {
      finalStatus = statusRes.data;
      break;
    }
  }

  if (!finalStatus) {
    throw new Error("ポーリングタイムアウト (120秒)");
  }

  console.log("\n[4] 完了レスポンス全文:");
  console.log(JSON.stringify(finalStatus, null, 2));

  // 4. ドライラン後の DB / Drive 状態検証 (不変検証)
  console.log("\n[5] ドライラン後の DB / Drive 不変検証");
  const postDocs = await fetchAllExistingDocuments(invokeRelay);
  console.log(`DB総書類数: 実行前=${preDocs.length} -> 実行後=${postDocs.length} (変化: ${postDocs.length - preDocs.length})`);
  const matchFingerprint = postDocs.find(d => d.file_fingerprint === TARGET_FINGERPRINT);
  console.log(`DBへの原本登録: ${matchFingerprint ? "ERROR: 登録されてしまいました" : "OK: 未登録を維持"}`);

  const postInboxFiles = await checkDriveFolder(CONFIG.inboxFolderId, "01_inbox", driveToken);
  console.log(`01_inbox ファイル数: 実行前=${preInboxFiles.length} -> 実行後=${postInboxFiles.length} (${postInboxFiles.map(f => f.name).join(", ")})`);

  const postProcessedFiles = await checkDriveFolder(CONFIG.processedFolderId, "02_processed", driveToken);
  console.log(`02_processed ファイル数: 実行前=${preProcessedFiles.length} -> 実行後=${postProcessedFiles.length} (変化: ${postProcessedFiles.length - preProcessedFiles.length})`);

  console.log("\n================================================================================");
  console.log("ドライラン検証完了");
  console.log("================================================================================");
}

main().catch(console.error);
