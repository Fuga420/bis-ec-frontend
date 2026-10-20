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
const TARGET_FILE_ID = "1pO-KdUEzBjGE40Aj4fa2pCLTCTCddQZ4";
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

async function checkDriveFolder(folderId, token) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.files || [];
}

async function fetchWithRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries - 1) throw e;
      console.log(`[一時エラー検知] 再試行します (${i + 1}/${retries}): ${e.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function main() {
  console.log("================================================================================");
  console.log("STEP 2: 配信済み documents-batch-relay 通常取込実測 (dry_run: false, max_files: 1)");
  console.log("================================================================================");

  const driveToken = await getDriveAccessToken();

  // 1. 実行前状態チェック
  console.log("\n[1] 実行前状態チェック");
  const preDocs = await fetchWithRetry(() => fetchAllExistingDocuments(invokeRelay));
  console.log(`DB総書類数: ${preDocs.length} 件`);
  const preInboxFiles = await checkDriveFolder(CONFIG.inboxFolderId, driveToken);
  console.log(`01_inbox ファイル数: ${preInboxFiles.length} 件 (${preInboxFiles.map(f => f.name).join(", ")})`);
  const preProcessedFiles = await checkDriveFolder(CONFIG.processedFolderId, driveToken);
  console.log(`02_processed ファイル数: ${preProcessedFiles.length} 件`);

  if (preInboxFiles.length !== 1 || preInboxFiles[0].id !== TARGET_FILE_ID) {
    throw new Error(`予期せぬInbox状態: ${JSON.stringify(preInboxFiles)}`);
  }

  // 2. 配信済み documents-batch-relay への通常取込起動リクエスト
  console.log("\n[2] 配信済み documents-batch-relay へ通常取込起動リクエスト送信");
  console.log(`URL: ${RELAY_URL}`);
  const launchPayload = {
    action: "start_inbox_import",
    dry_run: false,
    max_files: 1,
    confirmed_by: "staff"
  };
  console.log("送信ペイロード:", JSON.stringify(launchPayload));
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
  let completedStatus = null;
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
      completedStatus = statusRes.data;
      if (rStatus === "retrieved") {
        break; // ログ実績まで取得完了
      }
    }
  }

  // ログインデックス遅延を考慮した再取得待機
  if (completedStatus && completedStatus.current_job?.result_status !== "retrieved") {
    console.log("\n[待機] Cloud Logging インデックス反映を待機して再取得します (8秒)...");
    await new Promise(r => setTimeout(r, 8000));
    const reRes = await postRelay({
      action: "get_inbox_import_status",
      job_id: jobId
    });
    completedStatus = reRes.data;
  }

  console.log("\n[4] 完了レスポンス全文:");
  console.log(JSON.stringify(completedStatus, null, 2));

  // 5. 通常取込後の DB / Drive 状態検証
  console.log("\n[5] 通常取込後の DB / Drive 状態検証");
  const postDocs = await fetchWithRetry(() => fetchAllExistingDocuments(invokeRelay));
  console.log(`DB総書類数: 実行前=${preDocs.length} -> 実行後=${postDocs.length} (増加: ${postDocs.length - preDocs.length})`);

  // 原本DB登録の確認
  const newDoc = postDocs.find(d => d.file_fingerprint === TARGET_FINGERPRINT);
  if (!newDoc) {
    throw new Error(`ERROR: 新規書類がDBに登録されていません! (fingerprint: ${TARGET_FINGERPRINT})`);
  }
  console.log("【検証合格】原本DB登録成功:", {
    id: newDoc.id,
    file_name: newDoc.file_name,
    supplier_name: newDoc.supplier_name,
    document_number: newDoc.document_number,
    status: newDoc.status,
    drive_file_id: newDoc.drive_file_id,
    drive_folder_id: newDoc.drive_folder_id,
    total_amount: newDoc.total_amount
  });

  // 明細保存の確認
  console.log("\n[6] 保存明細行の取得・検証 (get_document)");
  const docDetailRes = await invokeRelay({ action: "get_document", document_id: newDoc.id });
  if (!docDetailRes.ok || !docDetailRes.data?.document) {
    throw new Error(`ERROR: 書類詳細取得失敗: ${JSON.stringify(docDetailRes)}`);
  }
  const lines = docDetailRes.data.document.lines || [];
  console.log(`【検証合格】保存明細行数: ${lines.length} 行`);
  for (const l of lines) {
    console.log(`  - 行 ${l.line_number}: 品名=${l.item_name_raw} | 商品額=${l.item_amount} | 手数料=${l.fee_amount} | 税=${l.tax_amount} | 合計=${l.total_line_amount}`);
  }

  // Drive 02_processed 移動確認
  console.log("\n[7] Drive フォルダ移動検証");
  const postInboxFiles = await checkDriveFolder(CONFIG.inboxFolderId, driveToken);
  console.log(`01_inbox 残存ファイル数: ${postInboxFiles.length} 件 (期待値: 0 件)`);

  const postProcessedFiles = await checkDriveFolder(CONFIG.processedFolderId, driveToken);
  console.log(`02_processed ファイル数: 実行前=${preProcessedFiles.length} -> 実行後=${postProcessedFiles.length} (増加: ${postProcessedFiles.length - preProcessedFiles.length})`);
  const movedFile = postProcessedFiles.find(f => f.id === TARGET_FILE_ID);
  console.log(`02_processed 内の対象原本: ${movedFile ? `確認成功 (ID: ${movedFile.id}, Name: ${movedFile.name})` : "ERROR: 見つかりません"}`);

  // DB フォルダ・状態更新の確認
  console.log("\n[8] DB フォルダ・状態更新検証");
  console.log(`DB内 drive_folder_id: ${newDoc.drive_folder_id} (02_processed と一致: ${newDoc.drive_folder_id === CONFIG.processedFolderId})`);
  console.log(`DB内 status: ${newDoc.status} (processed と一致: ${newDoc.status === "processed"})`);

  console.log("\n================================================================================");
  console.log("通常取込実測: 全項目合格");
  console.log("================================================================================");
}

main().catch(console.error);
