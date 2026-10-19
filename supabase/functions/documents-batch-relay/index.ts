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
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
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
    // 2. start_inbox_import: ワーカーサーバーへのジョブ開始依頼
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

      // 操作スタッフ識別子 (confirmed_by) の検証 (監査証跡)
      const confirmedBy = String(body.confirmed_by || "").trim();
      const tokenHeader = (req.headers.get("x-bis-worker-token") || "").trim();

      // セキュリティ境界設計:
      // ブラウザからは秘密鍵 (DOCUMENTS_WORKER_SECRET) を要求せず、confirmed_by のみを検証する。
      // 1) 外部スクリプト等から明示的に x-bis-worker-token が渡された場合: トークン一致を検証
      if (tokenHeader && tokenHeader !== workerSecret) {
        return errorResponse("UNAUTHORIZED_ADMIN_ACTION", "無効な管理者トークンです。", 403, cors);
      }

      // 2) ブラウザからの通常呼出の場合: confirmed_by による操作スタッフ指定を必須化
      if (!tokenHeader && !confirmedBy) {
        return errorResponse(
          "OPERATOR_IDENTIFIER_REQUIRED",
          "一括取込の起動には操作スタッフ識別子 (confirmed_by) が必要です。ブラウザから秘密鍵を送信する必要はありません。",
          400,
          cors
        );
      }

      try {
        // サーバー間通信: Edge Function が内部保持する workerSecret をヘッダーに付与してワーカーへ安全に中継
        const startRes = await fetch(`${workerServerUrl}/start`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-bis-worker-token": workerSecret
          },
          body: JSON.stringify({
            ...body,
            confirmed_by: confirmedBy || "admin_direct"
          })
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
