/**
 * scripts/serve_documents_batch_relay.mjs
 * 
 * documents-batch-relay (Edge Function) をローカルHTTPサーバーとして配信・待受し、
 * 画面またはテストクライアントからの実HTTPリクエストを処理する検証用サーバー。
 */

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 環境変数のロード
function loadEnv() {
  const envFiles = [path.resolve(__dirname, "../.env"), path.resolve(__dirname, "../.env.local")];
  for (const envPath of envFiles) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}
loadEnv();

// サービスアカウントキーの設定
const saKeyPath = path.resolve(__dirname, "../sa_key.json");
if (fs.existsSync(saKeyPath)) {
  process.env.GCP_SERVICE_ACCOUNT_KEY = fs.readFileSync(saKeyPath, "utf8");
}
process.env.GCP_PROJECT_ID = "bis-square-integration-507508";
process.env.GCP_REGION = "asia-northeast1";
process.env.GCP_CLOUD_RUN_JOB_NAME = "drive-auto-import-worker";

// documents-batch-relay のロジックを読み込み
// Note: index.ts の serve(...) は Deno 用なので、リクエスト処理ロジック部分を抽出して直接 Request/Response で処理
import { getGoogleCloudAccessToken, fetchJobResultFromCloudLogging, ACTIONS, handleRequest } from "./batch_relay_core.mjs";

const PORT = parseInt(process.env.BATCH_RELAY_PORT || "54321", 10);

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info, x-bis-worker-token");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  // リクエストボディ取得
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const bodyBuffer = Buffer.concat(chunks);
  const bodyText = bodyBuffer.toString("utf8");

  const fullUrl = `http://${req.headers.host || "localhost"}${req.url}`;
  const webHeaders = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) webHeaders.set(k, Array.isArray(v) ? v.join(", ") : v);
  }

  const webRequest = new Request(fullUrl, {
    method: req.method,
    headers: webHeaders,
    body: req.method !== "GET" && req.method !== "HEAD" ? bodyBuffer : undefined
  });

  try {
    const webResponse = await handleRequest(webRequest);
    res.statusCode = webResponse.status;
    webResponse.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });
    const resBody = await webResponse.text();
    res.end(resBody);
  } catch (err) {
    console.error("Server error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`[documents-batch-relay] Relay server running at http://localhost:${PORT}/functions/v1/documents-batch-relay`);
});
