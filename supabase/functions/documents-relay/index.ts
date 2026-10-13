// documents-relay
// 独立書類台帳（Independent Document Ledger）専用の中継（Readdy Backend Edge Function）。
//
// 役割（Phase 2 MVP）:
//   Readdy(ブラウザ) --POST/GET--> この中継 --(service_role)--> Supabase DB
//                                          --(GAS_ADMIN_SECRET)--> GAS /exec (Drive保存)
//
// セキュリティ原則:
// ・ブラウザには service_role も GAS 管理者キーも露出させない。
// ・ブラウザは標準の Supabase クライアント (anon key + JWT) で本 Edge Function を呼び出す。
// ・confirmed_by は監査記録用の入力値として扱い、本人認証とは表現しない。
// ・同一再送（idempotency_key）および同一ファイル（SHA-256 fingerprint）の重複防止を徹底。
//
// 環境変数:
//   SUPABASE_URL                   : Supabase プロジェクト URL
//   SUPABASE_SERVICE_ROLE_KEY      : Supabase サービスロールキー（DBフル権限）
//   GAS_WEBHOOK_URL                : GAS Web App の /exec URL
//   GAS_ADMIN_SECRET               : GAS 管理者キー（Drive保存用）
//   ALLOWED_ORIGINS                : 許可オリジン（カンマ区切り、任意）

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ACTIONS = {
  import_document: "import_document",
  list_documents: "list_documents",
  get_document: "get_document",
  save_document_lines: "save_document_lines",
  delete_document_line: "delete_document_line",
  link_product_manual: "link_product_manual",
  unlink_product_manual: "unlink_product_manual",
  get_product_cost: "get_product_cost",
} as const;

type ActionType = (typeof ACTIONS)[keyof typeof ACTIONS];

const KNOWN_ACTIONS: string[] = Object.values(ACTIONS);

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

// ---------- CORS ----------

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveCorsOrigin(req: Request): string {
  const allowed = getAllowedOrigins();
  const origin = req.headers.get("Origin") ?? "";
  if (allowed.length === 0) {
    return origin || "*";
  }
  if (origin && allowed.includes(origin)) return origin;
  return allowed[0];
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    Vary: "Origin",
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  cors: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  cors: Record<string, string>,
  extra?: Record<string, unknown>
): Response {
  return jsonResponse(
    { success: false, error_code: code, error: message, message, ...extra },
    status,
    cors
  );
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function parseGasResponse(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      error_code: "GAS_INVALID_RESPONSE",
      error: text.slice(0, 2000),
      message: text.slice(0, 2000),
    };
  }
}

// ---------- Supabase Admin Client ----------

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------- GAS Forwarding ----------

async function forwardUploadToGas(
  gasUrl: string,
  adminSecret: string,
  payload: {
    idempotency_key: string;
    document_type: string;
    file_name: string;
    mime_type: string;
    base64: string;
  }
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(gasUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "upload_independent_document",
      mode: "admin",
      admin_key: adminSecret,
      ...payload,
    }),
  });
  const text = await res.text();
  return { status: res.status, data: parseGasResponse(text) };
}

// ---------- Document Status Recalculation ----------

async function refreshDocumentStatus(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  documentId: string
): Promise<string> {
  // 監査ビューを取得
  const { data: audit } = await supabase
    .from("v_document_audit_summary")
    .select("*")
    .eq("document_id", documentId)
    .single();

  let newStatus = "imported";
  if (audit) {
    const totalLines = (audit.matched_lines_count || 0) + (audit.unmatched_lines_count || 0);
    if (totalLines > 0) {
      if (audit.unmatched_lines_count === 0 && audit.is_balanced) {
        newStatus = "fully_matched";
      } else if (audit.matched_lines_count > 0) {
        newStatus = "partially_matched";
      } else if (audit.is_balanced === false && audit.original_total_amount !== null) {
        newStatus = "discrepant";
      } else {
        newStatus = "imported";
      }
    }
  }

  await supabase
    .from("documents")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", documentId);

  return newStatus;
}

// ---------- Main Handler ----------

serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(resolveCorsOrigin(req));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const gasUrl = Deno.env.get("GAS_WEBHOOK_URL") ?? "";
  const adminSecret = Deno.env.get("GAS_ADMIN_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceKey) {
    return errorResponse(
      "RELAY_MISCONFIGURED",
      "Supabase DB接続環境変数が設定されていません。",
      500,
      cors
    );
  }

  const supabase = getSupabaseAdmin();

  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      body = {};
    }
  }
  const reqUrl = new URL(req.url);
  const action = asString(body.action ?? reqUrl.searchParams.get("action"));

  if (!KNOWN_ACTIONS.includes(action)) {
    return errorResponse(
      "UNSUPPORTED_ACTION",
      `未対応の action です: ${action || "(空)"}`,
      400,
      cors
    );
  }

  try {
    // ----------------------------------------------------
    // 1. import_document: 書類原本の独立取込 (GAS Drive保存 -> documents登録)
    // ----------------------------------------------------
    if (action === ACTIONS.import_document) {
      if (!gasUrl || !adminSecret) {
        return errorResponse(
          "GAS_RELAY_MISCONFIGURED",
          "GAS連携環境変数が設定されていません。",
          500,
          cors
        );
      }

      const idempotencyKey = asString(body.idempotency_key);
      if (!idempotencyKey) {
        return errorResponse("IDEMPOTENCY_KEY_REQUIRED", "idempotency_key は必須です。", 400, cors);
      }

      const fileName = asString(body.file_name);
      if (!fileName) {
        return errorResponse("FILE_NAME_REQUIRED", "file_name は必須です。", 400, cors);
      }

      const mimeType = asString(body.mime_type).toLowerCase();
      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        return errorResponse(
          "INVALID_MIME_TYPE",
          `未対応のMIMEタイプです: ${mimeType} (PDF/JPG/PNGのみ対応)`,
          400,
          cors
        );
      }

      const base64 = asString(body.base64);
      if (!base64) {
        return errorResponse("BASE64_REQUIRED", "base64 データが空です。", 400, cors);
      }

      // 1-1. 同一再送チェック (idempotency_key)
      const { data: existingByKey, error: errKey } = await supabase
        .from("documents")
        .select("*")
        .eq("idempotency_key", idempotencyKey)
        .eq("is_deleted", false)
        .maybeSingle();

      if (errKey) {
        return errorResponse("DB_QUERY_ERROR", errKey.message, 500, cors);
      }

      if (existingByKey) {
        // 既存の監査ビューも取得
        const { data: audit } = await supabase
          .from("v_document_audit_summary")
          .select("*")
          .eq("document_id", existingByKey.id)
          .maybeSingle();

        return jsonResponse(
          {
            success: true,
            is_reused: true,
            document: existingByKey,
            audit: audit || null,
          },
          200,
          cors
        );
      }

      // 1-2. GASへ原本保存 (独立Driveフォルダへアップロード)
      const documentType = asString(body.document_type) || "invoice";
      const gasPayload = {
        idempotency_key: idempotencyKey,
        document_type: documentType,
        file_name: fileName,
        mime_type: mimeType,
        base64: base64,
      };

      const { status: gasStatus, data: gasRes } = await forwardUploadToGas(
        gasUrl,
        adminSecret,
        gasPayload
      );

      if (gasStatus < 200 || gasStatus >= 300 || !gasRes.success) {
        return errorResponse(
          asString(gasRes.error_code) || "GAS_UPLOAD_FAILED",
          asString(gasRes.error) || asString(gasRes.message) || "GAS Drive保存に失敗しました。",
          502,
          cors,
          { gas_response: gasRes }
        );
      }

      const fileFingerprint = asString(gasRes.file_fingerprint);
      const driveFileId = asString(gasRes.file_id);
      const driveFileUrl = asString(gasRes.file_url);
      const fileSize = Number(gasRes.file_size) || 0;

      // 1-3. 同一ファイル重複チェック (file_fingerprint)
      const { data: existingByHash, error: errHash } = await supabase
        .from("documents")
        .select("*")
        .eq("file_fingerprint", fileFingerprint)
        .eq("is_deleted", false)
        .maybeSingle();

      if (errHash) {
        return errorResponse("DB_QUERY_ERROR", errHash.message, 500, cors);
      }

      if (existingByHash) {
        return errorResponse(
          "DUPLICATE_FILE_FINGERPRINT",
          "同一内容のファイルが既に登録されています。",
          409,
          cors,
          { existing_document_id: existingByHash.id }
        );
      }

      // 1-4. documents テーブルへ登録
      const totalAmountRaw = body.total_amount;
      const totalAmount =
        totalAmountRaw !== undefined && totalAmountRaw !== null && totalAmountRaw !== ""
          ? Number(totalAmountRaw)
          : null;

      const receptionRaw = asString(body.reception_number_raw) || null;
      const receptionNorm = receptionRaw ? receptionRaw.toUpperCase().replace(/\s+/g, "") : null;

      const insertRecord = {
        idempotency_key: idempotencyKey,
        document_type: documentType,
        file_name: asString(gasRes.file_name) || fileName,
        mime_type: asString(gasRes.mime_type) || mimeType,
        file_size: fileSize,
        file_fingerprint: fileFingerprint,
        drive_file_id: driveFileId,
        drive_file_url: driveFileUrl,
        supplier_name: asString(body.supplier_name) || null,
        issue_date: asString(body.issue_date) || null,
        total_amount: totalAmount,
        currency: asString(body.currency) || "JPY",
        reception_number_raw: receptionRaw,
        reception_number_norm: receptionNorm,
        note: asString(body.note) || null,
        status: "imported",
      };

      const { data: newDoc, error: insertErr } = await supabase
        .from("documents")
        .insert(insertRecord)
        .select()
        .single();

      if (insertErr) {
        return errorResponse("DB_INSERT_ERROR", insertErr.message, 500, cors);
      }

      // 監査サマリー取得
      const { data: audit } = await supabase
        .from("v_document_audit_summary")
        .select("*")
        .eq("document_id", newDoc.id)
        .maybeSingle();

      return jsonResponse(
        {
          success: true,
          is_reused: false,
          document: newDoc,
          audit: audit || null,
        },
        201,
        cors
      );
    }

    // ----------------------------------------------------
    // 2. list_documents: 書類台帳一覧の取得 (検索・フィルター・ページング・監査差額付き)
    // ----------------------------------------------------
    if (action === ACTIONS.list_documents) {
      const page = Math.max(1, parseInt(asString(body.page ?? reqUrl.searchParams.get("page")) || "1", 10));
      const pageSizeRaw = parseInt(asString(body.page_size ?? reqUrl.searchParams.get("page_size")) || "20", 10);
      const pageSize = Math.min(100, Math.max(1, pageSizeRaw));
      const statusFilter = asString(body.status ?? reqUrl.searchParams.get("status"));
      const supplierFilter = asString(body.supplier_name ?? reqUrl.searchParams.get("supplier_name"));
      const receptionFilter = asString(body.reception_number ?? reqUrl.searchParams.get("reception_number"));

      let query = supabase
        .from("documents")
        .select("*", { count: "exact" })
        .eq("is_deleted", false);

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (supplierFilter) {
        query = query.ilike("supplier_name", `%${supplierFilter}%`);
      }

      if (receptionFilter) {
        const norm = receptionFilter.toUpperCase().replace(/\s+/g, "");
        query = query.or(`reception_number_raw.ilike.%${receptionFilter}%,reception_number_norm.ilike.%${norm}%`);
      }

      const offset = (page - 1) * pageSize;
      query = query
        .order("issue_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      const { data: docs, count, error: listErr } = await query;

      if (listErr) {
        return errorResponse("DB_QUERY_ERROR", listErr.message, 500, cors);
      }

      // 各ドキュメントの監査サマリーを取得
      const docIds = (docs || []).map((d) => d.id);
      let auditsMap: Record<string, Record<string, unknown>> = {};

      if (docIds.length > 0) {
        const { data: audits } = await supabase
          .from("v_document_audit_summary")
          .select("*")
          .in("document_id", docIds);

        if (audits) {
          auditsMap = Object.fromEntries(audits.map((a) => [a.document_id, a]));
        }
      }

      const enrichedDocs = (docs || []).map((d) => ({
        ...d,
        audit: auditsMap[d.id] || null,
      }));

      const totalCount = count ?? 0;
      return jsonResponse(
        {
          success: true,
          count: totalCount,
          page,
          page_size: pageSize,
          total_pages: Math.ceil(totalCount / pageSize),
          documents: enrichedDocs,
        },
        200,
        cors
      );
    }

    // ----------------------------------------------------
    // 3. get_document: 書類詳細取得 (原本 + 監査サマリー + 明細行 + 紐付け商品)
    // ----------------------------------------------------
    if (action === ACTIONS.get_document) {
      const documentId = asString(body.document_id ?? reqUrl.searchParams.get("document_id"));
      if (!documentId) {
        return errorResponse("DOCUMENT_ID_REQUIRED", "document_id は必須です。", 400, cors);
      }

      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .select("*")
        .eq("id", documentId)
        .eq("is_deleted", false)
        .maybeSingle();

      if (docErr) {
        return errorResponse("DB_QUERY_ERROR", docErr.message, 500, cors);
      }
      if (!doc) {
        return errorResponse("DOCUMENT_NOT_FOUND", "指定された書類が見つかりません。", 404, cors);
      }

      // 監査サマリー
      const { data: audit } = await supabase
        .from("v_document_audit_summary")
        .select("*")
        .eq("document_id", documentId)
        .maybeSingle();

      // 明細行
      const { data: lines, error: lineErr } = await supabase
        .from("document_lines")
        .select("*")
        .eq("document_id", documentId)
        .eq("is_deleted", false)
        .eq("is_active", true)
        .order("line_number", { ascending: true });

      if (lineErr) {
        return errorResponse("DB_QUERY_ERROR", lineErr.message, 500, cors);
      }

      // 各行に紐づく商品リンクを取得
      const lineIds = (lines || []).map((l) => l.id);
      let linksByLineId: Record<string, unknown[]> = {};

      if (lineIds.length > 0) {
        const { data: links } = await supabase
          .from("document_product_links")
          .select("*")
          .in("document_line_id", lineIds)
          .eq("is_deleted", false)
          .order("created_at", { ascending: true });

        if (links) {
          for (const lk of links) {
            if (!linksByLineId[lk.document_line_id]) {
              linksByLineId[lk.document_line_id] = [];
            }
            linksByLineId[lk.document_line_id].push(lk);
          }
        }
      }

      const linesWithLinks = (lines || []).map((l) => ({
        ...l,
        links: linksByLineId[l.id] || [],
      }));

      return jsonResponse(
        {
          success: true,
          document: doc,
          audit: audit || null,
          lines: linesWithLinks,
        },
        200,
        cors
      );
    }

    // ----------------------------------------------------
    // 4. save_document_lines: 手動明細行の登録・更新
    // ----------------------------------------------------
    if (action === ACTIONS.save_document_lines) {
      const documentId = asString(body.document_id);
      if (!documentId) {
        return errorResponse("DOCUMENT_ID_REQUIRED", "document_id は必須です。", 400, cors);
      }

      const rawLines = body.lines;
      if (!Array.isArray(rawLines)) {
        return errorResponse("LINES_ARRAY_REQUIRED", "lines 配列は必須です。", 400, cors);
      }

      const { data: doc } = await supabase
        .from("documents")
        .select("id")
        .eq("id", documentId)
        .eq("is_deleted", false)
        .maybeSingle();

      if (!doc) {
        return errorResponse("DOCUMENT_NOT_FOUND", "指定された書類が見つかりません。", 404, cors);
      }

      const confirmedBy = asString(body.confirmed_by) || null;

      for (let i = 0; i < rawLines.length; i++) {
        const item = rawLines[i] as Record<string, unknown>;
        const lineId = asString(item.id);
        const lineNumber = Number(item.line_number) || i + 1;
        const receptionRaw = asString(item.reception_number_raw) || null;
        const receptionNorm = receptionRaw ? receptionRaw.toUpperCase().replace(/\s+/g, "") : null;
        const lineType = asString(item.line_type) || "purchase";
        const description = asString(item.description) || null;
        const itemAmount =
          item.item_amount !== undefined && item.item_amount !== null && item.item_amount !== ""
            ? Number(item.item_amount)
            : null;
        const feeAmount =
          item.fee_amount !== undefined && item.fee_amount !== null && item.fee_amount !== ""
            ? Number(item.fee_amount)
            : null;
        const taxAmount =
          item.tax_amount !== undefined && item.tax_amount !== null && item.tax_amount !== ""
            ? Number(item.tax_amount)
            : null;
        const totalLineAmount = Number(item.total_line_amount) || 0;
        const lineStatus = asString(item.line_status) || "normal";

        if (lineId) {
          // 更新
          const { error: updErr } = await supabase
            .from("document_lines")
            .update({
              line_number: lineNumber,
              reception_number_raw: receptionRaw,
              reception_number_norm: receptionNorm,
              line_type: lineType,
              description: description,
              item_amount: itemAmount,
              fee_amount: feeAmount,
              tax_amount: taxAmount,
              total_line_amount: totalLineAmount,
              line_status: lineStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("id", lineId)
            .eq("document_id", documentId);

          if (updErr) {
            return errorResponse("LINE_UPDATE_ERROR", updErr.message, 500, cors);
          }
        } else {
          // 新規挿入
          const { error: insErr } = await supabase
            .from("document_lines")
            .insert({
              document_id: documentId,
              line_number: lineNumber,
              page_number: Number(item.page_number) || 1,
              raw_row_index: item.raw_row_index !== undefined ? Number(item.raw_row_index) : null,
              reception_number_raw: receptionRaw,
              reception_number_norm: receptionNorm,
              line_type: lineType,
              description: description,
              item_amount: itemAmount,
              fee_amount: feeAmount,
              tax_amount: taxAmount,
              total_line_amount: totalLineAmount,
              line_status: lineStatus,
              match_status: "unmatched",
              is_active: true,
            });

          if (insErr) {
            return errorResponse("LINE_INSERT_ERROR", insErr.message, 500, cors);
          }
        }
      }

      await refreshDocumentStatus(supabase, documentId);

      const { data: updatedAudit } = await supabase
        .from("v_document_audit_summary")
        .select("*")
        .eq("document_id", documentId)
        .maybeSingle();

      return jsonResponse(
        {
          success: true,
          document_id: documentId,
          audit: updatedAudit || null,
        },
        200,
        cors
      );
    }

    // ----------------------------------------------------
    // 5. delete_document_line: 明細行の論理削除
    // ----------------------------------------------------
    if (action === ACTIONS.delete_document_line) {
      const lineId = asString(body.document_line_id);
      if (!lineId) {
        return errorResponse("DOCUMENT_LINE_ID_REQUIRED", "document_line_id は必須です。", 400, cors);
      }

      const { data: line } = await supabase
        .from("document_lines")
        .select("id, document_id")
        .eq("id", lineId)
        .eq("is_deleted", false)
        .maybeSingle();

      if (!line) {
        return errorResponse("LINE_NOT_FOUND", "明細行が見つかりません。", 404, cors);
      }

      const now = new Date().toISOString();
      const deletedBy = asString(body.deleted_by) || null;

      // リンクも論理削除
      await supabase
        .from("document_product_links")
        .update({ is_deleted: true, deleted_at: now, deleted_by: deletedBy })
        .eq("document_line_id", lineId);

      // 行を論理削除
      await supabase
        .from("document_lines")
        .update({ is_deleted: true, is_active: false, deleted_at: now, deleted_by: deletedBy })
        .eq("id", lineId);

      await refreshDocumentStatus(supabase, line.document_id);

      return jsonResponse({ success: true, deleted_line_id: lineId }, 200, cors);
    }

    // ----------------------------------------------------
    // 6. link_product_manual: 商品IDを指定して手動紐付け
    // ----------------------------------------------------
    if (action === ACTIONS.link_product_manual) {
      const lineId = asString(body.document_line_id);
      if (!lineId) {
        return errorResponse("DOCUMENT_LINE_ID_REQUIRED", "document_line_id は必須です。", 400, cors);
      }

      const productId = asString(body.product_id);
      if (!productId) {
        return errorResponse("PRODUCT_ID_REQUIRED", "product_id は必須です。", 400, cors);
      }

      const { data: line, error: lineErr } = await supabase
        .from("document_lines")
        .select("*, document:documents(id, currency)")
        .eq("id", lineId)
        .eq("is_deleted", false)
        .eq("is_active", true)
        .maybeSingle();

      if (lineErr || !line) {
        return errorResponse("LINE_NOT_FOUND", "有効な明細行が見つかりません。", 404, cors);
      }

      const allocatedAmount =
        body.allocated_amount !== undefined && body.allocated_amount !== null && body.allocated_amount !== ""
          ? Number(body.allocated_amount)
          : Number(line.total_line_amount);

      const confirmedBy = asString(body.confirmed_by) || null;
      const note = asString(body.note) || null;

      // リンク作成
      const { data: link, error: linkErr } = await supabase
        .from("document_product_links")
        .insert({
          document_line_id: lineId,
          product_id: productId,
          link_type: "manual",
          allocated_amount: allocatedAmount,
          currency: line.currency || "JPY",
          confirmed_by: confirmedBy,
          note: note,
        })
        .select()
        .single();

      if (linkErr) {
        return errorResponse("LINK_CREATE_ERROR", linkErr.message, 500, cors);
      }

      // 行のマッチ状態を更新
      await supabase
        .from("document_lines")
        .update({ match_status: "matched", updated_at: new Date().toISOString() })
        .eq("id", lineId);

      // 書類ステータス再計算
      await refreshDocumentStatus(supabase, line.document_id);

      // 監査サマリー
      const { data: audit } = await supabase
        .from("v_document_audit_summary")
        .select("*")
        .eq("document_id", line.document_id)
        .maybeSingle();

      // 商品原価内訳
      const { data: productCost } = await supabase
        .from("v_product_cost_breakdown")
        .select("*")
        .eq("product_id", productId)
        .maybeSingle();

      return jsonResponse(
        {
          success: true,
          link,
          audit: audit || null,
          product_cost: productCost || null,
        },
        201,
        cors
      );
    }

    // ----------------------------------------------------
    // 7. unlink_product_manual: 手動紐付けの解除
    // ----------------------------------------------------
    if (action === ACTIONS.unlink_product_manual) {
      const linkId = asString(body.link_id);
      if (!linkId) {
        return errorResponse("LINK_ID_REQUIRED", "link_id は必須です。", 400, cors);
      }

      const { data: link } = await supabase
        .from("document_product_links")
        .select("*, line:document_lines(id, document_id)")
        .eq("id", linkId)
        .eq("is_deleted", false)
        .maybeSingle();

      if (!link) {
        return errorResponse("LINK_NOT_FOUND", "紐付けレコードが見つかりません。", 404, cors);
      }

      const now = new Date().toISOString();
      const deletedBy = asString(body.deleted_by) || null;

      await supabase
        .from("document_product_links")
        .update({ is_deleted: true, deleted_at: now, deleted_by: deletedBy })
        .eq("id", linkId);

      // 行の残り有効リンクを確認
      const { data: remainingLinks } = await supabase
        .from("document_product_links")
        .select("id")
        .eq("document_line_id", link.document_line_id)
        .eq("is_deleted", false);

      if (!remainingLinks || remainingLinks.length === 0) {
        await supabase
          .from("document_lines")
          .update({ match_status: "unmatched", updated_at: now })
          .eq("id", link.document_line_id);
      }

      if (link.line && link.line.document_id) {
        await refreshDocumentStatus(supabase, link.line.document_id);
      }

      return jsonResponse({ success: true, unlinked_id: linkId }, 200, cors);
    }

    // ----------------------------------------------------
    // 8. get_product_cost: 商品ID指定での原価・関連書類明細取得
    // ----------------------------------------------------
    if (action === ACTIONS.get_product_cost) {
      const productId = asString(body.product_id ?? reqUrl.searchParams.get("product_id"));
      if (!productId) {
        return errorResponse("PRODUCT_ID_REQUIRED", "product_id は必須です。", 400, cors);
      }

      const { data: breakdown } = await supabase
        .from("v_product_cost_breakdown")
        .select("*")
        .eq("product_id", productId)
        .maybeSingle();

      const { data: links, error: lkErr } = await supabase
        .from("document_product_links")
        .select(`
          id,
          product_id,
          link_type,
          allocated_amount,
          currency,
          confirmed_by,
          note,
          created_at,
          line:document_lines(
            id,
            line_number,
            reception_number_raw,
            line_type,
            description,
            item_amount,
            fee_amount,
            tax_amount,
            total_line_amount,
            document:documents(
              id,
              file_name,
              supplier_name,
              issue_date,
              drive_file_url
            )
          )
        `)
        .eq("product_id", productId)
        .eq("is_deleted", false);

      if (lkErr) {
        return errorResponse("DB_QUERY_ERROR", lkErr.message, 500, cors);
      }

      return jsonResponse(
        {
          success: true,
          product_id: productId,
          cost_breakdown: breakdown || null,
          links: links || [],
        },
        200,
        cors
      );
    }

    return errorResponse("UNHANDLED_ACTION", `未処理の action です: ${action}`, 400, cors);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse("INTERNAL_SERVER_ERROR", message, 500, cors);
  }
});
