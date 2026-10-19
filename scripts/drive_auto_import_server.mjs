/**
 * drive_auto_import_server.mjs
 * B.I.S EC 仕入書類 Google Drive 自動取込ワーカー サーバー実行環境
 *
 * 役割:
 *  Cloud Run / VM / ローカルPC上で稼働し、管理画面（Readdy / documents-batch-relay）からの
 *  「Inbox一括取込開始」リクエスト（POST /start）を受けて一括処理を実行する。
 *  処理中および完了時のジョブ結果（job_id, 進捗, ファイル別結果, 失敗理由）を
 *  Google Drive 共有ストレージ（import_job_latest.json）および状態ファイルに記録し、
 *  タブを閉じた後やサーバーインスタンス再起動後にも GET /status または documents-batch-relay 経由で
 *  確実に参照可能にする。
 *
 * 堅牢性原則:
 *  ・コンテナ内ローカルファイルのみを永続記録とする設計を排除（Google Drive 上の共有ストレージに永続化）。
 *  ・Cloud Run の CPU スロットルを考慮し、非同期バックグラウンド実行に加えて、
 *    HTTP接続維持の同期実行（wait=true、またはタイムアウト延長）も選択可能。
 *  ・ジョブ重複実行を防止。
 *
 * ポート:
 *  PORT 環境変数（デフォルト: 8080）
 */

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  CONFIG,
  runDriveAutoImport,
  getDriveAccessToken,
  saveJobStateToDrive,
  getJobStateFromDrive,
  saveJobStateToDatabase,
  getJobStateFromDatabase
} from "./drive_auto_import_worker.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || "8080", 10);
const STATUS_FILE_PATH = path.resolve(__dirname, "../.import_job_latest.json");

// メモリ上の最新ジョブステート
let currentJob = {
  job_id: null,
  status: "idle", // idle | running | completed | failed
  started_at: null,
  finished_at: null,
  total_detected: 0,
  processed_count: 0,
  flagged_count: 0,
  skipped_count: 0,
  error_count: 0,
  file_results: [],
  error: null
};

// 起動時にローカル永続化ファイルがあればロード
if (fs.existsSync(STATUS_FILE_PATH)) {
  try {
    const saved = JSON.parse(fs.readFileSync(STATUS_FILE_PATH, "utf8"));
    if (saved && saved.job_id) {
      currentJob = saved;
    }
  } catch (err) {
    console.warn("[Server] 既存ローカルジョブ状態ファイルのロード失敗:", err.message);
  }
}

// ジョブ状態の永続化保存 (ローカルファイル + Google Drive 共有ストレージ)
async function persistJobState(job) {
  try {
    fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify(job, null, 2), "utf8");
  } catch (err) {
    console.warn("[Server] ローカルジョブ状態の書き込み失敗:", err.message);
  }

  // 1. Readdy 内蔵 Backend Database への永続化保存
  try {
    await saveJobStateToDatabase(job);
  } catch (dbErr) {
    console.warn("[Server] Readdy内蔵DBへのジョブ状態保存失敗:", dbErr.message);
  }

  // 2. Google Drive 共有ストレージへの同期保存
  try {
    const token = await getDriveAccessToken();
    if (token) {
      await saveJobStateToDrive(job, token);
    }
  } catch (driveErr) {
    console.warn("[Server] Drive共有ストレージへのジョブ状態保存失敗:", driveErr.message);
  }
}

// ジョブ実行コア
async function executeJobCore(jobId, options = {}) {
  try {
    console.log(`\n[Server] === ジョブ開始: ${jobId} ===`);
    const summary = await runDriveAutoImport({ ...options, job_id: jobId });

    currentJob.status = "completed";
    currentJob.finished_at = new Date().toISOString();
    currentJob.total_detected = summary.total_detected;
    currentJob.processed_count = summary.processed_count;
    currentJob.flagged_count = summary.flagged_count;
    currentJob.skipped_count = summary.skipped_count;
    currentJob.error_count = summary.error_count;
    currentJob.file_results = summary.file_results;

    console.log(`[Server] === ジョブ完了: ${jobId} (Processed: ${summary.processed_count}, Flagged: ${summary.flagged_count}, Error: ${summary.error_count}) ===\n`);
  } catch (err) {
    console.error(`[Server] === ジョブ異常終了: ${jobId} ===`, err);
    currentJob.status = "failed";
    currentJob.finished_at = new Date().toISOString();
    currentJob.error = err.message || String(err);
  } finally {
    await persistJobState(currentJob);
  }
}

// HTTP サーバー
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-bis-worker-token");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  // 1. GET /health
  if (req.method === "GET" && pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "healthy", timestamp: new Date().toISOString() }));
    return;
  }

  // 2. GET /status : 最新ジョブの進捗・結果取得 (メモリ + Drive共有ストレージ照合)
  if (req.method === "GET" && (pathname === "/status" || pathname === "/api/import-status")) {
    // もしメモリ上のジョブが空、または最新情報を確認したい場合、Readdy内蔵DBおよびDrive共有ストレージを照会
    if (!currentJob.job_id || url.searchParams.get("sync_db") === "true") {
      try {
        const dbJob = await getJobStateFromDatabase();
        if (dbJob && dbJob.job_id) {
          currentJob = dbJob;
        }
      } catch (err) {
        console.warn("[Server] Readdy内蔵DBジョブ状態照会例外:", err.message);
      }
    }

    if (!currentJob.job_id || url.searchParams.get("sync_drive") === "true") {
      try {
        const token = await getDriveAccessToken();
        if (token) {
          const driveJob = await getJobStateFromDrive(token);
          if (driveJob && driveJob.job_id) {
            currentJob = driveJob;
          }
        }
      } catch (err) {
        console.warn("[Server] Driveジョブ状態照会例外:", err.message);
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      current_job: currentJob
    }));
    return;
  }

  // 3. POST /start : 一括取込ジョブの開始依頼
  if (req.method === "POST" && (pathname === "/start" || pathname === "/api/start-import")) {
    const tokenHeader = req.headers["x-bis-worker-token"] || "";
    if (CONFIG.workerSecret && tokenHeader !== CONFIG.workerSecret) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: false,
        error_code: "UNAUTHORIZED_WORKER_ACCESS",
        message: "ワーカーへの実行依頼には有効な管理者トークン (x-bis-worker-token) が必要です。"
      }));
      return;
    }

    if (currentJob.status === "running") {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: false,
        error_code: "JOB_ALREADY_RUNNING",
        message: `別の取込ジョブ (${currentJob.job_id}) が現在実行中です。完了をお待ちください。`,
        current_job: currentJob
      }));
      return;
    }

    let body = {};
    try {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      if (raw) body = JSON.parse(raw);
    } catch {
      // empty body
    }

    const jobId = `job_${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`;
    
    currentJob = {
      job_id: jobId,
      status: "running",
      started_at: new Date().toISOString(),
      finished_at: null,
      total_detected: 0,
      processed_count: 0,
      flagged_count: 0,
      skipped_count: 0,
      error_count: 0,
      file_results: [],
      error: null,
      options: body
    };
    await persistJobState(currentJob);

    // wait=true が指定された場合、HTTP接続内で完走させてからレスポンスを返す（Cloud Run 等のCPUスロットル回避）
    const shouldWait = body.wait === true;

    if (shouldWait) {
      await executeJobCore(jobId, body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: currentJob.status === "completed",
        job_id: jobId,
        status: currentJob.status,
        current_job: currentJob
      }));
    } else {
      // 非同期バックグラウンド実行（常駐VM / ローカルPC向け）
      executeJobCore(jobId, body).catch(err => {
        console.error(`[Server] バックグラウンド実行エラー:`, err);
      });
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        job_id: jobId,
        status: "running"
      }));
    }
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: false, error: "Not Found" }));
});

export function startServer(port = PORT) {
  const p = port || PORT;
  server.listen(p, () => {
    console.log(`[Server] Drive Auto Import Server listening on port ${p}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
