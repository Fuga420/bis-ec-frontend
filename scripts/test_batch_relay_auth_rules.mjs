/**
 * scripts/test_batch_relay_auth_rules.mjs
 * 
 * documents-batch-relay のブラウザ認証経路および管理者境界ロジックの単体検証
 */

function simulateBatchRelayAuth({
  serverWorkerSecret,
  requestHeaders,
  requestBody,
}) {
  const workerSecret = serverWorkerSecret || "";
  const tokenHeader = (requestHeaders["x-bis-worker-token"] || "").trim();
  const confirmedBy = String(requestBody.confirmed_by || "").trim();

  // 1. サーバー環境変数の設定確認
  if (!workerSecret) {
    return {
      status: 503,
      error_code: "WORKER_AUTH_NOT_CONFIGURED",
      message: "ワーカー認証シークレットがサーバー環境変数 (DOCUMENTS_WORKER_SECRET) に設定されていません。"
    };
  }

  // 2. トークンヘッダーが明示された場合の検証
  if (tokenHeader && tokenHeader !== workerSecret) {
    return {
      status: 403,
      error_code: "UNAUTHORIZED_ADMIN_ACTION",
      message: "無効な管理者トークンです。"
    };
  }

  // 3. ブラウザ通常呼出の場合の confirmed_by 必須検証
  if (!tokenHeader && !confirmedBy) {
    return {
      status: 400,
      error_code: "OPERATOR_IDENTIFIER_REQUIRED",
      message: "一括取込の起動には操作スタッフ識別子 (confirmed_by) が必要です。ブラウザから秘密鍵を送信する必要はありません。"
    };
  }

  // 4. 通過: サーバー間通信で付与されるヘッダー
  return {
    status: 200,
    success: true,
    forwardedHeaders: {
      "Content-Type": "application/json",
      "x-bis-worker-token": workerSecret
    },
    forwardedBody: {
      ...requestBody,
      confirmed_by: confirmedBy || "admin_direct"
    }
  };
}

function assert(name, condition) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${name}`);
    process.exit(1);
  }
  console.log(`  ✓ PASS: ${name}`);
}

console.log("================================================================================");
console.log("=== documents-batch-relay 認証境界検証 ===");
console.log("================================================================================\n");

const REAL_SECRET = "test_super_secret_worker_token_2026";

// Case 1: ブラウザからの正規呼出 (confirmed_by のみ、シークレットなし)
console.log("[Case 1] ブラウザ正規呼出: confirmed_by: 'staff_tanaka', x-bis-worker-token なし");
const res1 = simulateBatchRelayAuth({
  serverWorkerSecret: REAL_SECRET,
  requestHeaders: {},
  requestBody: { action: "start_inbox_import", confirmed_by: "staff_tanaka" }
});
assert("HTTP 200 通過", res1.status === 200);
assert("ブラウザに秘密鍵を持たせずサーバー側でヘッダー付与", res1.forwardedHeaders["x-bis-worker-token"] === REAL_SECRET);
assert("操作スタッフ名がフォワードボディに引き継がれる", res1.forwardedBody.confirmed_by === "staff_tanaka");

// Case 2: 未認証呼出 (confirmed_by なし、シークレットなし)
console.log("\n[Case 2] 未認証呼出: confirmed_by なし、x-bis-worker-token なし");
const res2 = simulateBatchRelayAuth({
  serverWorkerSecret: REAL_SECRET,
  requestHeaders: {},
  requestBody: { action: "start_inbox_import" }
});
assert("HTTP 400 拒否", res2.status === 400);
assert("OPERATOR_IDENTIFIER_REQUIRED", res2.error_code === "OPERATOR_IDENTIFIER_REQUIRED");

// Case 3: 誤トークン呼出
console.log("\n[Case 3] 誤トークン呼出: x-bis-worker-token: 'wrong_secret'");
const res3 = simulateBatchRelayAuth({
  serverWorkerSecret: REAL_SECRET,
  requestHeaders: { "x-bis-worker-token": "wrong_secret" },
  requestBody: { action: "start_inbox_import", confirmed_by: "staff_tanaka" }
});
assert("HTTP 403 拒否", res3.status === 403);
assert("UNAUTHORIZED_ADMIN_ACTION", res3.error_code === "UNAUTHORIZED_ADMIN_ACTION");

// Case 4: サーバー設定欠落 (DOCUMENTS_WORKER_SECRET 未設定)
console.log("\n[Case 4] サーバー設定欠落: serverWorkerSecret が空");
const res4 = simulateBatchRelayAuth({
  serverWorkerSecret: "",
  requestHeaders: {},
  requestBody: { action: "start_inbox_import", confirmed_by: "staff_tanaka" }
});
assert("HTTP 503 拒否 (フェイルクローズ)", res4.status === 503);
assert("WORKER_AUTH_NOT_CONFIGURED", res4.error_code === "WORKER_AUTH_NOT_CONFIGURED");

// Case 5: 管理スクリプト正規呼出 (x-bis-worker-token 有効)
console.log("\n[Case 5] 管理スクリプト呼出: x-bis-worker-token 有効");
const res5 = simulateBatchRelayAuth({
  serverWorkerSecret: REAL_SECRET,
  requestHeaders: { "x-bis-worker-token": REAL_SECRET },
  requestBody: { action: "start_inbox_import" }
});
assert("HTTP 200 通過", res5.status === 200);
assert("サーバー側ヘッダー付与", res5.forwardedHeaders["x-bis-worker-token"] === REAL_SECRET);

console.log("\n================================================================================");
console.log("=== 全ケース正常終了 ===");
console.log("================================================================================");
