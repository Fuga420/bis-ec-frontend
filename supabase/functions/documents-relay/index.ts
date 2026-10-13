// documents-relay
// 独立書類台帳(Independent Document Ledger)専用の中継(Readdy Backend Edge Function)。
//
// 役割(Phase 2 MVP):
// Readdy(ブラウザ) --POST/GET--> この中継 --(service_role)--> DB
// --(GAS_ADMIN_SECRET)--> GAS /exec (Drive保存)
//
// セキュリティ原則:
// ・ブラウザには service_role も GAS 管理者キーも露出させない。
// ・ブラウザは標準の Supabase クライアント (anon key + JWT) で本 Edge Function を呼び出す。
// ・confirmed_by は監査記録用の入力値として扱い、本人認証とは表現しない。
// ・同一再送(idempotency_key)および同一ファイル(SHA-256指紋)をDB照合で先行検知し、Drive二重作成を完全抑止。
//
// 環境変数:
// SUPABASE_URL : プロジェクト URL
// SUPABASE_SERVICE_ROLE_KEY : サービスロールキー(DBフル権限)
// GAS_WEBHOOK_URL : GAS Web App の /exec URL
// GAS_ADMIN_SECRET : GAS 管理者キー(Drive保存用)
// ALLOWED_ORIGINS : 許可オリジン(カンマ区切り、任意)
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

const KNOWN_ACTIONS: string[] = Object.values(ACTIONS);

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

const VALID_LINK_TYPES = [
  "primary_cost",
  "commission",
  "shipping_cost",
  "other_expense",
  "refund",
  "sale_settlement",
] as const;

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

// SHA-256 指紋算出(Driveアップロード前の重複事前検知用)
async function computeSha256(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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

// ---------- Audit Helper ----------

function formatAuditSummary(audit: Record<string, unknown> | null) {
  if (!audit) return null;
  const discrepancy =
    audit.discrepancy_amount !== null && audit.discrepancy_amount !== undefined
      ? Number(audit.discrepancy_amount)
      : null;
  return {
    ...audit,
    is_balanced: discrepancy !== null && discrepancy === 0,
  };
}

// ---------- Audit Aggregation (ビュー代替: アプリ層集計) ----------
// 現行 Readdy Backend は CREATE VIEW 非対応のため、中継側で集計する。
// 外部APIのレスポンス項目は v_document_audit_summary / v_product_cost_breakdown と同一に保つ。

function toNumOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sumLineAmounts(
  lines: Record<string, unknown>[],
  predicate: (line: Record<string, unknown>) => boolean
): number {
  return lines
    .filter(predicate)
    .reduce((acc, line) => acc + (toNumOrNull(line.total_line_amount) ?? 0), 0);
}

async function computeAuditSummary(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  documentId: string
): Promise<Record<string, unknown> | null> {
  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;

  const { data: lines } = await supabase
    .from("document_lines")
    .select(
      "id, is_deleted, is_active, is_canceled, match_status, transaction_type, total_line_amount"
    )
    .eq("document_id", documentId);

  const activeLines: Record<string, unknown>[] = (lines || []).filter(
    (l: Record<string, unknown>) => !l.is_deleted && l.is_active
  );

  const declaredTotal = toNumOrNull(doc.total_amount);
  const extractedTotal = sumLineAmounts(activeLines, () => true);

  return {
    document_id: doc.id,
    document_number: doc.document_number,
    supplier_name: doc.supplier_name,
    issue_date: doc.issue_date,
    document_status: doc.status,
    declared_total_amount: doc.total_amount ?? null,
    extracted_total_amount: extractedTotal,
    active_lines_count: activeLines.length,
    canceled_lines_count: activeLines.filter((l) => Boolean(l.is_canceled)).length,
    confirmed_lines_count: activeLines.filter(
      (l) => l.match_status === "confirmed"
    ).length,
    unlinked_lines_count: activeLines.filter(
      (l) => l.match_status === "unlinked" && !l.is_canceled
    ).length,
    discrepancy_amount:
      declaredTotal === null ? null : declaredTotal - extractedTotal,
    purchase_total: sumLineAmounts(
      activeLines,
      (l) => l.transaction_type === "purchase"
    ),
    commission_total: sumLineAmounts(
      activeLines,
      (l) =>
        l.transaction_type === "commission" || l.transaction_type === "fee_only"
    ),
    participation_fee_total: sumLineAmounts(
      activeLines,
      (l) => l.transaction_type === "participation_fee"
    ),
    refund_total: sumLineAmounts(
      activeLines,
      (l) => l.transaction_type === "refund" || l.transaction_type === "discount"
    ),
    sale_settlement_total: sumLineAmounts(
      activeLines,
      (l) => l.transaction_type === "sale_settlement"
    ),
  };
}

async function computeProductCostBreakdown(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  productId: string
): Promise<Record<string, unknown> | null> {
  const { data: links } = await supabase
    .from("document_product_links")
    .select(
      "id, document_line_id, product_id, link_type, allocated_amount, status, is_deleted, confirmed_at"
    )
    .eq("product_id", productId)
    .eq("is_deleted", false)
    .eq("status", "confirmed");

  const linkArr: Record<string, unknown>[] = links || [];
  if (linkArr.length === 0) return null;

  const lineIds = Array.from(
    new Set(linkArr.map((l) => String(l.document_line_id)))
  );
  const { data: lineRows } = await supabase
    .from("document_lines")
    .select("id, document_id, is_deleted, is_active")
    .in("id", lineIds);

  const lineMap = new Map<string, Record<string, unknown>>();
  for (const row of (lineRows || []) as Record<string, unknown>[]) {
    lineMap.set(String(row.id), row);
  }

  const validLinks = linkArr.filter((l) => {
    const line = lineMap.get(String(l.document_line_id));
    return line !== undefined && !line.is_deleted && line.is_active;
  });
  if (validLinks.length === 0) return null;

  const documentIds = new Set<string>();
  for (const l of validLinks) {
    const line = lineMap.get(String(l.document_line_id));
    if (line) documentIds.add(String(line.document_id));
  }

  const sumAllocated = (
    predicate: (link: Record<string, unknown>) => boolean
  ): number =>
    validLinks
      .filter(predicate)
      .reduce((acc, l) => acc + (toNumOrNull(l.allocated_amount) ?? 0), 0);

  const primary = sumAllocated((l) => l.link_type === "primary_cost");
  const commission = sumAllocated(
    (l) => l.link_type === "additional_fee" || l.link_type === "commission"
  );
  const shipping = sumAllocated((l) => l.link_type === "shipping_cost");
  const other = sumAllocated((l) => l.link_type === "other_expense");
  const refund = sumAllocated((l) => l.link_type === "refund");
  const sale = sumAllocated((l) => l.link_type === "sale_settlement");

  let lastConfirmedAt: string | null = null;
  for (const l of validLinks) {
    const v = l.confirmed_at;
    if (
      typeof v === "string" &&
      (lastConfirmedAt === null || v > lastConfirmedAt)
    ) {
      lastConfirmedAt = v;
    }
  }

  return {
    product_id: productId,
    document_count: documentIds.size,
    matched_lines_count: validLinks.length,
    total_primary_cost: primary,
    total_commission_fee: commission,
    total_shipping_cost: shipping,
    total_other_expense: other,
    total_purchase_refund: refund,
    total_allocated_cost:
      primary + commission + shipping + other - Math.abs(refund),
    total_sale_proceeds: sale,
    last_confirmed_at: lastConfirmedAt,
  };
}

// ---------- Document Status Recalculation ----------

async function refreshDocumentStatus(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  documentId: string
): Promise<string> {
  // 監査サマリーをアプリ層で算出 (ビュー代替)
  const audit = await computeAuditSummary(supabase, documentId);

  let newStatus = "pending";
  if (audit) {
    const activeCount = Number(audit.active_lines_count) || 0;
    const confirmedCount = Number(audit.confirmed_lines_count) || 0;
    const unlinkedCount = Number(audit.unlinked_lines_count) || 0;
    const hasDiscrepancy =
      audit.discrepancy_amount !== null &&
      Number(audit.discrepancy_amount) !== 0;

    if (activeCount === 0) {
      newStatus = audit.declared_total_amount === null ? "pending_amount" : "pending";
    } else {
      if (unlinkedCount === 0 && confirmedCount > 0 && !hasDiscrepancy) {
        newStatus = "fully_matched";
      } else if (confirmedCount > 0) {
        newStatus = "partially_matched";
      } else if (hasDiscrepancy) {
        newStatus = "flagged";
      } else {
        newStatus = "lines_registered";
      }
    }

    await supabase
      .from("documents")
      .update({
        status: newStatus,
        extracted_line_count: activeCount,
        extracted_total_amount: audit.extracted_total_amount,
        discrepancy_amount: audit.discrepancy_amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
  }
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
      "DB接続環境変数が設定されていません。",
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

      const supplierName = asString(body.supplier_name);
      if (!supplierName) {
        return errorResponse("SUPPLIER_NAME_REQUIRED", "supplier_name は必須です。", 400, cors);
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

      // 1-1. 同一再送チェック (idempotency_key) - GAS呼出し前にDB照合で遮断
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
        const audit = await computeAuditSummary(
          supabase,
          String(existingByKey.id)
        );
        return jsonResponse(
          {
            success: true,
            is_reused: true,
            document: existingByKey,
            audit: formatAuditSummary(audit),
          },
          200,
          cors
        );
      }

      // 1-2. 同一ファイル指紋チェック (file_fingerprint) - Drive保存前に先行照合
      const precalculatedHash = await computeSha256(base64);
      const { data: existingByHash, error: errHash } = await supabase
        .from("documents")
        .select("*")
        .eq("file_fingerprint", precalculatedHash)
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

      // 1-3. GASへ原本保存 (独立Driveフォルダへアップロード)
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

      const fileFingerprint = asString(gasRes.file_fingerprint) || precalculatedHash;
      const driveFileId = asString(gasRes.file_id);
      const driveFileUrl =
        asString(gasRes.drive_file_url || gasRes.file_url || gasRes.view_url) || null;
      const driveFolderId = asString(gasRes.folder_id) || null;
      const fileSize = Number(gasRes.file_size) || 0;

      // 1-4. documents テーブルへ登録 (SQL定義列に完全準拠)
      const totalAmountRaw = body.total_amount;
      const totalAmount =
        totalAmountRaw !== undefined && totalAmountRaw !== null && totalAmountRaw !== ""
          ? Number(totalAmountRaw)
          : null;
      const taxAmountRaw = body.tax_amount;
      const taxAmount =
        taxAmountRaw !== undefined && taxAmountRaw !== null && taxAmountRaw !== ""
          ? Number(taxAmountRaw)
          : null;

      const initialStatus = totalAmount === null ? "pending_amount" : "pending";

      const insertRecord = {
        idempotency_key: idempotencyKey,
        document_number: asString(body.document_number) || null,
        invoice_registration_number: asString(body.invoice_registration_number) || null,
        document_type: documentType,
        supplier_name: supplierName,
        supplier_code: asString(body.supplier_code) || null,
        issue_date: asString(body.issue_date) || null,
        due_date: asString(body.due_date) || null,
        currency: asString(body.currency) || "JPY",
        total_amount: totalAmount,
        tax_amount: taxAmount,
        file_name: asString(gasRes.file_name) || fileName,
        mime_type: asString(gasRes.mime_type) || mimeType,
        file_size: fileSize,
        file_fingerprint: fileFingerprint,
        drive_file_id: driveFileId,
        drive_folder_id: driveFolderId,
        drive_file_url: driveFileUrl,
        notes: asString(body.notes ?? body.note) || null,
        status: initialStatus,
        created_by: asString(body.confirmed_by) || "system",
      };

      const { data: newDoc, error: insertErr } = await supabase
        .from("documents")
        .insert(insertRecord)
        .select()
        .single();
      if (insertErr) {
        return errorResponse("DB_INSERT_ERROR", insertErr.message, 500, cors);
      }

      // 監査サマリー取得 (ビュー代替・アプリ層集計)
      const audit = await computeAuditSummary(supabase, String(newDoc.id));

      return jsonResponse(
        {
          success: true,
          is_reused: Boolean(gasRes.is_reused),
          document: newDoc,
          audit: formatAuditSummary(audit),
        },
        201,
        cors
      );
    }

    // ----------------------------------------------------
    // 2. list_documents: 書類台帳一覧の取得 (検索・フィルター・ページング・監査差額付き)
    // ----------------------------------------------------
    if (action === ACTIONS.list_documents) {
      const page = Math.max(
        1,
        parseInt(asString(body.page ?? reqUrl.searchParams.get("page")) || "1", 10)
      );
      const pageSizeRaw = parseInt(
        asString(body.page_size ?? reqUrl.searchParams.get("page_size")) || "20",
        10
      );
      const pageSize = Math.min(100, Math.max(1, pageSizeRaw));
      const statusFilter = asString(body.status ?? reqUrl.searchParams.get("status"));
      const supplierFilter = asString(
        body.supplier_name ?? reqUrl.searchParams.get("supplier_name")
      );

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

      const offset = (page - 1) * pageSize;
      query = query
        .order("issue_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      const { data: docs, count, error: listErr } = await query;
      if (listErr) {
        return errorResponse("DB_QUERY_ERROR", listErr.message, 500, cors);
      }

      // 各ドキュメントの監査サマリーを算出 (ビュー代替・アプリ層集計)
      const docIds = (docs || []).map((d) => String(d.id));
      const auditsMap: Record<string, Record<string, unknown>> = {};
      for (const docId of docIds) {
        const audit = await computeAuditSummary(supabase, docId);
        const formatted = formatAuditSummary(audit);
        if (formatted) {
          auditsMap[docId] = formatted as Record<string, unknown>;
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
      const documentId = asString(
        body.document_id ?? reqUrl.searchParams.get("document_id")
      );
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
        return errorResponse(
          "DOCUMENT_NOT_FOUND",
          "指定された書類が見つかりません。",
          404,
          cors
        );
      }

      // 監査サマリー (ビュー代替・アプリ層集計)
      const audit = await computeAuditSummary(supabase, documentId);

      // 明細行 (SQL実列名準拠)
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
      const linksByLineId: Record<string, unknown[]> = {};
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
          audit: formatAuditSummary(audit),
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
        return errorResponse(
          "DOCUMENT_NOT_FOUND",
          "指定された書類が見つかりません。",
          404,
          cors
        );
      }

      for (let i = 0; i < rawLines.length; i++) {
        const item = rawLines[i] as Record<string, unknown>;
        const lineId = asString(item.id);
        const lineNumber = Number(item.line_number) || i + 1;
        const pageNumber = Number(item.page_number) || 1;

        const receptionRaw = asString(item.reception_number_raw) || null;
        const receptionNorm =
          asString(item.reception_number_normalized) ||
          (receptionRaw ? receptionRaw.toUpperCase().replace(/\s+/g, "") : null);

        const itemNameRaw = asString(item.item_name_raw ?? item.description);
        if (!itemNameRaw && !lineId) {
          return errorResponse(
            "ITEM_NAME_REQUIRED",
            `明細行 ${lineNumber} の item_name_raw は必須です。`,
            400,
            cors
          );
        }

        const transactionType = asString(item.transaction_type ?? item.line_type) || "purchase";
        const lotNumber = asString(item.lot_number) || null;
        const branchNumber = asString(item.branch_number) || null;
        const auctionBidNumber = asString(item.auction_bid_number) || null;
        const brandNameRaw = asString(item.brand_name_raw) || null;
        const categoryHint = asString(item.category_hint) || null;
        const itemRankRaw = asString(item.item_rank_raw) || null;
        const accessoryRaw = asString(item.accessory_raw) || null;

        const itemAmount =
          item.item_amount !== undefined && item.item_amount !== null && item.item_amount !== ""
            ? Number(item.item_amount)
            : null;
        const taxAmount =
          item.tax_amount !== undefined && item.tax_amount !== null && item.tax_amount !== ""
            ? Number(item.tax_amount)
            : null;
        const feeRate =
          item.fee_rate !== undefined && item.fee_rate !== null && item.fee_rate !== ""
            ? Number(item.fee_rate)
            : null;
        const feeAmount =
          item.fee_amount !== undefined && item.fee_amount !== null && item.fee_amount !== ""
            ? Number(item.fee_amount)
            : null;
        const feeTaxAmount =
          item.fee_tax_amount !== undefined && item.fee_tax_amount !== null && item.fee_tax_amount !== ""
            ? Number(item.fee_tax_amount)
            : null;
        const otherExpenseAmount =
          item.other_expense_amount !== undefined &&
          item.other_expense_amount !== null &&
          item.other_expense_amount !== ""
            ? Number(item.other_expense_amount)
            : null;
        const otherExpenseTaxAmount =
          item.other_expense_tax_amount !== undefined &&
          item.other_expense_tax_amount !== null &&
          item.other_expense_tax_amount !== ""
            ? Number(item.other_expense_tax_amount)
            : null;

        const totalLineAmountRaw = item.total_line_amount;
        const totalLineAmount =
          totalLineAmountRaw !== undefined &&
          totalLineAmountRaw !== null &&
          totalLineAmountRaw !== ""
            ? Number(totalLineAmountRaw)
            : null;

        const isCanceled = Boolean(item.is_canceled);
        const cancelReason = asString(item.cancel_reason) || null;
        const notes = asString(item.notes ?? item.note) || null;

        if (lineId) {
          // 直接更新
          const updateRecord: Record<string, unknown> = {
            page_number: pageNumber,
            line_number: lineNumber,
            reception_number_raw: receptionRaw,
            reception_number_normalized: receptionNorm,
            lot_number: lotNumber,
            branch_number: branchNumber,
            auction_bid_number: auctionBidNumber,
            transaction_type: transactionType,
            brand_name_raw: brandNameRaw,
            category_hint: categoryHint,
            item_rank_raw: itemRankRaw,
            accessory_raw: accessoryRaw,
            item_amount: itemAmount,
            tax_amount: taxAmount,
            fee_rate: feeRate,
            fee_amount: feeAmount,
            fee_tax_amount: feeTaxAmount,
            other_expense_amount: otherExpenseAmount,
            other_expense_tax_amount: otherExpenseTaxAmount,
            total_line_amount: totalLineAmount,
            is_canceled: isCanceled,
            cancel_reason: cancelReason,
            notes: notes,
            updated_at: new Date().toISOString(),
          };
          if (itemNameRaw) {
            updateRecord.item_name_raw = itemNameRaw;
          }

          const { error: updErr } = await supabase
            .from("document_lines")
            .update(updateRecord)
            .eq("id", lineId)
            .eq("document_id", documentId);
          if (updErr) {
            return errorResponse("LINE_UPDATE_ERROR", updErr.message, 500, cors);
          }
        } else {
          // 新規または同一 (document_id, page_number, line_number) の削除済み行の再利用
          const { data: existingLine } = await supabase
            .from("document_lines")
            .select("id, is_deleted")
            .eq("document_id", documentId)
            .eq("page_number", pageNumber)
            .eq("line_number", lineNumber)
            .maybeSingle();

          if (existingLine) {
            // 既存行(論理削除含む)が存在する場合は再活性化・上書き更新
            const updateRecord: Record<string, unknown> = {
              reception_number_raw: receptionRaw,
              reception_number_normalized: receptionNorm,
              lot_number: lotNumber,
              branch_number: branchNumber,
              auction_bid_number: auctionBidNumber,
              item_name_raw: itemNameRaw,
              brand_name_raw: brandNameRaw,
              category_hint: categoryHint,
              item_rank_raw: itemRankRaw,
              accessory_raw: accessoryRaw,
              transaction_type: transactionType,
              item_amount: itemAmount,
              tax_amount: taxAmount,
              fee_rate: feeRate,
              fee_amount: feeAmount,
              fee_tax_amount: feeTaxAmount,
              other_expense_amount: otherExpenseAmount,
              other_expense_tax_amount: otherExpenseTaxAmount,
              total_line_amount: totalLineAmount,
              is_canceled: isCanceled,
              cancel_reason: cancelReason,
              match_status: "unlinked",
              is_active: true,
              is_deleted: false,
              deleted_at: null,
              deleted_by: null,
              notes: notes,
              updated_at: new Date().toISOString(),
            };
            const { error: updErr } = await supabase
              .from("document_lines")
              .update(updateRecord)
              .eq("id", existingLine.id);
            if (updErr) {
              return errorResponse("LINE_UPDATE_ERROR", updErr.message, 500, cors);
            }
          } else {
            // 新規挿入
            const insertRecord = {
              document_id: documentId,
              page_number: pageNumber,
              line_number: lineNumber,
              reception_number_raw: receptionRaw,
              reception_number_normalized: receptionNorm,
              lot_number: lotNumber,
              branch_number: branchNumber,
              auction_bid_number: auctionBidNumber,
              item_name_raw: itemNameRaw,
              brand_name_raw: brandNameRaw,
              category_hint: categoryHint,
              item_rank_raw: itemRankRaw,
              accessory_raw: accessoryRaw,
              transaction_type: transactionType,
              item_amount: itemAmount,
              tax_amount: taxAmount,
              fee_rate: feeRate,
              fee_amount: feeAmount,
              fee_tax_amount: feeTaxAmount,
              other_expense_amount: otherExpenseAmount,
              other_expense_tax_amount: otherExpenseTaxAmount,
              total_line_amount: totalLineAmount,
              is_canceled: isCanceled,
              cancel_reason: cancelReason,
              match_status: "unlinked",
              is_active: true,
              notes: notes,
            };
            const { error: insErr } = await supabase
              .from("document_lines")
              .insert(insertRecord);
            if (insErr) {
              return errorResponse("LINE_INSERT_ERROR", insErr.message, 500, cors);
            }
          }
        }
      }

      await refreshDocumentStatus(supabase, documentId);

      const updatedAudit = await computeAuditSummary(supabase, documentId);

      return jsonResponse(
        {
          success: true,
          document_id: documentId,
          audit: formatAuditSummary(updatedAudit),
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
        .update({ is_deleted: true, deleted_at: now, deleted_by: deletedBy, status: "unlinked" })
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
    // 6. link_product_manual: 商品IDを指定して手動紐付け (再紐付け対応)
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
        .select("*, document:documents(id)")
        .eq("id", lineId)
        .eq("is_deleted", false)
        .eq("is_active", true)
        .maybeSingle();
      if (lineErr || !line) {
        return errorResponse("LINE_NOT_FOUND", "有効な明細行が見つかりません。", 404, cors);
      }

      const rawLinkType = asString(body.link_type);
      const linkType = VALID_LINK_TYPES.includes(rawLinkType as typeof VALID_LINK_TYPES[number])
        ? rawLinkType
        : "primary_cost";

      // 割当金額の決定ロジック
      // 1. allocated_amount がリクエストで明示されている場合はその値を使用する (0も有効)
      // 2. allocated_amount が未入力の場合は明細の total_line_amount を使用する
      // 3. 両方とも未入力またはNULLの場合は HTTP 400 ALLOCATED_AMOUNT_REQUIRED
      // 4. 有限な数値でない場合は HTTP 400 INVALID_ALLOCATED_AMOUNT
      let rawAllocated: unknown;
      if (
        body.allocated_amount !== undefined &&
        body.allocated_amount !== null &&
        body.allocated_amount !== ""
      ) {
        rawAllocated = body.allocated_amount;
      } else if (
        line.total_line_amount !== null &&
        line.total_line_amount !== undefined &&
        line.total_line_amount !== ""
      ) {
        rawAllocated = line.total_line_amount;
      } else {
        return errorResponse(
          "ALLOCATED_AMOUNT_REQUIRED",
          "明細の合計金額が未設定のため、割当金額 (allocated_amount) の指定が必要です。",
          400,
          cors
        );
      }

      const allocatedAmount = Number(rawAllocated);
      if (!Number.isFinite(allocatedAmount)) {
        return errorResponse(
          "INVALID_ALLOCATED_AMOUNT",
          "割当金額 (allocated_amount) は有効な数値である必要があります。",
          400,
          cors
        );
      }

      const confirmedBy = asString(body.confirmed_by) || null;
      const notes = asString(body.notes ?? body.note) || null;
      const confirmedAt = new Date().toISOString();

      // 既存リンク確認 (同一キーの論理削除済みレコードがあれば再利用・復元)
      const { data: existingLink } = await supabase
        .from("document_product_links")
        .select("*")
        .eq("document_line_id", lineId)
        .eq("product_id", productId)
        .eq("link_type", linkType)
        .maybeSingle();

      let linkRecord: Record<string, unknown> | null = null;

      if (existingLink) {
        const { data: updatedLink, error: updLinkErr } = await supabase
          .from("document_product_links")
          .update({
            allocated_amount: allocatedAmount,
            allocation_method: asString(body.allocation_method) || "direct",
            match_method: "manual",
            confidence_score: 1.0,
            status: "confirmed",
            confirmed_by: confirmedBy,
            confirmed_at: confirmedAt,
            notes: notes,
            is_deleted: false,
            deleted_at: null,
            deleted_by: null,
            updated_at: confirmedAt,
          })
          .eq("id", existingLink.id)
          .select()
          .single();
        if (updLinkErr) {
          return errorResponse("LINK_UPDATE_ERROR", updLinkErr.message, 500, cors);
        }
        linkRecord = updatedLink;
      } else {
        const { data: insertedLink, error: linkErr } = await supabase
          .from("document_product_links")
          .insert({
            document_line_id: lineId,
            product_id: productId,
            link_type: linkType,
            allocated_amount: allocatedAmount,
            allocation_method: asString(body.allocation_method) || "direct",
            match_method: "manual",
            confidence_score: 1.0,
            status: "confirmed",
            confirmed_by: confirmedBy,
            confirmed_at: confirmedAt,
            notes: notes,
          })
          .select()
          .single();
        if (linkErr) {
          return errorResponse("LINK_CREATE_ERROR", linkErr.message, 500, cors);
        }
        linkRecord = insertedLink;
      }

      // 行のマッチ状態を 'confirmed' に更新 (v_document_audit_summary の confirmed_lines_count 集計対象)
      await supabase
        .from("document_lines")
        .update({ match_status: "confirmed", updated_at: confirmedAt })
        .eq("id", lineId);

      // 書類ステータス再計算
      await refreshDocumentStatus(supabase, line.document_id);

      // 監査サマリー (ビュー代替・アプリ層集計)
      const audit = await computeAuditSummary(supabase, String(line.document_id));

      // 商品原価内訳 (ビュー代替・アプリ層集計)
      const productCost = await computeProductCostBreakdown(supabase, productId);

      return jsonResponse(
        {
          success: true,
          link: linkRecord,
          audit: formatAuditSummary(audit),
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
        .update({ is_deleted: true, deleted_at: now, deleted_by: deletedBy, status: "unlinked" })
        .eq("id", linkId);

      // 行の残り有効リンクを確認
      const { data: remainingLinks } = await supabase
        .from("document_product_links")
        .select("id")
        .eq("document_line_id", link.document_line_id)
        .eq("is_deleted", false)
        .eq("status", "confirmed");

      if (!remainingLinks || remainingLinks.length === 0) {
        await supabase
          .from("document_lines")
          .update({ match_status: "unlinked", updated_at: now })
          .eq("id", link.document_line_id);
      }

      if (link.line && link.line.document_id) {
        await refreshDocumentStatus(supabase, link.line.document_id);
      }

      // 最新の商品原価内訳も取得して返却 (ビュー代替・アプリ層集計)
      const remainingCost = await computeProductCostBreakdown(
        supabase,
        String(link.product_id)
      );

      return jsonResponse(
        {
          success: true,
          unlinked_id: linkId,
          product_cost: remainingCost || null,
        },
        200,
        cors
      );
    }

    // ----------------------------------------------------
    // 8. get_product_cost: 商品ID指定での原価・関連書類明細取得
    // ----------------------------------------------------
    if (action === ACTIONS.get_product_cost) {
      const productId = asString(
        body.product_id ?? reqUrl.searchParams.get("product_id")
      );
      if (!productId) {
        return errorResponse("PRODUCT_ID_REQUIRED", "product_id は必須です。", 400, cors);
      }

      const breakdown = await computeProductCostBreakdown(supabase, productId);

      const { data: links, error: lkErr } = await supabase
        .from("document_product_links")
        .select(`
          id,
          product_id,
          link_type,
          allocated_amount,
          allocation_method,
          match_method,
          status,
          confirmed_by,
          confirmed_at,
          notes,
          created_at,
          line:document_lines(
            id,
            page_number,
            line_number,
            reception_number_raw,
            reception_number_normalized,
            lot_number,
            branch_number,
            item_name_raw,
            brand_name_raw,
            category_hint,
            transaction_type,
            item_amount,
            tax_amount,
            fee_amount,
            fee_tax_amount,
            other_expense_amount,
            total_line_amount,
            match_status,
            document:documents(
              id,
              document_number,
              file_name,
              supplier_name,
              issue_date,
              drive_file_url
            )
          )
        `)
        .eq("product_id", productId)
        .eq("is_deleted", false)
        .eq("status", "confirmed");
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