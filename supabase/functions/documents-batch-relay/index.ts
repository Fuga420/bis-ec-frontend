// supabase/functions/documents-batch-relay/index.ts
//
// B.I.S EC 仕入書類 Google Drive 一括取込 ジョブ管理・起動専用 薄型 Edge Function
//
// 役割:
//  Readdy管理画面（ブラウザ）からの「Inbox一括取込開始」リクエストを受け、
//  常駐/サーバー上の Node.js ワーカー環境へジョブの開始を依頼し、
//  ジョブ進捗・ファイル別結果・要確認理由の参照（ステータス照会）を安全に中継する。
//
// アーキテクチャ原則（一本化設計）:
//  ・取込本体（PDF解析、金額検算、明細DB登録、Drive移動）はすべて Node.js ワーカーに一本化。
//  ・本 Edge Function 側には重いパーサーや PDF パースの二重実装を持たない。
//  ・ブラウザにはワーカーの認証情報や内部キーを一切露出させない。
//  ・タブを閉じた後やリロード後にも、本エンドポイント（get_inbox_import_status）から
//    最新ジョブID、進捗、ファイル別理由が確実に再取得できる。

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ACTIONS = {
  start_inbox_import: "start_inbox_import",
  get_inbox_import_status: "get_inbox_import_status",
} as const;

// CORS
function getAllowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
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
// 現行Readdy画面（社内SPA）は Supabase anon_key を使用。
// confirmed_by は操作スタッフの監査表示値として記録し、本人認証とは扱わない。
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

// documents-relay 呼び出しヘルパー
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
  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = { success: false, error: text };
  }
  return { status: res.status, ok: res.ok, data };
}

serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const workerSecret = Deno.env.get("DOCUMENTS_WORKER_SECRET") || "";
    const workerServerUrl = Deno.env.get("WORKER_SERVER_URL") || "http://localhost:8080";

    // Google Cloud Run Jobs 起動用設定 (GCP連携時)
    const gcpProjectId = Deno.env.get("GCP_PROJECT_ID") || "";
    const gcpRegion = Deno.env.get("GCP_REGION") || "asia-northeast1";
    const gcpJobName = Deno.env.get("GCP_CLOUD_RUN_JOB_NAME") || "bis-drive-auto-import-job";
    const gcpAccessToken = Deno.env.get("GCP_ACCESS_TOKEN") || "";

    const inboxFolderId = Deno.env.get("DRIVE_INBOX_FOLDER_ID") || "1ctLRUQbwINARCDuGdYnpkrCkkK287HV5";
    const processedFolderId = Deno.env.get("DRIVE_PROCESSED_FOLDER_ID") || "1MUpsttOl2MY1Q8QAptSX_1vBGjl_aXY3";
    const flaggedFolderId = Deno.env.get("DRIVE_FLAGGED_FOLDER_ID") || "1kgnzKvslB0J2Mq8ZM8-PqsTjret1CQ3E";

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

        // 1-2. 書類が100件を超えてもジョブ結果が埋没しないよう、supplier_name (SYSTEM_BATCH_JOB) でフィルタ照会
        const supplierFilter = requestedJobId ? `SYSTEM_BATCH_JOB:${requestedJobId}` : "SYSTEM_BATCH_JOB";
        const jobListRes = await invokeRelay(supabaseUrl, supabaseAnonKey, workerSecret, {
          action: "list_documents",
          supplier_name: supplierFilter,
          page_size: 100
        });
        const jobDocs = (jobListRes.data?.documents || []).filter((d: any) => d.document_type === "batch_import_job");
        if (jobDocs.length > 0) {
          jobDocs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          const targetDoc = requestedJobId
            ? jobDocs.find((d: any) => d.document_number === requestedJobId) || jobDocs[0]
            : jobDocs[0];
          if (targetDoc && targetDoc.notes) {
            try {
              currentJob = JSON.parse(targetDoc.notes);
            } catch {
              currentJob = {
                job_id: targetDoc.document_number,
                status: targetDoc.status === "processed" ? "completed" : targetDoc.status,
                raw_notes: targetDoc.notes
              };
            }
          }
        }
      } catch (err: any) {
        console.warn("[documents-batch-relay] 台帳一覧取得エラー:", err.message);
      }

      // 1-3. ワーカーサーバーが生きていればよりリアルタイムなジョブ状態を取得・マージ
      try {
        const statusUrl = requestedJobId
          ? `${workerServerUrl}/status?job_id=${encodeURIComponent(requestedJobId)}`
          : `${workerServerUrl}/status`;
        const statusRes = await fetch(statusUrl, { method: "GET" });
        if (statusRes.ok) {
          const statusJson = await statusRes.json();
          if (statusJson.current_job?.job_id) {
            currentJob = statusJson.current_job;
          }
        }
      } catch (workerErr: any) {
        console.warn("[documents-batch-relay] ワーカーサーバー状態照会未達 (DB永続化状態を使用):", workerErr.message);
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
    // 2. start_inbox_import: ワーカー環境へのジョブ開始依頼
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
      // 現行Readdyにはサーバー側でスタッフを限定できるログインセッションが存在しないため、
      // 公開anon_key + 任意のconfirmed_by による画面直接起動は保留 (403) とし、
      // 権限のある担当者による Cloud Run Job 手動起動または管理者トークン実行のみを許可する。
      if (authResult.callerType === "frontend_staff") {
        return errorResponse(
          "UI_LAUNCH_ON_HOLD",
          "現在、Readdy画面からの直接起動はアクセス制御の厳格化に伴い保留されています。取込ジョブは権限のある担当者が Cloud Run Jobs（手動起動または管理者トークン）から実行してください。本画面からは処理結果および台帳の照会が可能です。",
          403,
          cors
        );
      }

      const confirmedBy = inputConfirmedBy || (authResult.callerType === "authenticated_user" ? (authResult.userEmail || authResult.userId) : "worker_direct");

      // 一意なジョブIDの採番 (画面・DB・コンテナ・Execution名で同期)
      const jobId = String(body.job_id || "").trim() || `job_${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`;
      const maxFiles = Number.isFinite(body.max_files) ? Number(body.max_files) : 50;
      const isDryRun = Boolean(body.dry_run);

      const executionPayload = {
        ...body,
        job_id: jobId,
        confirmed_by: confirmedBy,
        max_files: maxFiles,
        dry_run: isDryRun,
        operator_user_id: authResult.callerType === "authenticated_user" ? authResult.userId : null,
        operator_email: authResult.callerType === "authenticated_user" ? authResult.userEmail : null,
      };

      // 方式 A: Cloud Run Jobs API (v2) によるジョブ実行 (GCP設定がある場合)
      if (gcpProjectId && gcpAccessToken) {
        try {
          const runJobUrl = `https://run.googleapis.com/v2/projects/${gcpProjectId}/locations/${gcpRegion}/jobs/${gcpJobName}:run`;
          const runRes = await fetch(runJobUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${gcpAccessToken}`,
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
                      { name: "OPERATOR_USER_ID", value: executionPayload.operator_user_id || "" },
                      { name: "OPERATOR_EMAIL", value: executionPayload.operator_email || "" },
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

          const executionName = runJson.name || "";
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

      // 方式 B: HTTP ワーカーサーバー経由のジョブ起動 (ローカル / 開発サーバー)
      try {
        const startRes = await fetch(`${workerServerUrl}/start`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-bis-worker-token": workerSecret
          },
          body: JSON.stringify(executionPayload)
        });

        const startJson = await startRes.json();
        return jsonResponse(startJson, startRes.status, cors);
      } catch (startErr: any) {
        return errorResponse(
          "WORKER_SERVER_UNAVAILABLE",
          `取込ワーカーサーバー (${workerServerUrl}) と通信できませんでした。サーバーが稼働しているか確認してください: ${startErr.message}`,
          503,
          cors
        );
      }
    }

    return errorResponse("UNKNOWN_ACTION", `未対応のアクションです: ${action}`, 400, cors);
  } catch (err: any) {
    return errorResponse("SERVER_ERROR", err.message || "内部エラーが発生しました。", 500, cors);
  }
});
