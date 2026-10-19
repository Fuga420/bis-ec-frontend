/**
 * scripts/test_batch_relay_unauthenticated_reject.mjs
 * 
 * 【模擬サーバーのテスト (ローカル単体・結合検証)】
 * documents-batch-relay の呼び出し元検証・アクセス制御ロジックの模擬テスト
 * 
 * 目的:
 *  1. 現行Readdy画面（社内SPA）の仕様に整合させ、Supabase公開anonキーと
 *     操作スタッフ識別子 (confirmed_by) を持つ正規リクエストが正常に受付されることを確認する。
 *  2. 認証情報（apikey / Bearer）が完全に欠落しているリクエストや、
 *     confirmed_by が欠落しているリクエストが適切に遮断されることを確認する。
 *  3. 不正な管理者トークン (x-bis-worker-token) が 403 で遮断されることを確認する。
 *  4. 正規の管理者・ワーカートークンによるマシン間通信が正常に受付されることを確認する。
 * 
 * ※本テストはローカルの模擬HTTPサーバーを用いた検証であり、未配信のCloud Run Jobs環境での実測ではありません。
 */

import http from "http";

const SERVER_WORKER_SECRET = "super_secure_worker_secret_key_2026";
const ANON_KEY = "sb_publishable_nxzkup046upZPNCAmh0qdgG3dJ3mr9ZJ";
const VALID_STAFF_TOKEN = "jwt_valid_staff_session_token_example";

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// documents-batch-relay と同一の検証ロジック
async function verifyCallerAuth(reqHeaders, anonKey, workerSecret, confirmedBy) {
  const workerToken = (reqHeaders["x-bis-worker-token"] || "").trim();
  if (workerToken) {
    if (workerSecret && safeEqual(workerToken, workerSecret)) {
      return { ok: true, callerType: "worker" };
    }
    return {
      ok: false,
      status: 403,
      code: "UNAUTHORIZED_ADMIN_ACTION",
      message: "無効な管理者・ワーカートークンです。"
    };
  }

  const authHeader = (reqHeaders["authorization"] || "").trim();
  const apiKeyHeader = (reqHeaders["apikey"] || "").trim();
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const bearerToken = match ? match[1].trim() : "";

  // 認証ヘッダーも apikey も完全に欠落している場合は遮断
  if (!bearerToken && !apiKeyHeader) {
    return {
      ok: false,
      status: 401,
      code: "AUTH_REQUIRED",
      message: "API呼び出しには認証ヘッダーまたは apikey が必要です。"
    };
  }

  // confirmed_by 必須チェック
  if (!confirmedBy) {
    return {
      ok: false,
      status: 400,
      code: "OPERATOR_IDENTIFIER_REQUIRED",
      message: "一括取込の起動には操作スタッフ識別子 (confirmed_by) が必要です。"
    };
  }

  // 現行Readdy画面 (anon key でのアクセス)
  if (bearerToken === anonKey || (!bearerToken && apiKeyHeader === anonKey)) {
    return {
      ok: true,
      callerType: "frontend_staff"
    };
  }

  // 将来的なスタッフJWTセッション
  if (bearerToken === VALID_STAFF_TOKEN) {
    return {
      ok: true,
      callerType: "authenticated_user",
      userId: "usr_mock_12345",
      userEmail: "staff_suzuki@bis-ec.jp"
    };
  }

  return {
    ok: false,
    status: 401,
    code: "INVALID_AUTH_SESSION",
    message: "認証セッションの検証に失敗しました: 無効または期限切れのトークンです。"
  };
}

async function run() {
  console.log("================================================================================");
  console.log("=== 【模擬サーバーのテスト】documents-batch-relay アクセス制御検証 ===");
  console.log("================================================================================\n");

  const server = http.createServer(async (req, res) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch {}

      if (parsed.action === "start_inbox_import") {
        const inputConfirmedBy = String(parsed.confirmed_by || "").trim();
        const auth = await verifyCallerAuth(req.headers, ANON_KEY, SERVER_WORKER_SECRET, inputConfirmedBy);
        if (!auth.ok) {
          res.writeHead(auth.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error_code: auth.code,
            error: auth.message
          }));
          return;
        }

        const jobId = parsed.job_id || "job_test_12345";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          action: "start_inbox_import",
          job_id: jobId,
          status: "running",
          caller_type: auth.callerType,
          confirmed_by: inputConfirmedBy || (auth.callerType === "authenticated_user" ? auth.userEmail : "staff"),
          operator_user_id: auth.userId || null
        }));
        return;
      }

      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "UNKNOWN_ACTION" }));
    });
  });

  await new Promise(resolve => server.listen(9876, resolve));
  const serverUrl = "http://127.0.0.1:9876";

  async function postApi(headers, body) {
    const res = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data: json };
  }

  try {
    // -------------------------------------------------------------------------
    // Test 1: 現行Readdy画面からの正規呼出 (anon key + confirmed_by: "staff_suzuki")
    // -------------------------------------------------------------------------
    console.log("[Test 1] 現行Readdy画面からの呼出 (anon key + confirmed_by: 'staff_suzuki')");
    const res1 = await postApi(
      {
        "apikey": ANON_KEY,
        "authorization": `Bearer ${ANON_KEY}`
      },
      {
        action: "start_inbox_import",
        confirmed_by: "staff_suzuki"
      }
    );
    console.log(`  -> 応答ステータス: HTTP ${res1.status}`);
    console.log(`  -> 応答ボディ:`, res1.data);
    if (res1.status === 200 && res1.data.success && res1.data.caller_type === "frontend_staff") {
      console.log("  ✓ PASS: 現行Readdy画面からの呼出が正常に受付された！\n");
    } else {
      throw new Error(`Test 1 失敗: 想定外の応答 ${res1.status}`);
    }

    // -------------------------------------------------------------------------
    // Test 2: confirmed_by が欠落している場合 -> 400 OPERATOR_IDENTIFIER_REQUIRED で拒絶
    // -------------------------------------------------------------------------
    console.log("[Test 2] confirmed_by 未指定での呼出");
    const res2 = await postApi(
      {
        "apikey": ANON_KEY,
        "authorization": `Bearer ${ANON_KEY}`
      },
      {
        action: "start_inbox_import"
      }
    );
    console.log(`  -> 応答ステータス: HTTP ${res2.status}`);
    console.log(`  -> 応答ボディ:`, res2.data);
    if (res2.status === 400 && res2.data.error_code === "OPERATOR_IDENTIFIER_REQUIRED") {
      console.log("  ✓ PASS: confirmed_by 欠落が 400 で確実に遮断された！\n");
    } else {
      throw new Error(`Test 2 失敗: 想定外の応答 ${res2.status}`);
    }

    // -------------------------------------------------------------------------
    // Test 3: 完全未認証（ヘッダーなしの外部直接アクセス） -> 401 AUTH_REQUIRED で拒絶
    // -------------------------------------------------------------------------
    console.log("[Test 3] 認証ヘッダーなしの直接アクセス");
    const res3 = await postApi(
      {},
      {
        action: "start_inbox_import",
        confirmed_by: "attacker"
      }
    );
    console.log(`  -> 応答ステータス: HTTP ${res3.status}`);
    console.log(`  -> 応答ボディ:`, res3.data);
    if (res3.status === 401 && res3.data.error_code === "AUTH_REQUIRED") {
      console.log("  ✓ PASS: 認証ヘッダー欠落が 401 で遮断された！\n");
    } else {
      throw new Error(`Test 3 失敗: 想定外の応答 ${res3.status}`);
    }

    // -------------------------------------------------------------------------
    // Test 4: 不正な x-bis-worker-token -> 403 UNAUTHORIZED_ADMIN_ACTION で遮断
    // -------------------------------------------------------------------------
    console.log("[Test 4] 不正な x-bis-worker-token");
    const res4 = await postApi(
      {
        "x-bis-worker-token": "wrong_token"
      },
      {
        action: "start_inbox_import",
        confirmed_by: "staff"
      }
    );
    console.log(`  -> 応答ステータス: HTTP ${res4.status}`);
    console.log(`  -> 応答ボディ:`, res4.data);
    if (res4.status === 403 && res4.data.error_code === "UNAUTHORIZED_ADMIN_ACTION") {
      console.log("  ✓ PASS: 不正トークンが 403 で遮断された！\n");
    } else {
      throw new Error(`Test 4 失敗: 想定外の応答 ${res4.status}`);
    }

    // -------------------------------------------------------------------------
    // Test 5: 正規 x-bis-worker-token によるマシン起動 -> 200 通過
    // -------------------------------------------------------------------------
    console.log("[Test 5] 正規 x-bis-worker-token (マシン間通信)");
    const res5 = await postApi(
      {
        "x-bis-worker-token": SERVER_WORKER_SECRET
      },
      {
        action: "start_inbox_import"
      }
    );
    console.log(`  -> 応答ステータス: HTTP ${res5.status}`);
    console.log(`  -> 応答ボディ:`, res5.data);
    if (res5.status === 200 && res5.data.success && res5.data.caller_type === "worker") {
      console.log("  ✓ PASS: 正規ワーカートークンによる呼出が正常に通った！\n");
    } else {
      throw new Error(`Test 5 失敗: 想定外の応答 ${res5.status}`);
    }

    console.log("================================================================================");
    console.log("=== 【模擬サーバーのテスト】全ケース PASS ===");
    console.log("================================================================================");
  } finally {
    server.close();
  }
}

run().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
