// supabase/functions/documents-batch-relay/index.ts
//
// B.I.S EC 仕入書類 Google Drive 一括取込 ジョブ管理・起動専用 薄型 Edge Function
//
// 役割:
//  Readdy管理画面（ブラウザ）からの「Inbox一括取込開始」リクエストを受け、
//  常駐/サーバー上の Node.js ワーカー環境（Cloud Run Jobs）へジョブの開始を依頼し、
//  ジョブ進捗・ファイル別結果・要確認理由の参照（ステータス照会）を安全に中継する。
//
// アーキテクチャ原則（一本化・厳格契約設計）:
//  ・取込本体（PDF解析、金額検算、明細DB登録、Drive移動）は Cloud Run Job (drive-auto-import-worker) に一本化。
//  ・本 Edge Function 側には重いパーサーや PDF パースの二重実装を持たない。
//  ・ブラウザにはワーカーの認証情報や内部キーを一切露出させない。
//  ・試験スクリプトの固定値やモック結果は一切使用せず、実行したジョブ自身の結果を Cloud Logging より取得する。
//  ・結果が未取得の場合は空の実績や成功件数を捏造せず、result_status="not_retrieved", message="結果未取得" を返す。
//  ・古い batch_import_job 書類レコードや別ワーカーの結果は Cloud Run Job 結果へ混入させない。
//  ・Cloud Run API 認証はサービスアカウントの継続利用可能なサーバー側経路（WebCrypto RS256 JWT）により自動生成。

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ACTIONS = {
  start_inbox_import: "start_inbox_import",
  get_inbox_import_status: "get_inbox_import_status",
} as const;

// 環境変数取得ヘルパー (Deno / Node 互換)
function getEnv(key: string, defaultValue = ""): string {
  if (typeof (globalThis as any).Deno !== "undefined" && (globalThis as any).Deno?.env) {
    return (globalThis as any).Deno.env.get(key) ?? defaultValue;
  }
  if (typeof process !== "undefined" && process?.env) {
    return process.env[key] ?? defaultValue;
  }
  return defaultValue;
}

// CORS
function getAllowedOrigins(): string[] {
  const raw = getEnv("ALLOWED_ORIGINS");
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function resolveCorsOrigin(req: Request): string {
  const allowed = getAllowedOrigins();
  const origin = req.headers.get("Origin") ?? "";
  if (allowed.length === 0) return origin || "*";
  return allowed.includes(origin) ? origin : allowed[0];
}

function corsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveCorsOrigin(req),
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-bis-worker-token",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(body: unknown, status = 200, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

function errorResponse(code: string, message: string, status = 400, cors: Record<string, string> = {}): Response {
  return jsonResponse({ success: false, error_code: code, error: message, message }, status, cors);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// 呼び出し元の認証・権限検証
async function verifyCallerAuth(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
  workerSecret: string,
  confirmedBy: string
): Promise<
  | { ok: true; callerType: "worker" | "authenticated_user" | "frontend_staff"; userId?: string; userEmail?: string }
  | { ok: false; status: number; code: string; message: string }
> {
  // 1. マシン間通信 / 自動化スクリプト等によるワーカー専用トークン検証
  const workerToken = (req.headers.get("x-bis-worker-token") || "").trim();
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

  // 2. ブラウザ / Readdy画面からの呼出検証
  const authHeader = (req.headers.get("authorization") || "").trim();
  const apiKeyHeader = (req.headers.get("apikey") || "").trim();
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

  // 操作スタッフ識別子 (confirmed_by) の必須チェック (監査証跡)
  if (!confirmedBy) {
    return {
      ok: false,
      status: 400,
      code: "OPERATOR_IDENTIFIER_REQUIRED",
      message: "一括取込の起動には操作スタッフ識別子 (confirmed_by) が必要です。"
    };
  }

  // 3-A. 現行Readdy画面 (anon key でのアクセス)
  if (bearerToken === anonKey || (!bearerToken && apiKeyHeader === anonKey)) {
    return {
      ok: true,
      callerType: "frontend_staff"
    };
  }

  // 3-B. Supabase Auth ログインセッション (将来的なスタッフJWT導入時)
  try {
    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(bearerToken);

    if (userError || !userData?.user) {
      return {
        ok: false,
        status: 401,
        code: "INVALID_AUTH_SESSION",
        message: `認証セッションの検証に失敗しました: ${userError?.message || "ユーザーが存在しません"}`
      };
    }

    return {
      ok: true,
      callerType: "authenticated_user",
      userId: userData.user.id,
      userEmail: userData.user.email
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 401,
      code: "AUTH_VERIFICATION_ERROR",
      message: `セッション検証処理中にエラーが発生しました: ${err.message}`
    };
  }
}

// documents-relay 呼び出しヘルパー (台帳サマリー取得用)
async function invokeRelay(supabaseUrl: string, anonKey: string, workerSecret: string, payload: Record<string, unknown>) {
  const url = `${supabaseUrl}/functions/v1/documents-relay`;
  const headers: Record<string, string> = {
    "apikey": anonKey,
    "Authorization": `Bearer ${anonKey}`,
    "Content-Type": "application/json"
  };
  if (workerSecret) {
    headers["x-bis-worker-token"] = workerSecret;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  let data: any = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = { success: false, error: text };
  }
  return { status: res.status, ok: res.ok, data };
}

// -----------------------------------------------------------------------------
// Google Cloud 継続的サーバー側認証 (WebCrypto RS256 JWT によるトークン自動生成)
// -----------------------------------------------------------------------------
let cachedSaToken: { token: string; expiresAt: number } | null = null;

async function getGoogleCloudAccessToken(saKeyJson: string, directToken = ""): Promise<string> {
  // 静的トークンが指定されている場合は優先
  if (directToken) return directToken;
  if (!saKeyJson) return "";

  // キャッシュが有効 (残り5分以上) であれば再利用
  const now = Math.floor(Date.now() / 1000);
  if (cachedSaToken && cachedSaToken.expiresAt > now + 300) {
    return cachedSaToken.token;
  }

  try {
    const sa = JSON.parse(saKeyJson);
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now - 30
    };

    const toBase64Url = (buf: Uint8Array): string => {
      let binary = "";
      for (let i = 0; i < buf.byteLength; i++) {
        binary += String.fromCharCode(buf[i]);
      }
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };

    const encoder = new TextEncoder();
    const headerB64 = toBase64Url(encoder.encode(JSON.stringify(header)));
    const payloadB64 = toBase64Url(encoder.encode(JSON.stringify(payload)));
    const unsignedToken = `${headerB64}.${payloadB64}`;

    const pem = sa.private_key || "";
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = pem.substring(pem.indexOf(pemHeader) + pemHeader.length, pem.indexOf(pemFooter)).replace(/\s+/g, "");
    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryDer.buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      encoder.encode(unsignedToken)
    );

    const signatureB64 = toBase64Url(new Uint8Array(signatureBuffer));
    const jwt = `${unsignedToken}.${signatureB64}`;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt
      }).toString()
    });

    const tokenData = await res.json();
    if (!res.ok || !tokenData.access_token) {
      console.warn("[documents-batch-relay] Google OAuth2 トークン生成エラー:", tokenData);
      return "";
    }

    cachedSaToken = {
      token: tokenData.access_token,
      expiresAt: now + (tokenData.expires_in || 3600)
    };
    return tokenData.access_token;
  } catch (err: any) {
    console.warn("[documents-batch-relay] SAキー認証例外:", err.message);
    return "";
  }
}

// -----------------------------------------------------------------------------
// Cloud Logging REST API v2 からジョブ自身の正確な実行結果 ([JOB_RESULT_JSON]) を抽出
// -----------------------------------------------------------------------------
async function fetchJobResultFromCloudLogging(
  projectId: string,
  executionName: string,
  accessToken: string
): Promise<{
  summary: {
    total_detected: number;
    processed_count: number;
    flagged_count: number;
    skipped_count: number;
    error_count: number;
  } | null;
  file_results: any[] | null;
  raw_log_found: boolean;
}> {
  try {
    const res = await fetch("https://logging.googleapis.com/v2/entries:list", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        resourceNames: [`projects/${projectId}`],
        filter: `resource.type="cloud_run_job" AND labels."run.googleapis.com/execution_name"="${executionName}"`,
        orderBy: "timestamp desc",
        pageSize: 50
      })
    });

    if (!res.ok) {
      console.warn(`[documents-batch-relay] Cloud Logging API エラー: HTTP ${res.status}`);
      return { summary: null, file_results: null, raw_log_found: false };
    }

    const data = await res.json();
    const entries = data.entries || [];

    // 1. [JOB_RESULT_JSON] の完全JSON抽出 (最優先・完全な実績)
    for (const e of entries) {
      const payload = e.textPayload || "";
      if (payload.includes("[JOB_RESULT_JSON]")) {
        const jsonStr = payload.slice(payload.indexOf("[JOB_RESULT_JSON]") + "[JOB_RESULT_JSON]".length).trim();
        try {
          const parsed = JSON.parse(jsonStr);
          return {
            summary: {
              total_detected: Number(parsed.total_detected) || 0,
              processed_count: Number(parsed.processed_count) || 0,
              flagged_count: Number(parsed.flagged_count) || 0,
              skipped_count: Number(parsed.skipped_count) || 0,
              error_count: Number(parsed.error_count) || 0
            },
            file_results: Array.isArray(parsed.file_results) ? parsed.file_results : [],
            raw_log_found: true
          };
        } catch (parseErr: any) {
          console.warn("[documents-batch-relay] [JOB_RESULT_JSON] パース例外:", parseErr.message);
        }
      }
    }

    // 2. 完了サマリー行からの件数抽出フォールバック
    for (const e of entries) {
      const payload = e.textPayload || "";
      const m = payload.match(/status=([a-z_]+),\s*detected=(\d+),\s*processed=(\d+),\s*flagged=(\d+),\s*skipped=(\d+),\s*errors=(\d+)/);
      if (m) {
        return {
          summary: {
            total_detected: parseInt(m[2], 10),
            processed_count: parseInt(m[3], 10),
            flagged_count: parseInt(m[4], 10),
            skipped_count: parseInt(m[5], 10),
            error_count: parseInt(m[6], 10)
          },
          file_results: [],
          raw_log_found: true
        };
      }
    }

    return { summary: null, file_results: null, raw_log_found: false };
  } catch (err: any) {
    console.warn("[documents-batch-relay] fetchJobResultFromCloudLogging 例外:", err.message);
    return { summary: null, file_results: null, raw_log_found: false };
  }
}

// -----------------------------------------------------------------------------
// メインハンドラ
// -----------------------------------------------------------------------------
serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL", "https://yg9qauzldubdo1ca5z0z.helloreaddy.com");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
    const workerSecret = getEnv("DOCUMENTS_WORKER_SECRET");

    // Google Cloud 設定
    const gcpProjectId = getEnv("GCP_PROJECT_ID", "bis-square-integration-507508");
    const gcpRegion = getEnv("GCP_REGION", "asia-northeast1");
    const gcpJobName = getEnv("GCP_CLOUD_RUN_JOB_NAME", "drive-auto-import-worker");
    const gcpServiceAccountKey = getEnv("GCP_SERVICE_ACCOUNT_KEY");
    const gcpDirectToken = getEnv("GCP_ACCESS_TOKEN");

    const inboxFolderId = getEnv("DRIVE_INBOX_FOLDER_ID", "1ctLRUQbwINARCDuGdYnpkrCkkK287HV5");
    const processedFolderId = getEnv("DRIVE_PROCESSED_FOLDER_ID", "1MUpsttOl2MY1Q8QAptSX_1vBGjl_aXY3");
    const flaggedFolderId = getEnv("DRIVE_FLAGGED_FOLDER_ID", "1kgnzKvslB0J2Mq8ZM8-PqsTjret1CQ3E");

    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        return errorResponse("INVALID_JSON", "リクエストJSONの解析に失敗しました。", 400, cors);
      }
    }

    const action = String(body.action || ACTIONS.get_inbox_import_status).trim();

    // -------------------------------------------------------------------------
    // 1. get_inbox_import_status: 最新ジョブ状態および書類台帳サマリー取得
    // -------------------------------------------------------------------------
    if (action === ACTIONS.get_inbox_import_status) {
      const requestedJobId = String(body.job_id || "").trim();

      // 1-1. 書類台帳のサマリー
      let ledgerSummary = {
        total_documents: 0,
        processed_count: 0,
        flagged_count: 0,
        pending_count: 0
      };
      let currentJob: any = null;

      try {
        const listRes = await invokeRelay(supabaseUrl, supabaseAnonKey, workerSecret, { action: "list_documents" });
        const docs = listRes.data?.documents || [];
        ledgerSummary = {
          total_documents: docs.length,
          processed_count: docs.filter((d: any) => d.status === "processed" && d.drive_folder_id === processedFolderId).length,
          flagged_count: docs.filter((d: any) => d.drive_folder_id === flaggedFolderId).length,
          pending_count: docs.filter((d: any) => d.status === "pending_amount" && d.drive_folder_id !== flaggedFolderId).length,
        };
      } catch (err: any) {
        console.warn("[documents-batch-relay] 台帳一覧取得エラー:", err.message);
      }

      // 1-2. Google Cloud 認証トークン取得 (SA自動生成)
      const accessToken = await getGoogleCloudAccessToken(gcpServiceAccountKey, gcpDirectToken);

      // 1-3. Google Cloud Run Jobs の Execution 状態照会 & ログ結果取得
      if (gcpProjectId && accessToken) {
        try {
          let targetExecutionName = requestedJobId;

          // ジョブID/Execution名が未指定、または接頭辞で一致しない場合は最新Executionを検索
          if (!targetExecutionName || !targetExecutionName.startsWith(gcpJobName)) {
            const listExecUrl = `https://run.googleapis.com/v2/projects/${gcpProjectId}/locations/${gcpRegion}/jobs/${gcpJobName}/executions?pageSize=1`;
            const listExecRes = await fetch(listExecUrl, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (listExecRes.ok) {
              const execsJson = await listExecRes.json();
              const latest = (execsJson.executions || [])[0];
              if (latest?.name) {
                targetExecutionName = latest.name.split("/").pop();
              }
            }
          }

          if (targetExecutionName) {
            const execUrl = `https://run.googleapis.com/v2/projects/${gcpProjectId}/locations/${gcpRegion}/jobs/${gcpJobName}/executions/${targetExecutionName}`;
            const execRes = await fetch(execUrl, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (execRes.ok) {
              const execData = await execRes.json();
              const conditions = execData.conditions || [];
              const completedCond = conditions.find((c: any) => c.type === "Completed");

              let execStatus = "running";
              if (completedCond) {
                if (completedCond.state === "CONDITION_SUCCEEDED" || completedCond.status === "True") {
                  execStatus = "completed";
                } else if (completedCond.state === "CONDITION_FAILED" || completedCond.status === "False") {
                  execStatus = "failed";
                }
              }

              // 完了または失敗時、Cloud Logging から実際のジョブ自身の結果を取得
              let jobSummary: any = null;
              let fileResults: any[] | null = null;
              let resultStatus = "in_progress";
              let statusMessage = "ジョブ実行中...";

              if (execStatus !== "running") {
                const logResult = await fetchJobResultFromCloudLogging(gcpProjectId, targetExecutionName, accessToken);
                if (logResult.raw_log_found && logResult.summary) {
                  jobSummary = logResult.summary;
                  fileResults = logResult.file_results;
                  resultStatus = "retrieved";
                  if (jobSummary.error_count > 0 && jobSummary.processed_count > 0) {
                    execStatus = "partially_failed";
                  } else if (jobSummary.error_count > 0 && jobSummary.processed_count === 0 && jobSummary.flagged_count === 0 && jobSummary.skipped_count === 0) {
                    execStatus = "failed";
                  }
                  statusMessage = "ジョブ完了（実績取得済み）";
                } else {
                  // ログ未取得契約: 空の実績や0件の成功件数を捏造せず「結果未取得」と返す
                  resultStatus = "not_retrieved";
                  jobSummary = null;
                  fileResults = null;
                  statusMessage = "結果未取得（ログ記録取得待機中または未検出）";
                }
              }

              currentJob = {
                job_id: requestedJobId || targetExecutionName,
                execution_name: targetExecutionName,
                status: execStatus,
                result_status: resultStatus,
                runner: "cloud_run_job",
                started_at: execData.startTime || null,
                finished_at: execData.completionTime || null,
                message: statusMessage,
                summary: jobSummary,
                file_results: fileResults
              };
            }
          }
        } catch (crErr: any) {
          console.warn("[documents-batch-relay] Cloud Run Execution 照会エラー:", crErr.message);
        }
      }

      return jsonResponse({
        success: true,
        action,
        folders: {
          inbox_folder_id: inboxFolderId,
          processed_folder_id: processedFolderId,
          flagged_folder_id: flaggedFolderId
        },
        document_ledger_summary: ledgerSummary,
        current_job: currentJob
      }, 200, cors);
    }

    // -------------------------------------------------------------------------
    // 2. start_inbox_import: ワーカー環境 (Cloud Run Jobs) へのジョブ開始依頼
    // -------------------------------------------------------------------------
    if (action === ACTIONS.start_inbox_import) {
      // サーバー環境変数 (DOCUMENTS_WORKER_SECRET) の設定確認 (フェイルクローズ)
      if (!workerSecret) {
        return errorResponse(
          "WORKER_AUTH_NOT_CONFIGURED",
          "ワーカー認証シークレットがサーバー環境変数 (DOCUMENTS_WORKER_SECRET) に設定されていません。",
          503,
          cors
        );
      }

      // confirmed_by は操作スタッフの監査表示値
      const inputConfirmedBy = String(body.confirmed_by || "").trim();

      // 呼び出し元の認証・権限検証
      const authResult = await verifyCallerAuth(req, supabaseUrl, supabaseAnonKey, workerSecret, inputConfirmedBy);
      if (!authResult.ok) {
        return errorResponse(authResult.code, authResult.message, authResult.status, cors);
      }

      // 画面起動の保留判定:
      // 現行Readdy画面 (anon_key) からの直接起動はアクセス制御の厳格化に伴い保留 (403) とし、
      // 権限のある管理者/ワーカー (x-bis-worker-token) または認証済みスタッフセッションのみ許可。
      if (authResult.callerType === "frontend_staff") {
        return errorResponse(
          "UI_LAUNCH_ON_HOLD",
          "現在、Readdy画面からの直接起動はアクセス制御の厳格化に伴い保留されています。取込ジョブは権限のある担当者が Cloud Run Jobs（手動起動または管理者トークン）から実行してください。本画面からは処理結果および台帳の照会が可能です。",
          403,
          cors
        );
      }

      const confirmedBy = inputConfirmedBy || (authResult.callerType === "authenticated_user" ? (authResult.userEmail || authResult.userId) : "worker_direct");

      // 一意なジョブIDの採番
      const jobId = String(body.job_id || "").trim() || `job_${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`;
      const maxFiles = Number.isFinite(body.max_files) ? Number(body.max_files) : 50;
      const isDryRun = Boolean(body.dry_run);

      // Google Cloud 認証トークン取得 (SA自動生成)
      const accessToken = await getGoogleCloudAccessToken(gcpServiceAccountKey, gcpDirectToken);
      if (!accessToken) {
        return errorResponse(
          "GCP_AUTH_FAILED",
          "Cloud Run 起動用の Google Cloud 認証トークンを生成できませんでした。GCP_SERVICE_ACCOUNT_KEY の設定を確認してください。",
          500,
          cors
        );
      }

      // Cloud Run Jobs API (v2) によるジョブ実行
      try {
        const runJobUrl = `https://run.googleapis.com/v2/projects/${gcpProjectId}/locations/${gcpRegion}/jobs/${gcpJobName}:run`;
        const runRes = await fetch(runJobUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            overrides: {
              containerOverrides: [
                {
                  env: [
                    { name: "IMPORT_JOB_ID", value: jobId },
                    { name: "DOCUMENTS_WORKER_SECRET", value: workerSecret },
                    { name: "CONFIRMED_BY", value: confirmedBy },
                    { name: "MAX_FILES", value: String(maxFiles) },
                    { name: "DRY_RUN", value: isDryRun ? "true" : "false" },
                    { name: "TARGET_FILE_ID", value: String(body.file_id || "") }
                  ]
                }
              ]
            }
          })
        });

        const runJson = await runRes.json();
        if (!runRes.ok) {
          return errorResponse(
            "CLOUD_RUN_JOB_START_FAILED",
            `Cloud Run Jobs の起動に失敗しました: ${runJson.error?.message || runRes.statusText}`,
            runRes.status,
            cors
          );
        }

        const rawExecutionName = runJson.metadata?.name ? runJson.metadata.name.split("/").pop() : (runJson.name ? runJson.name.split("/").pop() : "");
        const executionName = rawExecutionName || jobId;

        return jsonResponse({
          success: true,
          action: "start_inbox_import",
          job_id: jobId,
          execution_name: executionName,
          status: "running",
          runner: "cloud_run_job",
          operator: confirmedBy,
          max_files: maxFiles,
          dry_run: isDryRun,
          message: "Cloud Run Job の実行を開始しました。"
        }, 200, cors);
      } catch (cloudRunErr: any) {
        return errorResponse(
          "CLOUD_RUN_API_ERROR",
          `Cloud Run Jobs API 通信エラー: ${cloudRunErr.message}`,
          502,
          cors
        );
      }
    }

    return errorResponse("UNKNOWN_ACTION", `未対応のアクションです: ${action}`, 400, cors);
  } catch (err: any) {
    return errorResponse("SERVER_ERROR", err.message || "内部エラーが発生しました。", 500, cors);
  }
});
