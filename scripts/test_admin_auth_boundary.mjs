import http from "http";
import { CONFIG } from "./drive_auto_import_worker.mjs";
import { startServer } from "./drive_auto_import_server.mjs";

const PORT = 8089;

function request(url, options = {}) {
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

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log("================================================================================");
  console.log("=== 管理者認証境界 4パターン実測テスト (POST /start) ===");
  console.log("================================================================================\n");

  startServer(PORT);
  await sleep(1000);

  const realSecret = CONFIG.workerSecret;

  // 1. 未認証 (トークンなし)
  console.log("[Pattern 1] 未認証リクエスト (x-bis-worker-token なし)...");
  const res1 = await request(`http://localhost:${PORT}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dry_run: true })
  });
  console.log(`  => HTTP ${res1.status}`, res1.data);

  // 2. 誤トークン (間違ったトークン)
  console.log("\n[Pattern 2] 誤トークンリクエスト (x-bis-worker-token: 'invalid_secret_key_999')...");
  const res2 = await request(`http://localhost:${PORT}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bis-worker-token": "invalid_secret_key_999"
    },
    body: JSON.stringify({ dry_run: true })
  });
  console.log(`  => HTTP ${res2.status}`, res2.data);

  // 3. 設定欠落 (DOCUMENTS_WORKER_SECRET 未設定時)
  console.log("\n[Pattern 3] 設定欠落テスト (サーバー側 secret を一時的に空に設定)...");
  const envSecretBackup = process.env.DOCUMENTS_WORKER_SECRET;
  delete process.env.DOCUMENTS_WORKER_SECRET;
  CONFIG.workerSecret = "";
  const res3 = await request(`http://localhost:${PORT}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bis-worker-token": "any_token"
    },
    body: JSON.stringify({ dry_run: true })
  });
  console.log(`  => HTTP ${res3.status}`, res3.data);
  CONFIG.workerSecret = realSecret; // 戻す
  process.env.DOCUMENTS_WORKER_SECRET = envSecretBackup;

  // 4. 正規呼び出し (正しいトークン)
  console.log("\n[Pattern 4] 正規呼び出し (正しい x-bis-worker-token 付与)...");
  await sleep(3000);
  const res4 = await request(`http://localhost:${PORT}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bis-worker-token": realSecret
    },
    body: JSON.stringify({ dry_run: true })
  });
  console.log(`  => HTTP ${res4.status}`, res4.data);

  console.log("\n================================================================================");
  console.log("=== 判定サマリー ===");
  console.log(`  1. 未認証:   期待値 401 WORKER_AUTH_REQUIRED      => 実測: HTTP ${res1.status} (${res1.data?.error_code}) [${res1.status === 401 ? 'PASS' : 'FAIL'}]`);
  console.log(`  2. 誤トークン: 期待値 403 UNAUTHORIZED_WORKER_ACCESS => 実測: HTTP ${res2.status} (${res2.data?.error_code}) [${res2.status === 403 ? 'PASS' : 'FAIL'}]`);
  console.log(`  3. 設定欠落: 期待値 503 WORKER_AUTH_NOT_CONFIGURED => 実測: HTTP ${res3.status} (${res3.data?.error_code}) [${res3.status === 503 ? 'PASS' : 'FAIL'}]`);
  console.log(`  4. 正規呼出: 期待値 202 Accepted                   => 実測: HTTP ${res4.status} (job_id: ${res4.data?.job_id}) [${res4.status === 202 ? 'PASS' : 'FAIL'}]`);
  console.log("================================================================================");

  process.exit(0);
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
