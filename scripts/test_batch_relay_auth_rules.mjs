/**
 * scripts/test_batch_relay_auth_rules.mjs
 * 
 * documents-batch-relay の認証境界および未認証者遮断ロジックの単体検証
 * 
 * 原則:
 *  - confirmed_by は監査表示用の記録値であり、本人認証として使わない。
 *  - 未認証者（anonキーまたはBearerなし）が任意の confirmed_by を送信しても 401 AUTH_SESSION_REQUIRED で遮断する。
 *  - 有効な Supabase Auth セッション（JWT）または正規の x-bis-worker-token のみが起動を許可される。
 */

function simulateBatchRelayAuth({
  serverWorkerSecret,
  serverAnonKey = "sb_publishable_anon_key_mock_12345",
  requestHeaders,
  requestBody,
  mockUsers = {}, // token -> user profile
}) {
  const workerSecret = serverWorkerSecret || "";
  const tokenHeader = (requestHeaders["x-bis-worker-token"] || "").trim();
  const authHeader = (requestHeaders["authorization"] || "").trim();
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const bearerToken = match ? match[1].trim() : "";
  const confirmedBy = String(requestBody.confirmed_by || "").trim();

  // 1. サーバー環境変数の設定確認 (フェイルクローズ)
  if (!workerSecret) {
    return {
      status: 503,
      error_code: "WORKER_AUTH_NOT_CONFIGURED",
      message: "ワーカー認証シークレットがサーバー環境変数 (DOCUMENTS_WORKER_SECRET) に設定されていません。"
    };
  }

  // 2. トークンヘッダーが明示された場合の検証 (マシン認証)
  if (tokenHeader) {
    if (tokenHeader !== workerSecret) {
      return {
        status: 403,
        error_code: "UNAUTHORIZED_ADMIN_ACTION",
        message: "無効な管理者・ワーカートークンです。"
      };
    }
    // マシン認証成功
    return {
      status: 200,
      success: true,
      callerType: "worker",
      forwardedHeaders: {
        "Content-Type": "application/json",
        "x-bis-worker-token": workerSecret
      },
      forwardedBody: {
        ...requestBody,
        confirmed_by: confirmedBy || "worker_direct",
        operator_user_id: null,
        operator_email: null
      }
    };
  }

  // 3. ブラウザ / 画面からのセッション検証 (Supabase Auth JWT)
  // confirmed_by は監査記録値であり、認証チェックには用いない
  if (!bearerToken || bearerToken === serverAnonKey) {
    return {
      status: 401,
      error_code: "AUTH_SESSION_REQUIRED",
      message: "一括取込の起動には有効なスタッフログイン（認証セッション）が必要です。未認証のリクエストは許可されません。"
    };
  }

  // 4. Supabase Auth セッション検証 (モック検証)
  const user = mockUsers[bearerToken];
  if (!user) {
    return {
      status: 401,
      error_code: "INVALID_AUTH_SESSION",
      message: "認証セッションの検証に失敗しました: ユーザーが存在しません。"
    };
  }

  // 5. 認証成功
  return {
    status: 200,
    success: true,
    callerType: "authenticated_user",
    forwardedHeaders: {
      "Content-Type": "application/json",
      "x-bis-worker-token": workerSecret
    },
    forwardedBody: {
      ...requestBody,
      confirmed_by: confirmedBy || user.email || user.id,
      operator_user_id: user.id,
      operator_email: user.email
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
console.log("=== documents-batch-relay 認証境界・セッション検証テスト ===");
console.log("================================================================================\n");

const REAL_SECRET = "test_super_secret_worker_token_2026";
const ANON_KEY = "sb_publishable_anon_key_mock_12345";
const VALID_STAFF_TOKEN = "valid_staff_jwt_token_xyz987";
const MOCK_USERS = {
  [VALID_STAFF_TOKEN]: {
    id: "user_uuid_staff_123",
    email: "staff_tanaka@bis-ec.jp"
  }
};

// Case 1: 未認証者が任意の confirmed_by を送信 -> 401 AUTH_SESSION_REQUIRED で確実に遮断
console.log("[Case 1] 未認証者が任意の confirmed_by: 'staff_tanaka' を送信 (anonキーのみ)");
const res1 = simulateBatchRelayAuth({
  serverWorkerSecret: REAL_SECRET,
  serverAnonKey: ANON_KEY,
  requestHeaders: { "authorization": `Bearer ${ANON_KEY}` },
  requestBody: { action: "start_inbox_import", confirmed_by: "staff_tanaka" },
  mockUsers: MOCK_USERS
});
assert("HTTP 401 拒絶", res1.status === 401);
assert("AUTH_SESSION_REQUIRED エラーコード", res1.error_code === "AUTH_SESSION_REQUIRED");
assert("confirmed_by だけでは起動を許さない", !res1.success);

// Case 2: Authorization ヘッダー未付与のリクエスト -> 401 AUTH_SESSION_REQUIRED
console.log("\n[Case 2] Authorization ヘッダーなしのリクエスト");
const res2 = simulateBatchRelayAuth({
  serverWorkerSecret: REAL_SECRET,
  serverAnonKey: ANON_KEY,
  requestHeaders: {},
  requestBody: { action: "start_inbox_import", confirmed_by: "arbitrary_user" },
  mockUsers: MOCK_USERS
});
assert("HTTP 401 拒絶", res2.status === 401);
assert("AUTH_SESSION_REQUIRED エラーコード", res2.error_code === "AUTH_SESSION_REQUIRED");

// Case 3: 無効なセッショントークン -> 401 INVALID_AUTH_SESSION
console.log("\n[Case 3] 期限切れまたは不正な Bearer トークン");
const res3 = simulateBatchRelayAuth({
  serverWorkerSecret: REAL_SECRET,
  serverAnonKey: ANON_KEY,
  requestHeaders: { "authorization": "Bearer invalid_or_expired_jwt" },
  requestBody: { action: "start_inbox_import", confirmed_by: "staff_tanaka" },
  mockUsers: MOCK_USERS
});
assert("HTTP 401 拒絶", res3.status === 401);
assert("INVALID_AUTH_SESSION エラーコード", res3.error_code === "INVALID_AUTH_SESSION");

// Case 4: 有効なスタッフセッションによる正規呼出 -> 200 通過
console.log("\n[Case 4] 有効なスタッフログインセッション (confirmed_by 指定)");
const res4 = simulateBatchRelayAuth({
  serverWorkerSecret: REAL_SECRET,
  serverAnonKey: ANON_KEY,
  requestHeaders: { "authorization": `Bearer ${VALID_STAFF_TOKEN}` },
  requestBody: { action: "start_inbox_import", confirmed_by: "staff_tanaka" },
  mockUsers: MOCK_USERS
});
assert("HTTP 200 通過", res4.status === 200);
assert("callerType: authenticated_user", res4.callerType === "authenticated_user");
assert("ブラウザに秘密鍵を持たせずサーバー側でワーカートークン付与", res4.forwardedHeaders["x-bis-worker-token"] === REAL_SECRET);
assert("監査用の operator_user_id が記録される", res4.forwardedBody.operator_user_id === "user_uuid_staff_123");
assert("監査用の operator_email が記録される", res4.forwardedBody.operator_email === "staff_tanaka@bis-ec.jp");
assert("confirmed_by 表示値が維持される", res4.forwardedBody.confirmed_by === "staff_tanaka");

// Case 5: 誤った管理者・ワーカートークンによる呼出 -> 403 UNAUTHORIZED_ADMIN_ACTION
console.log("\n[Case 5] 誤った x-bis-worker-token");
const res5 = simulateBatchRelayAuth({
  serverWorkerSecret: REAL_SECRET,
  serverAnonKey: ANON_KEY,
  requestHeaders: { "x-bis-worker-token": "wrong_worker_token" },
  requestBody: { action: "start_inbox_import" },
  mockUsers: MOCK_USERS
});
assert("HTTP 403 拒絶", res5.status === 403);
assert("UNAUTHORIZED_ADMIN_ACTION エラーコード", res5.error_code === "UNAUTHORIZED_ADMIN_ACTION");

// Case 6: 正しい x-bis-worker-token によるマシン呼出 (CI/バッチ) -> 200 通過
console.log("\n[Case 6] 正規の x-bis-worker-token (マシン間通信)");
const res6 = simulateBatchRelayAuth({
  serverWorkerSecret: REAL_SECRET,
  serverAnonKey: ANON_KEY,
  requestHeaders: { "x-bis-worker-token": REAL_SECRET },
  requestBody: { action: "start_inbox_import" },
  mockUsers: MOCK_USERS
});
assert("HTTP 200 通過", res6.status === 200);
assert("callerType: worker", res6.callerType === "worker");
assert("サーバー側でヘッダー付与", res6.forwardedHeaders["x-bis-worker-token"] === REAL_SECRET);

// Case 7: サーバー側設定欠落 (DOCUMENTS_WORKER_SECRET 未設定) -> 503 WORKER_AUTH_NOT_CONFIGURED (フェイルクローズ)
console.log("\n[Case 7] サーバー設定欠落 (DOCUMENTS_WORKER_SECRET 未設定)");
const res7 = simulateBatchRelayAuth({
  serverWorkerSecret: "",
  serverAnonKey: ANON_KEY,
  requestHeaders: { "authorization": `Bearer ${VALID_STAFF_TOKEN}` },
  requestBody: { action: "start_inbox_import" },
  mockUsers: MOCK_USERS
});
assert("HTTP 503 拒絶 (フェイルクローズ)", res7.status === 503);
assert("WORKER_AUTH_NOT_CONFIGURED エラーコード", res7.error_code === "WORKER_AUTH_NOT_CONFIGURED");

console.log("\n================================================================================");
console.log("=== 全認証境界テスト PASS ===");
console.log("================================================================================");
