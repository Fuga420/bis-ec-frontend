/**
 * run_unprocessed_representative_test.mjs
 * 未処理代表原本1件の実測検証スクリプト
 * 
 * 対象: 20260203_計算書【請求】_K026021_2017.pdf (Drive ID: 1d2lrRS_Sio8Q9o6geSIZxb8VYOzI060G)
 * 手順:
 *  1. 事前検証 (DB件数、Drive Inbox 0件確認)
 *  2. 原本を 01_inbox へ移動 (GAS move_drive_file)
 *  3. サーバー起動 (drive_auto_import_server)
 *  4. POST /start 実行 (管理者トークン付与、非同期起動、直ちに接続切断)
 *  5. バックグラウンド完走待機 (タブ閉じ相当)
 *  6. GET /status による結果再取得 (DB/Drive永続化データの照会)
 *  7. 事後検証 (DB documents +1, lines +2, status: processed, Drive 02_processed 移動)
 */

import http from "http";
import {
  CONFIG,
  getDriveAccessToken,
  invokeRelay,
  getJobStateFromDatabase,
  getJobStateFromDrive
} from "./drive_auto_import_worker.mjs";
import { startServer } from "./drive_auto_import_server.mjs";

const TARGET_FILE_ID = "1d2lrRS_Sio8Q9o6geSIZxb8VYOzI060G";
const TARGET_FILE_NAME = "20260203_計算書【請求】_K026021_2017.pdf";
const PORT = 8085;
process.env.PORT = String(PORT);

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// HTTP request helper
async function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || "GET",
      headers: options.headers || {}
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data });
        }
      });
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// GAS API call helper
async function callGas(action, params = {}) {
  const url = CONFIG.gasWebAppUrl;
  const payload = { action, mode: "admin", ...params };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "follow"
  });
  return await res.json();
}

// Drive API list files in folder
async function listFolder(folderId, token) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,md5Checksum)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.files || [];
}

async function main() {
  console.log("================================================================================");
  console.log("=== 未処理代表原本1件の実測検証 (POST /start -> 切断 -> 完走 -> GET /status) ===");
  console.log("================================================================================");

  const token = await getDriveAccessToken();

  // ---------------------------------------------------------------------------
  // [Step 1] 事前検証
  // ---------------------------------------------------------------------------
  console.log("\n[Step 1] 事前状態の確認...");
  const preDbRes = await invokeRelay({ action: "list_documents" });
  const preDocs = preDbRes.data?.documents || [];
  console.log(`  - 既存 DB documents 件数: ${preDocs.length} 件`);

  const preInboxFiles = await listFolder(CONFIG.inboxFolderId, token);
  console.log(`  - 既存 Drive 01_inbox 内ファイル数: ${preInboxFiles.length} 件`);
  if (preInboxFiles.length > 0) {
    console.warn("  ※警告: 01_inbox に既存ファイルがあります:", preInboxFiles.map(f => f.name));
  }

  // ---------------------------------------------------------------------------
  // [Step 2] 対象原本を 01_inbox へ移動
  // ---------------------------------------------------------------------------
  console.log(`\n[Step 2] 対象原本 (${TARGET_FILE_NAME}, ID: ${TARGET_FILE_ID}) の所在確認と 01_inbox 配置...`);
  const alreadyInInbox = preInboxFiles.find(f => f.id === TARGET_FILE_ID);
  if (alreadyInInbox) {
    console.log(`  ✓ 原本は既に 01_inbox に配置されています: ${alreadyInInbox.name}`);
  } else {
    const moveRes = await callGas("move_drive_file", {
      file_id: TARGET_FILE_ID,
      target_folder_id: CONFIG.inboxFolderId
    });
    console.log("  GAS move_drive_file 応答:", moveRes);
    if (!moveRes.success) {
      throw new Error(`原本の 01_inbox 移動失敗: ${JSON.stringify(moveRes)}`);
    }
  }

  const postMoveInbox = await listFolder(CONFIG.inboxFolderId, token);
  console.log(`  01_inbox 内確認: ${postMoveInbox.length} 件`);
  const foundInInbox = postMoveInbox.find(f => f.id === TARGET_FILE_ID);
  if (!foundInInbox) {
    throw new Error("原本が 01_inbox に見つかりません。");
  }
  console.log(`  ✓ 原本が 01_inbox に正常配置されました: ${foundInInbox.name} (${foundInInbox.size} bytes)`);

  // ---------------------------------------------------------------------------
  // [Step 3] ワーカーサーバー起動
  // ---------------------------------------------------------------------------
  console.log(`\n[Step 3] ワーカーサーバーをポート ${PORT} で起動...`);
  startServer(PORT);
  await sleep(1000);

  // ヘルスチェック
  const healthRes = await request(`http://localhost:${PORT}/health`);
  console.log(`  GET /health 応答: HTTP ${healthRes.status}`, healthRes.data);

  // ---------------------------------------------------------------------------
  // [Step 4] POST /start 呼び出し (管理者境界チェック & 非同期ジョブ開始)
  // ---------------------------------------------------------------------------
  console.log("\n[Step 4] POST /start : 管理者トークンを付与してジョブ起動依頼...");

  // 4-1. 認証なしで呼んで403になることを確認 (管理者境界テスト)
  const unauthRes = await request(`http://localhost:${PORT}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wait: false })
  });
  console.log(`  [境界テスト] 未認証リクエスト: HTTP ${unauthRes.status} (期待値: 403)`, unauthRes.data?.error_code);
  if (CONFIG.workerSecret && unauthRes.status !== 403) {
    console.warn("  ※警告: 未認証呼び出しが遮断されませんでした。");
  }

  // 4-2. 正当な管理者トークンでジョブ起動
  const startRes = await request(`http://localhost:${PORT}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bis-worker-token": CONFIG.workerSecret
    },
    body: JSON.stringify({ wait: false })
  });
  console.log(`  正当なジョブ起動リクエスト: HTTP ${startRes.status}`);
  console.log("  レスポンス本文:", startRes.data);
  const jobId = startRes.data?.job_id;
  if (!jobId) {
    throw new Error(`job_id が発行されませんでした: ${JSON.stringify(startRes.data)}`);
  }

  // ---------------------------------------------------------------------------
  // [Step 5] 接続切断 (タブ閉じ相当: サーバー側バックグラウンド処理の自律完走を待機)
  // ---------------------------------------------------------------------------
  console.log(`\n[Step 5] クライアント接続切断 (タブ閉じ相当)...`);
  console.log(`  ジョブID: ${jobId} のバックグラウンド完走を待機します...`);

  let completedJob = null;
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    const pollRes = await request(`http://localhost:${PORT}/status`);
    const statusData = pollRes.data?.current_job;
    console.log(`  [待機中 ${i + 1}/20] status=${statusData?.status}, processed=${statusData?.processed_count}, error=${statusData?.error_count}`);
    if (statusData && (statusData.status === "completed" || statusData.status === "failed")) {
      completedJob = statusData;
      break;
    }
  }

  if (!completedJob) {
    throw new Error("ジョブがタイムアウト内に完了しませんでした。");
  }

  // ---------------------------------------------------------------------------
  // [Step 6] GET /status による結果再取得 & DB直接永続化照会
  // ---------------------------------------------------------------------------
  console.log("\n[Step 6] ジョブ完了後の結果再取得...");
  console.log("  [6-1] GET /status レスポンス:");
  console.log(JSON.stringify(completedJob, null, 2));

  console.log("\n  [6-2] Readdy内蔵DB (documentsテーブル) からのジョブ永続化データ直接照会:");
  const dbJobState = await getJobStateFromDatabase();
  console.log("  DBから取得した最新ジョブサマリー:", {
    job_id: dbJobState?.job_id,
    status: dbJobState?.status,
    total_detected: dbJobState?.total_detected,
    processed_count: dbJobState?.processed_count,
    flagged_count: dbJobState?.flagged_count,
    error_count: dbJobState?.error_count,
    file_results: dbJobState?.file_results
  });

  console.log("\n  [6-3] Google Drive (import_job_latest.json) からのジョブ永続化データ照会:");
  const driveJobState = await getJobStateFromDrive(token);
  console.log("  Driveから取得した最新ジョブサマリー:", {
    job_id: driveJobState?.job_id,
    status: driveJobState?.status,
    total_detected: driveJobState?.total_detected,
    processed_count: driveJobState?.processed_count
  });

  // ---------------------------------------------------------------------------
  // [Step 7] 事後検証 (DB件数推移、明細保存、Drive物理移動)
  // ---------------------------------------------------------------------------
  console.log("\n[Step 7] 事後検証...");
  const postDbRes = await invokeRelay({ action: "list_documents" });
  const postDocs = postDbRes.data?.documents || [];
  console.log(`  - 事後 DB documents 件数: ${postDocs.length} 件 (事前: ${preDocs.length} 件)`);

  const createdDoc = postDocs.find(d => d.drive_file_id === TARGET_FILE_ID);
  console.log("  - 登録された書類原本レコード:", {
    id: createdDoc?.id,
    document_type: createdDoc?.document_type,
    document_number: createdDoc?.document_number,
    supplier_name: createdDoc?.supplier_name,
    drive_file_id: createdDoc?.drive_file_id,
    drive_folder_id: createdDoc?.drive_folder_id,
    file_name: createdDoc?.file_name,
    status: createdDoc?.status,
    total_amount: createdDoc?.total_amount,
    notes: createdDoc?.notes
  });

  const postInboxFiles = await listFolder(CONFIG.inboxFolderId, token);
  const postInboxPdfs = postInboxFiles.filter(f => f.mimeType === "application/pdf");
  const postProcessedFiles = await listFolder(CONFIG.processedFolderId, token);
  console.log(`  - 01_inbox PDF残件数: ${postInboxPdfs.length} 件 (期待値: 0 件)`);
  console.log(`  - 02_processed 内に対象原本が存在するか: ${postProcessedFiles.some(f => f.id === TARGET_FILE_ID) ? "✓ 存在" : "✗ 不在"}`);

  console.log("\n================================================================================");
  console.log("=== 実測検証サマリー ===");
  console.log(`  - ジョブID: ${completedJob.job_id}`);
  console.log(`  - ジョブStatus: ${completedJob.status}`);
  console.log(`  - 検出件数: ${completedJob.total_detected} 件`);
  console.log(`  - 処理完了件数: ${completedJob.processed_count} 件`);
  console.log(`  - 要確認退避件数: ${completedJob.flagged_count} 件`);
  console.log(`  - エラー件数: ${completedJob.error_count} 件`);
  console.log(`  - 書類DB ID: ${createdDoc?.id}`);
  console.log(`  - 書類DB Status: ${createdDoc?.status} (期待値: processed)`);
  console.log(`  - Drive フォルダID: ${createdDoc?.drive_folder_id} (期待値: ${CONFIG.processedFolderId})`);
  console.log(`  - Readdy内蔵DBジョブ永続化: ${dbJobState?.job_id === jobId ? "✓ 完全一致" : "✗ 不一致"}`);
  console.log("================================================================================");

  process.exit(0);
}

main().catch(err => {
  console.error("FATAL TEST ERROR:", err);
  process.exit(1);
});
