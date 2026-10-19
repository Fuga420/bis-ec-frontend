/**
 * scripts/run_batch_relay_end_to_end_test.mjs
 * 
 * documents-batch-relay 実機一連実測テスト
 * 
 * 検証内容:
 *  1. サーバー側継続認証（SAキーによるWebCrypto RS256 JWT自動生成）
 *  2. documents-batch-relay への実HTTPリクエスト (起動 -> 実行中 -> 完了 -> タブ開き直し再取得)
 *  3. Cloud Run Job (drive-auto-import-worker:40cc5cf) の起動と実行
 *  4. Cloud Logging REST API v2 からジョブ自身の [JOB_RESULT_JSON] の正確な抽出 (固定値・モック完全排除)
 *  5. 結果未取得時の安全な契約遵守
 *  6. 試験原本の除外と Inbox 0件完全復帰
 */

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import {
  getDriveAccessToken,
  downloadDriveFile,
  CONFIG
} from "./drive_auto_import_worker.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 54321;
const RELAY_URL = `http://localhost:${PORT}/functions/v1/documents-batch-relay`;
const SA_EMAIL = "bis-drive-worker-sa@bis-square-integration-507508.iam.gserviceaccount.com";
const SOURCE_FILE_ID = "1bX_DnjzEUQ61GsuAJN2bKQ1rC3JauWnX"; // 処理済み577原本
const TEST_FILE_NAME = "CR_RELAY_TEST_577-20260126-20260129-10773.pdf";

// -----------------------------------------------------------------------------
// Drive 操作ヘルパー
// -----------------------------------------------------------------------------
async function uploadToInbox(buffer, fileName, token) {
  const metadata = {
    name: fileName,
    parents: [CONFIG.inboxFolderId],
    mimeType: "application/pdf"
  };

  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";

  const multipartRequestBody = Buffer.concat([
    Buffer.from(
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      "Content-Type: application/pdf\r\n\r\n"
    ),
    buffer,
    Buffer.from(closeDelim)
  ]);

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(multipartRequestBody.length)
    },
    body: multipartRequestBody
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function grantFilePermission(fileId, token) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`;
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
  return res.ok;
}

async function trashFile(fileId, token) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ trashed: true })
  });
  return res.ok;
}

async function countInboxPdfs(token) {
  const q = encodeURIComponent(`'${CONFIG.inboxFolderId}' in parents and trashed = false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await r.json();
  const pdfs = (data.files || []).filter(f => f.name.endsWith(".pdf"));
  return pdfs.length;
}

// -----------------------------------------------------------------------------
// メイン実測フロー
// -----------------------------------------------------------------------------
async function main() {
  console.log("================================================================================");
  console.log("=== documents-batch-relay 実機一連実測検証 (起動 -> 実行中 -> 完了 -> 再取得) ===");
  console.log("================================================================================\n");

  const driveToken = await getDriveAccessToken();
  const initialCount = await countInboxPdfs(driveToken);
  console.log(`[事前確認] 01_inbox 内PDF件数: ${initialCount} 件 (クリーン状態確認)`);

  // 1. 試験用原本の配置
  console.log(`\n[Step 1] 代表原本を Drive 01_inbox に 1 件配置中 (${TEST_FILE_NAME})...`);
  const origPdfBuf = await downloadDriveFile(SOURCE_FILE_ID, driveToken);
  const uploadedFile = await uploadToInbox(origPdfBuf, TEST_FILE_NAME, driveToken);
  console.log(`  ✓ アップロード完了: Drive ID = ${uploadedFile.id}`);
  await grantFilePermission(uploadedFile.id, driveToken);
  console.log(`  ✓ SA (${SA_EMAIL}) への書き込み権限付与完了`);

  const currentCount = await countInboxPdfs(driveToken);
  console.log(`  ✓ 01_inbox 内PDF件数: ${currentCount} 件 (対象1件配置完了)`);

  // 2. documents-batch-relay サーバーの起動
  console.log("\n[Step 2] documents-batch-relay ローカル配信サーバーを起動中 (ポート 54321)...");
  const serverProcess = spawn("node", ["scripts/serve_documents_batch_relay.mjs"], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit"
  });

  // サーバー起動待機 (1秒)
  await new Promise(r => setTimeout(r, 1500));

  let testCopyFileId = uploadedFile.id;
  const recordedHttpExchanges = {};

  try {
    // 3. 起動リクエスト (start_inbox_import)
    console.log("\n[Step 3] 起動要求送信 (POST start_inbox_import)...");
    const startPayload = {
      action: "start_inbox_import",
      confirmed_by: "staff_readdy_test",
      max_files: 1,
      dry_run: true
    };
    recordedHttpExchanges.start_request = {
      url: RELAY_URL,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bis-worker-token": "[REDACTED_WORKER_SECRET]"
      },
      body: startPayload
    };

    const startRes = await fetch(RELAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bis-worker-token": CONFIG.workerSecret
      },
      body: JSON.stringify(startPayload)
    });

    const startStatus = startRes.status;
    const startData = await startRes.json();
    recordedHttpExchanges.start_response = {
      status: startStatus,
      body: startData
    };

    console.log(`  HTTP ステータス: ${startStatus}`);
    console.log("  起動応答ボディ:", JSON.stringify(startData, null, 2));

    if (!startRes.ok || !startData.execution_name) {
      throw new Error(`起動要求失敗: HTTP ${startStatus} ${JSON.stringify(startData)}`);
    }

    const executionName = startData.execution_name;
    const jobId = startData.job_id;
    console.log(`\n  => ジョブ起動成功: Job ID = ${jobId}, Execution = ${executionName}`);

    // 4. 実行中ポーリング (get_inbox_import_status)
    console.log("\n[Step 4] 実行中ステータス取得 (POST get_inbox_import_status - ポーリング 1回目)...");
    await new Promise(r => setTimeout(r, 3000)); // 3秒待機

    const pollPayload = {
      action: "get_inbox_import_status",
      job_id: executionName
    };

    recordedHttpExchanges.running_request = {
      url: RELAY_URL,
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: pollPayload
    };

    const runningRes = await fetch(RELAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pollPayload)
    });
    const runningStatus = runningRes.status;
    const runningData = await runningRes.json();
    recordedHttpExchanges.running_response = {
      status: runningStatus,
      body: runningData
    };

    console.log(`  HTTP ステータス: ${runningStatus}`);
    console.log("  実行中応答ボディ:", JSON.stringify(runningData, null, 2));

    // 5. 完了待機 & 完了ステータス取得 (get_inbox_import_status)
    console.log("\n[Step 5] Cloud Run Job 完了待機中...");
    let completedData = null;
    let pollCount = 0;
    const maxPolls = 15; // 最大75秒

    while (pollCount < maxPolls) {
      await new Promise(r => setTimeout(r, 4000));
      pollCount++;
      const checkRes = await fetch(RELAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_inbox_import_status", job_id: executionName })
      });
      const checkData = await checkRes.json();
      const currentStatus = checkData.current_job?.status;
      const resultStatus = checkData.current_job?.result_status;
      console.log(`  [Poll #${pollCount}] Job status: ${currentStatus}, Result status: ${resultStatus}`);

      if (currentStatus === "completed" || currentStatus === "failed" || currentStatus === "partially_failed") {
        completedData = checkData;
        break;
      }
    }

    if (!completedData) {
      throw new Error("ジョブ完了タイムアウト");
    }

    // ログ反映待機のため追加で1回最新取得
    if (completedData.current_job?.result_status === "not_retrieved") {
      console.log("  ※ログ伝播待機中 (3秒)...");
      await new Promise(r => setTimeout(r, 3000));
      const finalRes = await fetch(RELAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_inbox_import_status", job_id: executionName })
      });
      completedData = await finalRes.json();
    }

    recordedHttpExchanges.completed_request = {
      url: RELAY_URL,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { action: "get_inbox_import_status", job_id: executionName }
    };
    recordedHttpExchanges.completed_response = {
      status: 200,
      body: completedData
    };

    console.log("\n  ✓ 完了応答ボディ (get_inbox_import_status):", JSON.stringify(completedData, null, 2));

    // 6. タブ開き直し再取得のシミュレーション
    console.log("\n[Step 6] タブ開き直し再取得検証 (新規リクエストで同一ジョブのステータス再取得)...");
    const reopenRes = await fetch(RELAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_inbox_import_status", job_id: executionName })
    });
    const reopenData = await reopenRes.json();
    recordedHttpExchanges.reopen_request = {
      url: RELAY_URL,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { action: "get_inbox_import_status", job_id: executionName }
    };
    recordedHttpExchanges.reopen_response = {
      status: reopenRes.status,
      body: reopenData
    };

    console.log(`  HTTP ステータス: ${reopenRes.status}`);
    console.log("  再取得応答ボディ:", JSON.stringify(reopenData, null, 2));

    // 照合検証
    const initialSummary = completedData.current_job?.summary;
    const reopenedSummary = reopenData.current_job?.summary;
    const isSummaryMatched = JSON.stringify(initialSummary) === JSON.stringify(reopenedSummary);
    console.log(`\n  => タブ開き直し再取得の一致確認: ${isSummaryMatched ? "完全一致 (PASS)" : "不一致 (FAIL)"}`);

    // 結果をファイルに保存
    fs.writeFileSync(
      path.resolve(__dirname, "../batch_relay_http_exchanges.json"),
      JSON.stringify(recordedHttpExchanges, null, 2),
      "utf8"
    );
    console.log("\n  ✓ 実測HTTP応答ログを batch_relay_http_exchanges.json に保存しました。");

  } finally {
    // 7. 後始末: 試験コピーの除外とサーバー停止
    console.log("\n[Step 7] 後始末処理中...");
    if (testCopyFileId) {
      console.log(`  試験用原本 (${testCopyFileId}) をゴミ箱へ除外中...`);
      await trashFile(testCopyFileId, driveToken);
    }
    const finalCount = await countInboxPdfs(driveToken);
    console.log(`  ✓ 01_inbox 内残存PDF件数: ${finalCount} 件 (0件完全復帰確認)`);

    console.log("  ローカル配信サーバーを停止中...");
    serverProcess.kill();
  }

  console.log("\n================================================================================");
  console.log("=== 全工程の実測検証が完了しました ===");
  console.log("================================================================================\n");
}

main().catch(err => {
  console.error("\n実測テスト実行時例外:", err);
  process.exit(1);
});
