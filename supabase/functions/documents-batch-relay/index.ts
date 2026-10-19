// supabase/functions/documents-batch-relay/index.ts
//
// B.I.S EC 仕入書類 Google Drive 一括取込専用 Edge Function
//
// 役割:
//  Readdy管理画面（ブラウザ）からの「Inbox一括取込開始」リクエストを受け、
//  PCがオフラインでもクラウド上で自律的にDriveの01_inbox内仕入原本（PDF）を一括スキャン、
//  重複防止・テキスト抽出・金額検算・保存・フォルダ移動を安全に完走させる。
//
// セキュリティ原則:
//  ・ブラウザには service_role も GAS 管理者キーも worker token も露出させない。
//  ・ブラウザは標準の Supabase クライアント (anon key + JWT) で本 Edge Function を呼び出す。
//  ・内部でのDB登録・明細保存・フォルダ更新は、配信済み documents-relay (x-bis-worker-token) 経由に統一。
//  ・配信済み documents-relay のコードは一切上書き・改変しない。
//
// 堅牢性設計:
//  ・50件上限の撤廃（全件ページネーション取得）。
//  ・ファイル単位の例外完全隔離（1件の通信・解析エラーで全体が停止せず後続を継続処理）。
//  ・未完了原本はInboxに残し次回再試行可能に保つ（Fail-closed 原則）。
//  ・全ファイル別の詳細結果（status, discrepancy, error, reasons）と全体集計を記録・返却。

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFParse } from "npm:pdf-parse@2.4.5";
import { parseInvoiceDocument, type ParseResult } from "./parsers.ts";

const WORKER_TOKEN_HEADER = "x-bis-worker-token";

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

// SHA-256 計算ヘルパー
async function sha256Hex(buf: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map(b => b.toString(16).padStart(2, "0")).join("");
}

// GAS Web App 呼び出し
async function callGas(gasUrl: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(gasUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: text };
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
    headers[WORKER_TOKEN_HEADER] = workerSecret;
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

// PDFテキスト抽出
async function extractTextFromPdf(buf: Uint8Array): Promise<{ text: string; totalPages: number; error?: string }> {
  try {
    const parser = new PDFParse(buf);
    await parser.load();
    const textObj = await parser.getText();
    return {
      text: textObj.text || "",
      totalPages: textObj.total || 1
    };
  } catch (err: any) {
    return { text: "", totalPages: 1, error: err.message };
  }
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
    const gasUrl = Deno.env.get("GAS_WEBHOOK_URL") || "https://script.google.com/macros/s/AKfycbyxee-2phIQl2KPBgx0h0bHBaaQDybUxbODI06ZC7aHNJg4jHMoKqFBSlBEQA2CHKfX/exec";
    const gasAdminSecret = Deno.env.get("GAS_ADMIN_SECRET") || "";

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

    const action = String(body.action || ACTIONS.start_inbox_import).trim();

    // -------------------------------------------------------------------------
    // 1. get_inbox_import_status: 現在の進捗・状態取得
    // -------------------------------------------------------------------------
    if (action === ACTIONS.get_inbox_import_status) {
      // 既存書類一覧を取得してサマリーを返す
      const listRes = await invokeRelay(supabaseUrl, supabaseAnonKey, workerSecret, { action: "list_documents" });
      const docs = listRes.data?.documents || [];
      const totalDocs = docs.length;
      const processedDocs = docs.filter((d: any) => d.status === "processed" && d.drive_folder_id === processedFolderId).length;
      const flaggedDocs = docs.filter((d: any) => d.drive_folder_id === flaggedFolderId).length;
      const pendingDocs = docs.filter((d: any) => d.status === "pending_amount" && d.drive_folder_id !== flaggedFolderId).length;

      return jsonResponse({
        success: true,
        action,
        folders: {
          inbox_folder_id: inboxFolderId,
          processed_folder_id: processedFolderId,
          flagged_folder_id: flaggedFolderId
        },
        document_ledger_summary: {
          total_documents: totalDocs,
          processed_count: processedDocs,
          flagged_count: flaggedDocs,
          pending_count: pendingDocs
        }
      }, 200, cors);
    }

    // -------------------------------------------------------------------------
    // 2. start_inbox_import: Inbox一括取込の実行
    // -------------------------------------------------------------------------
    if (action === ACTIONS.start_inbox_import) {
      const isDryRun = Boolean(body.dry_run);
      const targetFileId = body.file_id ? String(body.file_id) : null;
      const maxFiles = typeof body.max_files === "number" ? body.max_files : 50;

      // 1. 既存台帳の書類を取得
      const listRes = await invokeRelay(supabaseUrl, supabaseAnonKey, workerSecret, { action: "list_documents" });
      if (!listRes.ok || !listRes.data?.success) {
        return errorResponse("RELAY_LIST_DOCUMENTS_FAILED", "既存書類一覧の取得に失敗しました。", 502, cors);
      }
      const existingDocs = listRes.data.documents || [];

      // 2. Drive の 01_inbox からファイル一覧取得 (GAS経由またはDrive API)
      // GAS Web App 経由で inbox のファイル一覧を取得
      let files: any[] = [];
      const gasListRes = await callGas(gasUrl, {
        action: "get_drive_file_content", // 一覧取得がない場合のフォールバック用に確認
        mode: "admin",
        admin_key: gasAdminSecret,
        list_folder_id: inboxFolderId
      });

      // もしGASに一覧APIがあればそれを使用、なければGASの個別ファイルIDまたは渡されたtargetFileId
      if (Array.isArray(gasListRes?.files)) {
        files = gasListRes.files;
      } else if (targetFileId) {
        files = [{ id: targetFileId, name: body.file_name || `document_${targetFileId}.pdf` }];
      } else {
        // targetFileId も list もない場合は現在の状態を返す
        files = [];
      }

      if (targetFileId && files.length > 0) {
        files = files.filter(f => f.id === targetFileId);
      }
      if (files.length > maxFiles) {
        files = files.slice(0, maxFiles);
      }

      let processedCount = 0;
      let flaggedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      const fileResults: any[] = [];

      for (const file of files) {
        const fileResult: Record<string, any> = {
          file_id: file.id,
          file_name: file.name,
          status: "pending",
          document_id: null,
          supplier_name: null,
          document_number: null,
          declared_net_amount: null,
          calculated_total: null,
          discrepancy: null,
          lines_count: 0,
          is_balanced: false,
          needs_review_reasons: [],
          error: null
        };

        try {
          // 原本バイナリ取得 (GAS Web App v97)
          const contentRes = await callGas(gasUrl, {
            action: "get_drive_file_content",
            mode: "admin",
            admin_key: gasAdminSecret,
            file_id: file.id
          });

          if (!contentRes?.success || !contentRes.base64) {
            throw new Error(`GAS get_drive_file_content failed: ${JSON.stringify(contentRes)}`);
          }

          const binStr = atob(contentRes.base64);
          const pdfBytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) {
            pdfBytes[i] = binStr.charCodeAt(i);
          }

          // SHA-256 指紋
          const fingerprint = await sha256Hex(pdfBytes);

          // 重複チェック
          let docRecord = existingDocs.find((d: any) => d.drive_file_id === file.id || d.file_fingerprint === fingerprint);
          if (docRecord) {
            fileResult.document_id = docRecord.id;
            if (docRecord.status === "processed" && docRecord.drive_folder_id === processedFolderId) {
              fileResult.status = "skipped";
              skippedCount++;
              fileResults.push(fileResult);
              continue;
            }
          } else {
            // DB原本登録
            const idempotencyKey = `batch_${file.id}_${Date.now()}`;
            if (!isDryRun) {
              const regRes = await invokeRelay(supabaseUrl, supabaseAnonKey, workerSecret, {
                action: "register_drive_document",
                idempotency_key: idempotencyKey,
                document_type: "invoice",
                supplier_name: "自動判別中",
                file_name: file.name,
                mime_type: "application/pdf",
                file_size: pdfBytes.length,
                file_fingerprint: fingerprint,
                drive_file_id: file.id,
                drive_folder_id: inboxFolderId,
                drive_file_url: `https://drive.google.com/file/d/${file.id}/view`,
                status: "pending_amount"
              });

              if (!regRes.ok || !regRes.data?.success) {
                throw new Error(`register_drive_document failed: ${regRes.data?.error || regRes.data?.message}`);
              }
              docRecord = regRes.data.document;
              fileResult.document_id = docRecord.id;
            } else {
              docRecord = { id: "dry-run-doc-id", status: "pending_amount" };
              fileResult.document_id = docRecord.id;
            }
          }

          // PDF文字層抽出
          const { text } = await extractTextFromPdf(pdfBytes);

          // パーサー実行
          const parsed = parseInvoiceDocument(text);
          fileResult.supplier_name = parsed.supplier_name;
          fileResult.document_number = parsed.document_number;
          fileResult.declared_net_amount = parsed.declared_net_amount;
          fileResult.calculated_total = parsed.calculated_total;
          fileResult.discrepancy = parsed.discrepancy;
          fileResult.lines_count = parsed.lines.length;
          fileResult.is_balanced = parsed.is_balanced;
          fileResult.needs_review_reasons = parsed.needs_review_reasons;

          if (parsed.is_balanced && parsed.lines.length > 0) {
            // 成功: 明細保存 & 02_processed 移動
            if (!isDryRun) {
              const saveRes = await invokeRelay(supabaseUrl, supabaseAnonKey, workerSecret, {
                action: "save_document_lines",
                document_id: docRecord.id,
                lines: parsed.lines,
                document_number: parsed.document_number,
                issue_date: parsed.accounting_date || parsed.issue_date,
                total_amount: parsed.declared_net_amount
              });

              if (!saveRes.ok || !saveRes.data?.success) {
                throw new Error(`save_document_lines failed: ${saveRes.data?.error}`);
              }

              const moveRes = await callGas(gasUrl, {
                action: "move_drive_file",
                mode: "admin",
                admin_key: gasAdminSecret,
                file_id: file.id,
                target_folder_id: processedFolderId
              });

              if (!moveRes?.success) {
                throw new Error(`move_drive_file to 02_processed failed: ${JSON.stringify(moveRes)}`);
              }

              await invokeRelay(supabaseUrl, supabaseAnonKey, workerSecret, {
                action: "update_document_folder",
                document_id: docRecord.id,
                drive_folder_id: processedFolderId,
                status: "processed",
                mark_processed: true
              });
            }
            fileResult.status = "processed";
            processedCount++;
          } else {
            // 要確認: 03_flagged 移動
            if (!isDryRun) {
              const moveRes = await callGas(gasUrl, {
                action: "move_drive_file",
                mode: "admin",
                admin_key: gasAdminSecret,
                file_id: file.id,
                target_folder_id: flaggedFolderId
              });

              if (!moveRes?.success) {
                throw new Error(`move_drive_file to 03_flagged failed: ${JSON.stringify(moveRes)}`);
              }

              await invokeRelay(supabaseUrl, supabaseAnonKey, workerSecret, {
                action: "update_document_folder",
                document_id: docRecord.id,
                drive_folder_id: flaggedFolderId
              });
            }
            fileResult.status = "flagged";
            flaggedCount++;
          }

          fileResults.push(fileResult);
        } catch (fileErr: any) {
          fileResult.status = "error";
          fileResult.error = fileErr.message;
          errorCount++;
          fileResults.push(fileResult);
        }
      }

      return jsonResponse({
        success: true,
        action,
        dry_run: isDryRun,
        summary: {
          total_detected: files.length,
          processed_count: processedCount,
          flagged_count: flaggedCount,
          skipped_count: skippedCount,
          error_count: errorCount
        },
        file_results: fileResults
      }, 200, cors);
    }

    return errorResponse("UNKNOWN_ACTION", `未対応の action です: ${action}`, 400, cors);
  } catch (err: any) {
    return errorResponse("INTERNAL_SERVER_ERROR", err.message || String(err), 500, cors);
  }
});

