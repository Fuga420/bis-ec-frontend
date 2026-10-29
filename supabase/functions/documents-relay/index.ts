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
// DOCUMENTS_WORKER_SECRET : 自動取込ワーカー専用トークン(サーバー側のみ。ブラウザへ渡さない)
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
  auto_link_product_by_item_number: "auto_link_product_by_item_number",
  // --- 自動取込ワーカー専用アクション(x-bis-worker-token 必須) ---
  register_drive_document: "register_drive_document",
  update_document_folder: "update_document_folder",
} as const;

// ワーカー専用トークンが必須となるアクション(この2つだけ)
const WORKER_ONLY_ACTIONS: string[] = [
  ACTIONS.register_drive_document,
  ACTIONS.update_document_folder,
];

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
      "authorization, x-client-info, apikey, content-type, x-bis-worker-token",
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

// ---------- Worker Authentication (自動取込ワーカー専用) ----------
// 公開キー(anon)でも verify_jwt は通ってしまうため、ゲートウェイだけでは不十分。
// 新2アクションはサーバー側にのみ保持するトークンとの一致を必須にする。
// 秘密値はブラウザへ一切返さない(レスポンス・ログに出さない)。

const WORKER_TOKEN_HEADER = "x-bis-worker-token";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// 戻り値: null = 認証OK / Response = そのまま返すべき拒否レスポンス
type WorkerAuthResult = { ok: true } | { ok: false; response: Response };

function requireWorkerToken(
  req: Request,
  cors: Record<string, string>
): WorkerAuthResult {
  const expected = Deno.env.get("DOCUMENTS_WORKER_SECRET") ?? "";

  // 未設定時は「オープンにフォールバック」せず、必ず拒否する(503)
  if (!expected) {
    return {
      ok: false,
      response: errorResponse(
        "WORKER_AUTH_NOT_CONFIGURED",
        "ワーカー認証が構成されていません。",
        503,
        cors
      ),
    };
  }

  const provided = (req.headers.get(WORKER_TOKEN_HEADER) ?? "").trim();
  if (!provided || !safeEqual(provided, expected)) {
    return {
      ok: false,
      response: errorResponse(
        "WORKER_AUTH_REQUIRED",
        "この操作にはワーカー認証が必要です。",
        401,
        cors
      ),
    };
  }

  return { ok: true };
}

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function optionalText(value: unknown): string | null {
  const s = asString(value);
  return s ? s : null;
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

// ---------- Auto-Link by Item Number Helpers ----------

const VALID_AUTO_LINK_NUMBER_TYPES = [
  "auto",
  "reception_number",
  "auction_bid_number",
] as const;
type AutoLinkNumberType = typeof VALID_AUTO_LINK_NUMBER_TYPES[number];
type MatchedNumberField = "reception_number_raw" | "auction_bid_number";

type AutoLinkAmountResult =
  | {
      ok: true;
      allocated_amount: number;
      net_amount: number;
      confirmed_tax_amount: number;
      total_line_amount: number | null;
      tax_confirmed: boolean;
    }
  | {
      ok: false;
      reason_code: string;
      message: string;
      net_amount: number | null;
      confirmed_tax_amount: number | null;
      total_line_amount: number | null;
    };

/**
 * 仕入明細1行から自動紐付け時の割当額（allocated_amount）を厳格算出する。
 * - 商品代金（item_amount）＋落札手数料（fee_amount）＋その他明細経費（other_expense_amount）
 *   ＋確認済み税額（tax_amount / fee_tax_amount / other_expense_tax_amount）を含める。
 * - 台帳の税込行合計（total_line_amount）が設定されている明細に対し、税抜額だけを割当額に入れて
 *   税込総額と食い違わせることを禁止する（内訳と税込総額が矛盾する場合はエラー保留）。
 * - 行別税額が未確認（total_line_amount === null かつ税額 null）の明細では税額を推測補完せず、
 *   確認済みの税抜合計（＋確認済み税額があれば加算）を採用し tax_confirmed: false を返す。
 */
function computeAutoLinkAllocatedAmount(
  line: Record<string, unknown>
): AutoLinkAmountResult {
  const itemAmount = toNumOrNull(line.item_amount);
  const feeAmount = toNumOrNull(line.fee_amount);
  const taxAmount = toNumOrNull(line.tax_amount);
  const feeTaxAmount = toNumOrNull(line.fee_tax_amount);
  const otherExpenseAmount = toNumOrNull(line.other_expense_amount);
  const otherExpenseTaxAmount = toNumOrNull(line.other_expense_tax_amount);
  const totalLineAmount = toNumOrNull(line.total_line_amount);

  const hasComponentBase =
    itemAmount !== null || feeAmount !== null || otherExpenseAmount !== null;

  if (totalLineAmount === null && !hasComponentBase) {
    return {
      ok: false,
      reason_code: "LINE_AMOUNT_UNSET",
      message:
        "該当する仕入明細の金額が未入力のため、自動紐付けを行いませんでした。",
      net_amount: null,
      confirmed_tax_amount: null,
      total_line_amount: null,
    };
  }

  const netAmount =
    (itemAmount ?? 0) + (feeAmount ?? 0) + (otherExpenseAmount ?? 0);
  const confirmedTaxAmount =
    (taxAmount ?? 0) + (feeTaxAmount ?? 0) + (otherExpenseTaxAmount ?? 0);
  const hasAnyTaxField =
    taxAmount !== null ||
    feeTaxAmount !== null ||
    otherExpenseTaxAmount !== null;

  const itemTaxReady =
    itemAmount === null || itemAmount === 0 || taxAmount !== null;
  const feeTaxReady =
    feeAmount === null || feeAmount === 0 || feeTaxAmount !== null;
  const otherTaxReady =
    otherExpenseAmount === null ||
    otherExpenseAmount === 0 ||
    otherExpenseTaxAmount !== null;
  const allComponentTaxesConfirmed = hasComponentBase
    ? itemTaxReady &&
      feeTaxReady &&
      otherTaxReady &&
      (hasAnyTaxField || netAmount === 0)
    : false;

  const componentGross = netAmount + confirmedTaxAmount;

  if (totalLineAmount !== null) {
    if (
      hasComponentBase &&
      hasAnyTaxField &&
      Math.abs(totalLineAmount - componentGross) > 0.01
    ) {
      return {
        ok: false,
        reason_code: "LINE_TOTAL_DISCREPANCY",
        message: `明細の内訳合計（¥${componentGross.toLocaleString("ja-JP")}）と台帳の税込行合計（¥${totalLineAmount.toLocaleString("ja-JP")}）が一致しないため、自動紐付けを保留しました。`,
        net_amount: netAmount,
        confirmed_tax_amount: confirmedTaxAmount,
        total_line_amount: totalLineAmount,
      };
    }
    if (
      hasComponentBase &&
      !hasAnyTaxField &&
      totalLineAmount < netAmount - 0.01
    ) {
      return {
        ok: false,
        reason_code: "LINE_TOTAL_LESS_THAN_NET",
        message: `台帳の行合計（¥${totalLineAmount.toLocaleString("ja-JP")}）が商品代金・落札手数料の合計（¥${netAmount.toLocaleString("ja-JP")}）を下回るため、自動紐付けを保留しました。`,
        net_amount: netAmount,
        confirmed_tax_amount: 0,
        total_line_amount: totalLineAmount,
      };
    }

    return {
      ok: true,
      allocated_amount: totalLineAmount,
      net_amount: hasComponentBase ? netAmount : totalLineAmount,
      confirmed_tax_amount: hasAnyTaxField
        ? confirmedTaxAmount
        : Math.max(0, totalLineAmount - netAmount),
      total_line_amount: totalLineAmount,
      tax_confirmed: hasComponentBase
        ? allComponentTaxesConfirmed || totalLineAmount > netAmount
        : true,
    };
  }

  return {
    ok: true,
    allocated_amount: componentGross,
    net_amount: netAmount,
    confirmed_tax_amount: confirmedTaxAmount,
    total_line_amount: null,
    tax_confirmed: allComponentTaxesConfirmed,
  };
}

function formatAutoLinkCandidateSummary(
  line: Record<string, unknown>,
  matchedField: MatchedNumberField,
  activeLinks: Record<string, unknown>[]
): Record<string, unknown> {
  const doc = (line.document as Record<string, unknown> | null) ?? {};
  const amountCalc = computeAutoLinkAllocatedAmount(line);
  return {
    document_line_id: line.id,
    document_id: line.document_id ?? doc.id ?? null,
    document_number: doc.document_number ?? null,
    supplier_name: doc.supplier_name ?? null,
    issue_date: doc.issue_date ?? null,
    file_name: doc.file_name ?? null,
    drive_file_url: doc.drive_file_url ?? null,
    page_number: line.page_number ?? null,
    line_number: line.line_number ?? null,
    matched_field: matchedField,
    matched_number_label:
      matchedField === "reception_number_raw"
        ? "落札・受付番号"
        : "商品番号",
    reception_number_raw: line.reception_number_raw ?? null,
    auction_bid_number: line.auction_bid_number ?? null,
    item_name_raw: line.item_name_raw ?? "",
    brand_name_raw: line.brand_name_raw ?? null,
    category_hint: line.category_hint ?? null,
    transaction_type: line.transaction_type ?? "purchase",
    is_canceled: Boolean(line.is_canceled),
    item_amount: toNumOrNull(line.item_amount),
    fee_amount: toNumOrNull(line.fee_amount),
    tax_amount: toNumOrNull(line.tax_amount),
    fee_tax_amount: toNumOrNull(line.fee_tax_amount),
    other_expense_amount: toNumOrNull(line.other_expense_amount),
    total_line_amount: toNumOrNull(line.total_line_amount),
    expected_allocated_amount: amountCalc.ok
      ? amountCalc.allocated_amount
      : null,
    tax_confirmed: amountCalc.ok ? amountCalc.tax_confirmed : false,
    match_status: line.match_status ?? "unlinked",
    active_links: activeLinks.map((lk) => ({
      link_id: lk.id,
      product_id: lk.product_id,
      link_type: lk.link_type,
      allocated_amount: toNumOrNull(lk.allocated_amount),
      allocation_method: lk.allocation_method,
      match_method: lk.match_method,
      confirmed_at: lk.confirmed_at ?? null,
    })),
  };
}

function computeSuggestedNarrowingFields(
  candidates: Record<string, unknown>[]
): string[] {
  if (candidates.length <= 1) return [];
  const fields: string[] = [];
  const distinct = (getter: (c: Record<string, unknown>) => unknown) => {
    const vals = new Set(
      candidates
        .map(getter)
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
        .map((v) => String(v))
    );
    return vals.size > 1;
  };
  if (distinct((c) => c.matched_field)) fields.push("number_type");
  if (distinct((c) => c.supplier_name)) fields.push("supplier_name");
  if (distinct((c) => c.issue_date)) fields.push("issue_date");
  if (distinct((c) => c.document_number)) fields.push("document_number");
  if (distinct((c) => c.reception_number_raw)) fields.push("reception_number_raw");
  if (distinct((c) => c.auction_bid_number)) fields.push("auction_bid_number");
  if (distinct((c) => c.document_id)) fields.push("document_id");
  return fields;
}

async function fetchGasProductSummarySafe(
  gasUrl: string,
  productId: string
): Promise<Record<string, unknown> | null> {
  if (!gasUrl || !productId) return null;
  try {
    const sep = gasUrl.includes("?") ? "&" : "?";
    const url = `${gasUrl}${sep}mode=admin&product_id=${encodeURIComponent(productId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const parsed = parseGasResponse(await res.text());
      const p = parsed.product as Record<string, unknown> | undefined;
      if (!parsed.success || !p) return null;
      return {
        product_id: p.product_id ?? productId,
        record_status: p.record_status ?? null,
        publish_status: p.publish_status ?? null,
        product_name: p.product_name ?? "",
        category: p.category ?? "",
        auction_item_number: p.auction_item_number ?? "",
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
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

  // ワーカー専用アクションは「本文バリデーションより前」に認証を確定させる。
  // 未認証の呼び出しでは入力内容を一切評価しない。
  if (WORKER_ONLY_ACTIONS.includes(action)) {
    const auth = requireWorkerToken(req, cors);
    if (!auth.ok) {
      return auth.response;
    }
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

    // ----------------------------------------------------
    // 8-2. auto_link_product_by_item_number:
    //      商品の auction_item_number による仕入明細の完全一致検索・自動確定紐付け
    //      - 番号種別（reception_number_raw: 受付番号 / auction_bid_number: 商品番号）を混同しない
    //      - 候補1件かつ他商品への有効確定リンクなし・自商品の他明細リンクなしの時のみ確定紐付け
    //      - 同一要求の再送は二重作成せず既存リンク（is_reused: true）を返却
    //      - 0件・複数件・既存リンク競合・金額不整合・エラー時はリンクを書かず理由と確認情報を返す
    //        （商品登録・商品更新の成功は一切取り消さない）
    // ----------------------------------------------------
    if (action === ACTIONS.auto_link_product_by_item_number) {
      const productId = asString(body.product_id);
      const rawItemVal = body.auction_item_number;
      const itemNumber =
        typeof rawItemVal === "string"
          ? rawItemVal.trim()
          : asString(rawItemVal);

      if (!productId) {
        return jsonResponse(
          {
            success: false,
            linked: false,
            is_reused: false,
            status: "invalid_request",
            error_code: "PRODUCT_ID_REQUIRED",
            reason_code: "PRODUCT_ID_REQUIRED",
            error: "product_id は必須です。",
            message: "product_id は必須です。",
            product_id: null,
            auction_item_number: itemNumber,
            product_registration_preserved: true,
          },
          400,
          cors
        );
      }

      const rawNumberType = asString(body.number_type).toLowerCase() || "auto";
      if (
        !VALID_AUTO_LINK_NUMBER_TYPES.includes(
          rawNumberType as AutoLinkNumberType
        )
      ) {
        return jsonResponse(
          {
            success: false,
            linked: false,
            is_reused: false,
            status: "invalid_request",
            error_code: "INVALID_NUMBER_TYPE",
            reason_code: "INVALID_NUMBER_TYPE",
            error: `未対応の number_type です: ${rawNumberType} (auto / reception_number / auction_bid_number)`,
            message: `未対応の number_type です: ${rawNumberType}`,
            product_id: productId,
            auction_item_number: itemNumber,
            product_registration_preserved: true,
          },
          400,
          cors
        );
      }
      const numberType = rawNumberType as AutoLinkNumberType;

      if (!itemNumber) {
        return jsonResponse(
          {
            success: true,
            linked: false,
            is_reused: false,
            status: "skipped_empty_item_number",
            reason_code: "EMPTY_ITEM_NUMBER",
            message:
              "商品番号が空欄のため、仕入明細の自動検索・自動紐付けは行いませんでした。",
            product_id: productId,
            auction_item_number: "",
            searched_number_type: numberType,
            matched_number_type: null,
            product_registration_preserved: true,
            candidate_count: 0,
            candidates: [],
          },
          200,
          cors
        );
      }

      const filterDocId = optionalText(body.document_id);
      const filterSupplier = optionalText(body.supplier_name);
      const filterIssueDate = optionalText(body.issue_date);
      const filterDocNumber = optionalText(body.document_number);
      const confirmedBy = asString(body.confirmed_by) || "auto_item_number";
      const dryRun = body.dry_run === true;

      try {
        const lineSelectCols = `
          id,
          document_id,
          page_number,
          line_number,
          reception_number_raw,
          reception_number_normalized,
          lot_number,
          branch_number,
          auction_bid_number,
          item_name_raw,
          brand_name_raw,
          category_hint,
          transaction_type,
          item_amount,
          tax_amount,
          fee_amount,
          fee_tax_amount,
          other_expense_amount,
          other_expense_tax_amount,
          total_line_amount,
          match_status,
          is_canceled,
          document:documents(
            id,
            document_number,
            supplier_name,
            issue_date,
            file_name,
            status,
            drive_file_url,
            is_deleted
          )
        `;

        const applyLineAndDocFilters = (
          rows: Record<string, unknown>[],
          expectedField: MatchedNumberField
        ): Record<string, unknown>[] => {
          return rows.filter((row) => {
            if (String(row[expectedField] ?? "") !== itemNumber) return false;
            const doc = row.document as Record<string, unknown> | null;
            if (!doc || Boolean(doc.is_deleted)) return false;
            if (filterDocId && String(row.document_id ?? "") !== filterDocId) {
              return false;
            }
            if (
              filterSupplier &&
              String(doc.supplier_name ?? "").trim() !== filterSupplier
            ) {
              return false;
            }
            if (
              filterIssueDate &&
              String(doc.issue_date ?? "").trim() !== filterIssueDate
            ) {
              return false;
            }
            if (
              filterDocNumber &&
              String(doc.document_number ?? "").trim() !== filterDocNumber
            ) {
              return false;
            }
            return true;
          });
        };

        let receptionRows: Record<string, unknown>[] = [];
        let bidRows: Record<string, unknown>[] = [];

        if (numberType === "auto" || numberType === "reception_number") {
          let qRec = supabase
            .from("document_lines")
            .select(lineSelectCols)
            .eq("is_deleted", false)
            .eq("is_active", true)
            .eq("reception_number_raw", itemNumber);
          if (filterDocId) qRec = qRec.eq("document_id", filterDocId);
          const { data: recData, error: recErr } = await qRec;
          if (recErr) {
            return jsonResponse(
              {
                success: false,
                linked: false,
                is_reused: false,
                status: "error",
                error_code: "DB_QUERY_ERROR",
                reason_code: "DB_QUERY_ERROR",
                error: recErr.message,
                message: `仕入明細（受付番号）の検索中にエラーが発生しました: ${recErr.message}`,
                product_id: productId,
                auction_item_number: itemNumber,
                product_registration_preserved: true,
              },
              500,
              cors
            );
          }
          receptionRows = applyLineAndDocFilters(
            (recData || []) as Record<string, unknown>[],
            "reception_number_raw"
          );
        }

        if (numberType === "auto" || numberType === "auction_bid_number") {
          let qBid = supabase
            .from("document_lines")
            .select(lineSelectCols)
            .eq("is_deleted", false)
            .eq("is_active", true)
            .eq("auction_bid_number", itemNumber);
          if (filterDocId) qBid = qBid.eq("document_id", filterDocId);
          const { data: bidData, error: bidErr } = await qBid;
          if (bidErr) {
            return jsonResponse(
              {
                success: false,
                linked: false,
                is_reused: false,
                status: "error",
                error_code: "DB_QUERY_ERROR",
                reason_code: "DB_QUERY_ERROR",
                error: bidErr.message,
                message: `仕入明細（商品番号）の検索中にエラーが発生しました: ${bidErr.message}`,
                product_id: productId,
                auction_item_number: itemNumber,
                product_registration_preserved: true,
              },
              500,
              cors
            );
          }
          bidRows = applyLineAndDocFilters(
            (bidData || []) as Record<string, unknown>[],
            "auction_bid_number"
          );
        }

        const allMatchedLineIds = Array.from(
          new Set(
            [...receptionRows, ...bidRows].map((r) => String(r.id))
          )
        );
        let allLineLinks: Record<string, unknown>[] = [];
        if (allMatchedLineIds.length > 0) {
          const { data: lkRows, error: lkErr } = await supabase
            .from("document_product_links")
            .select("*")
            .in("document_line_id", allMatchedLineIds);
          if (lkErr) {
            return jsonResponse(
              {
                success: false,
                linked: false,
                is_reused: false,
                status: "error",
                error_code: "DB_QUERY_ERROR",
                reason_code: "DB_QUERY_ERROR",
                error: lkErr.message,
                message: `既存リンク状態の確認中にエラーが発生しました: ${lkErr.message}`,
                product_id: productId,
                auction_item_number: itemNumber,
                product_registration_preserved: true,
              },
              500,
              cors
            );
          }
          allLineLinks = (lkRows || []) as Record<string, unknown>[];
        }

        const getActiveConfirmedLinksForLine = (lineId: string) =>
          allLineLinks.filter(
            (lk) =>
              String(lk.document_line_id) === lineId &&
              !lk.is_deleted &&
              lk.status === "confirmed"
          );

        const hasBothTypesAcrossDifferentLines =
          numberType === "auto" &&
          receptionRows.length > 0 &&
          bidRows.length > 0 &&
          !(
            receptionRows.length === 1 &&
            bidRows.length === 1 &&
            String(receptionRows[0].id) === String(bidRows[0].id)
          );

        if (hasBothTypesAcrossDifferentLines) {
          const combinedCandidates = [
            ...receptionRows.map((r) =>
              formatAutoLinkCandidateSummary(
                r,
                "reception_number_raw",
                getActiveConfirmedLinksForLine(String(r.id))
              )
            ),
            ...bidRows.map((r) =>
              formatAutoLinkCandidateSummary(
                r,
                "auction_bid_number",
                getActiveConfirmedLinksForLine(String(r.id))
              )
            ),
          ];
          return jsonResponse(
            {
              success: true,
              linked: false,
              is_reused: false,
              status: "multiple_candidates",
              reason_code: "AMBIGUOUS_NUMBER_TYPE",
              message:
                "入力された番号が仕入台帳の「落札・受付番号」と「商品番号」の両方に存在するため、自動紐付けを保留しました。番号種別（number_type）または書類情報を指定して確認してください。",
              product_id: productId,
              auction_item_number: itemNumber,
              searched_number_type: numberType,
              matched_number_type: null,
              product_registration_preserved: true,
              candidate_count: combinedCandidates.length,
              suggested_narrowing_fields:
                computeSuggestedNarrowingFields(combinedCandidates),
              candidates: combinedCandidates,
            },
            200,
            cors
          );
        }

        const matchedField: MatchedNumberField | null =
          receptionRows.length > 0
            ? "reception_number_raw"
            : bidRows.length > 0
              ? "auction_bid_number"
              : null;
        const matchedNumberType =
          matchedField === "reception_number_raw"
            ? "reception_number"
            : matchedField === "auction_bid_number"
              ? "auction_bid_number"
              : null;
        const rawMatchedRows =
          matchedField === "reception_number_raw"
            ? receptionRows
            : matchedField === "auction_bid_number"
              ? bidRows
              : [];

        if (!matchedField || rawMatchedRows.length === 0) {
          return jsonResponse(
            {
              success: true,
              linked: false,
              is_reused: false,
              status: "no_match",
              reason_code: "NO_MATCHING_LINE",
              message: `番号「${itemNumber}」に完全一致する仕入明細は見つかりませんでした。`,
              product_id: productId,
              auction_item_number: itemNumber,
              searched_number_type: numberType,
              matched_number_type: null,
              product_registration_preserved: true,
              candidate_count: 0,
              candidates: [],
            },
            200,
            cors
          );
        }

        const purchaseRows = rawMatchedRows.filter(
          (r) =>
            String(r.transaction_type ?? "purchase") === "purchase" &&
            !r.is_canceled
        );
        const nonPurchaseOrCanceledRows = rawMatchedRows.filter(
          (r) =>
            String(r.transaction_type ?? "purchase") !== "purchase" ||
            Boolean(r.is_canceled)
        );

        if (purchaseRows.length === 0) {
          const nonPurchaseSummaries = nonPurchaseOrCanceledRows.map((r) =>
            formatAutoLinkCandidateSummary(
              r,
              matchedField,
              getActiveConfirmedLinksForLine(String(r.id))
            )
          );
          return jsonResponse(
            {
              success: true,
              linked: false,
              is_reused: false,
              status: "no_match",
              reason_code: "MATCHED_NON_PURCHASE_OR_CANCELED_LINE",
              message: `番号「${itemNumber}」に一致する明細はありますが、仕入対象外（キャンセルまたは精算行）のため自動紐付けを行いませんでした。`,
              product_id: productId,
              auction_item_number: itemNumber,
              searched_number_type: numberType,
              matched_number_type: matchedNumberType,
              product_registration_preserved: true,
              candidate_count: 0,
              candidates: [],
              non_purchase_matches: nonPurchaseSummaries,
            },
            200,
            cors
          );
        }

        if (nonPurchaseOrCanceledRows.length > 0) {
          const allSummaries = rawMatchedRows.map((r) =>
            formatAutoLinkCandidateSummary(
              r,
              matchedField,
              getActiveConfirmedLinksForLine(String(r.id))
            )
          );
          return jsonResponse(
            {
              success: true,
              linked: false,
              is_reused: false,
              status: "multiple_candidates",
              reason_code: "HAS_RELATED_CANCEL_OR_REFUND_LINE",
              message: `番号「${itemNumber}」には仕入行のほかにキャンセル・返金・精算等の関連明細が存在するため、自動紐付けを保留しました。`,
              product_id: productId,
              auction_item_number: itemNumber,
              searched_number_type: numberType,
              matched_number_type: matchedNumberType,
              product_registration_preserved: true,
              candidate_count: allSummaries.length,
              suggested_narrowing_fields:
                computeSuggestedNarrowingFields(allSummaries),
              candidates: allSummaries,
            },
            200,
            cors
          );
        }

        if (purchaseRows.length > 1) {
          const candidateSummaries = purchaseRows.map((r) =>
            formatAutoLinkCandidateSummary(
              r,
              matchedField,
              getActiveConfirmedLinksForLine(String(r.id))
            )
          );
          return jsonResponse(
            {
              success: true,
              linked: false,
              is_reused: false,
              status: "multiple_candidates",
              reason_code: "MULTIPLE_MATCHING_LINES",
              message: `番号「${itemNumber}」に一致する仕入明細が ${candidateSummaries.length} 件あるため、自動紐付けを保留しました。仕入先・仕入日・書類番号等で確認してください。`,
              product_id: productId,
              auction_item_number: itemNumber,
              searched_number_type: numberType,
              matched_number_type: matchedNumberType,
              product_registration_preserved: true,
              candidate_count: candidateSummaries.length,
              suggested_narrowing_fields:
                computeSuggestedNarrowingFields(candidateSummaries),
              candidates: candidateSummaries,
            },
            200,
            cors
          );
        }

        const targetLine = purchaseRows[0];
        const targetLineId = String(targetLine.id);
        const lineAllLinks = allLineLinks.filter(
          (lk) => String(lk.document_line_id) === targetLineId
        );
        const activeLineLinks = lineAllLinks.filter(
          (lk) => !lk.is_deleted && lk.status === "confirmed"
        );
        const candidateSummary = formatAutoLinkCandidateSummary(
          targetLine,
          matchedField,
          activeLineLinks
        );

        const { data: productActiveLinksData, error: prodLkErr } =
          await supabase
            .from("document_product_links")
            .select("*")
            .eq("product_id", productId)
            .eq("is_deleted", false)
            .eq("status", "confirmed");
        if (prodLkErr) {
          return jsonResponse(
            {
              success: false,
              linked: false,
              is_reused: false,
              status: "error",
              error_code: "DB_QUERY_ERROR",
              reason_code: "DB_QUERY_ERROR",
              error: prodLkErr.message,
              message: `商品の既存リンク確認中にエラーが発生しました: ${prodLkErr.message}`,
              product_id: productId,
              auction_item_number: itemNumber,
              product_registration_preserved: true,
            },
            500,
            cors
          );
        }
        const productActiveLinks = (productActiveLinksData ||
          []) as Record<string, unknown>[];

        const otherProductLinksOnLine = activeLineLinks.filter(
          (lk) => String(lk.product_id) !== productId
        );
        const sameProductPrimaryLinks = activeLineLinks.filter(
          (lk) =>
            String(lk.product_id) === productId &&
            lk.link_type === "primary_cost"
        );
        const sameProductOtherTypeLinks = activeLineLinks.filter(
          (lk) =>
            String(lk.product_id) === productId &&
            lk.link_type !== "primary_cost"
        );
        const productOtherLinePrimaryLinks = productActiveLinks.filter(
          (lk) =>
            String(lk.document_line_id) !== targetLineId &&
            lk.link_type === "primary_cost"
        );

        const unlinkedHistoryOnLine = lineAllLinks
          .filter((lk) => Boolean(lk.is_deleted) || lk.status === "unlinked")
          .map((lk) => ({
            link_id: lk.id,
            product_id: lk.product_id,
            link_type: lk.link_type,
            allocated_amount: toNumOrNull(lk.allocated_amount),
            status: lk.status,
            deleted_at: lk.deleted_at ?? lk.updated_at ?? null,
          }));

        if (otherProductLinksOnLine.length > 0) {
          const conflictingProductIds = Array.from(
            new Set(otherProductLinksOnLine.map((lk) => String(lk.product_id)))
          );
          const productSummaries: Record<string, Record<string, unknown>> = {};
          for (const cPid of conflictingProductIds.slice(0, 5)) {
            const summary = await fetchGasProductSummarySafe(gasUrl, cPid);
            if (summary) productSummaries[cPid] = summary;
          }
          const enrichedConflicts = otherProductLinksOnLine.map((lk) => ({
            link_id: lk.id,
            document_line_id: lk.document_line_id,
            product_id: lk.product_id,
            link_type: lk.link_type,
            allocated_amount: toNumOrNull(lk.allocated_amount),
            allocation_method: lk.allocation_method,
            match_method: lk.match_method,
            confirmed_at: lk.confirmed_at ?? null,
            product_summary:
              productSummaries[String(lk.product_id)] ?? null,
          }));

          return jsonResponse(
            {
              success: true,
              linked: false,
              is_reused: false,
              status: "conflict_existing_link",
              reason_code: "LINE_ALREADY_LINKED_TO_OTHER_PRODUCT",
              message: `該当する仕入明細は既に別商品（${conflictingProductIds.join(", ")}）に確定紐付けされているため、自動紐付けを行いませんでした。既存リンクは維持されています。`,
              product_id: productId,
              auction_item_number: itemNumber,
              searched_number_type: numberType,
              matched_number_type: matchedNumberType,
              product_registration_preserved: true,
              candidate_count: 1,
              candidate: candidateSummary,
              candidates: [candidateSummary],
              conflicting_links: enrichedConflicts,
              unlinked_history: unlinkedHistoryOnLine,
            },
            200,
            cors
          );
        }

        if (productOtherLinePrimaryLinks.length > 0) {
          return jsonResponse(
            {
              success: true,
              linked: false,
              is_reused: false,
              status: "conflict_existing_link",
              reason_code: "PRODUCT_ALREADY_LINKED_TO_OTHER_LINE",
              message: `商品（${productId}）は既に別の仕入明細に確定紐付けされているため、自動切り替えを行いませんでした。既存リンクは維持されています。`,
              product_id: productId,
              auction_item_number: itemNumber,
              searched_number_type: numberType,
              matched_number_type: matchedNumberType,
              product_registration_preserved: true,
              candidate_count: 1,
              candidate: candidateSummary,
              candidates: [candidateSummary],
              conflicting_links: productOtherLinePrimaryLinks.map((lk) => ({
                link_id: lk.id,
                document_line_id: lk.document_line_id,
                product_id: lk.product_id,
                link_type: lk.link_type,
                allocated_amount: toNumOrNull(lk.allocated_amount),
                allocation_method: lk.allocation_method,
                match_method: lk.match_method,
                confirmed_at: lk.confirmed_at ?? null,
              })),
            },
            200,
            cors
          );
        }

        const amountResult = computeAutoLinkAllocatedAmount(targetLine);
        if (!amountResult.ok) {
          return jsonResponse(
            {
              success: true,
              linked: false,
              is_reused: false,
              status: "amount_error",
              reason_code: amountResult.reason_code,
              message: amountResult.message,
              product_id: productId,
              auction_item_number: itemNumber,
              searched_number_type: numberType,
              matched_number_type: matchedNumberType,
              product_registration_preserved: true,
              candidate_count: 1,
              candidate: candidateSummary,
              candidates: [candidateSummary],
            },
            200,
            cors
          );
        }

        if (sameProductPrimaryLinks.length > 0) {
          const existingPrimary = sameProductPrimaryLinks[0];
          const existingAllocated = toNumOrNull(
            existingPrimary.allocated_amount
          );
          if (
            sameProductOtherTypeLinks.length > 0 ||
            existingAllocated === null ||
            Math.abs(existingAllocated - amountResult.allocated_amount) > 0.01
          ) {
            return jsonResponse(
              {
                success: true,
                linked: false,
                is_reused: false,
                status: "conflict_existing_link",
                reason_code: "EXISTING_LINK_AMOUNT_DISCREPANCY",
                message: `同一商品への既存リンクが存在しますが、割当額（¥${(existingAllocated ?? 0).toLocaleString("ja-JP")}）が明細の算定額（¥${amountResult.allocated_amount.toLocaleString("ja-JP")}）と異なるため上書きせず維持しました。`,
                product_id: productId,
                auction_item_number: itemNumber,
                searched_number_type: numberType,
                matched_number_type: matchedNumberType,
                product_registration_preserved: true,
                candidate_count: 1,
                candidate: candidateSummary,
                candidates: [candidateSummary],
                conflicting_links: activeLineLinks,
                expected_allocated_amount: amountResult.allocated_amount,
              },
              200,
              cors
            );
          }

          const audit = await computeAuditSummary(
            supabase,
            String(targetLine.document_id)
          );
          const productCost = await computeProductCostBreakdown(
            supabase,
            productId
          );
          return jsonResponse(
            {
              success: true,
              linked: true,
              is_reused: true,
              status: "already_linked_same_product",
              reason_code: "ALREADY_LINKED_IDEMPOTENT",
              message: "既に同じ仕入明細へ確定紐付け済みです（二重作成なし）。",
              product_id: productId,
              auction_item_number: itemNumber,
              searched_number_type: numberType,
              matched_number_type: matchedNumberType,
              product_registration_preserved: true,
              tax_confirmed: amountResult.tax_confirmed,
              allocated_amount: existingAllocated,
              candidate_count: 1,
              candidate: candidateSummary,
              link: existingPrimary,
              audit: formatAuditSummary(audit),
              product_cost: productCost || null,
            },
            200,
            cors
          );
        }

        if (activeLineLinks.length > 0) {
          return jsonResponse(
            {
              success: true,
              linked: false,
              is_reused: false,
              status: "conflict_existing_link",
              reason_code: "EXISTING_NON_PRIMARY_LINK",
              message:
                "該当する仕入明細に既存の有効リンクが存在するため、自動紐付けを保留しました。",
              product_id: productId,
              auction_item_number: itemNumber,
              searched_number_type: numberType,
              matched_number_type: matchedNumberType,
              product_registration_preserved: true,
              candidate_count: 1,
              candidate: candidateSummary,
              candidates: [candidateSummary],
              conflicting_links: activeLineLinks,
            },
            200,
            cors
          );
        }

        const matchMethod =
          matchedField === "reception_number_raw"
            ? "reception_number_exact"
            : "auction_bid_number_exact";

        if (dryRun) {
          return jsonResponse(
            {
              success: true,
              dry_run: true,
              linked: false,
              would_link: true,
              is_reused: false,
              status: "dry_run_ready_to_link",
              reason_code: "READY_TO_LINK",
              message:
                "一意の未紐付け仕入明細が確認されました（dry_run のため未書込）。",
              product_id: productId,
              auction_item_number: itemNumber,
              searched_number_type: numberType,
              matched_number_type: matchedNumberType,
              match_method: matchMethod,
              product_registration_preserved: true,
              tax_confirmed: amountResult.tax_confirmed,
              expected_allocated_amount: amountResult.allocated_amount,
              candidate_count: 1,
              candidate: candidateSummary,
              candidates: [candidateSummary],
            },
            200,
            cors
          );
        }

        const confirmedAt = new Date().toISOString();
        const autoNote = `auto_link:${matchedField}=${itemNumber}`;
        const existingSoftDeleted = lineAllLinks.find(
          (lk) =>
            String(lk.product_id) === productId &&
            lk.link_type === "primary_cost" &&
            Boolean(lk.is_deleted)
        );

        let savedLink: Record<string, unknown> | null = null;
        if (existingSoftDeleted) {
          const { data: restoredLink, error: restoreErr } = await supabase
            .from("document_product_links")
            .update({
              allocated_amount: amountResult.allocated_amount,
              allocation_method: "direct",
              match_method: matchMethod,
              confidence_score: 1.0,
              status: "confirmed",
              confirmed_by: confirmedBy,
              confirmed_at: confirmedAt,
              notes: autoNote,
              is_deleted: false,
              deleted_at: null,
              deleted_by: null,
              updated_at: confirmedAt,
            })
            .eq("id", existingSoftDeleted.id)
            .eq("is_deleted", true)
            .select()
            .single();
          if (restoreErr) {
            return jsonResponse(
              {
                success: false,
                linked: false,
                is_reused: false,
                status: "error",
                error_code: "LINK_UPDATE_ERROR",
                reason_code: "LINK_UPDATE_ERROR",
                error: restoreErr.message,
                message: `自動紐付けの保存中にエラーが発生しました: ${restoreErr.message}`,
                product_id: productId,
                auction_item_number: itemNumber,
                product_registration_preserved: true,
              },
              500,
              cors
            );
          }
          savedLink = restoredLink;
        } else {
          const { data: insertedLink, error: insErr } = await supabase
            .from("document_product_links")
            .insert({
              document_line_id: targetLineId,
              product_id: productId,
              link_type: "primary_cost",
              allocated_amount: amountResult.allocated_amount,
              allocation_method: "direct",
              match_method: matchMethod,
              confidence_score: 1.0,
              status: "confirmed",
              confirmed_by: confirmedBy,
              confirmed_at: confirmedAt,
              notes: autoNote,
            })
            .select()
            .single();

          if (insErr) {
            const { data: concurrentSame } = await supabase
              .from("document_product_links")
              .select("*")
              .eq("document_line_id", targetLineId)
              .eq("product_id", productId)
              .eq("link_type", "primary_cost")
              .eq("is_deleted", false)
              .eq("status", "confirmed")
              .maybeSingle();
            if (concurrentSame) {
              const audit = await computeAuditSummary(
                supabase,
                String(targetLine.document_id)
              );
              const productCost = await computeProductCostBreakdown(
                supabase,
                productId
              );
              return jsonResponse(
                {
                  success: true,
                  linked: true,
                  is_reused: true,
                  status: "already_linked_same_product",
                  reason_code: "ALREADY_LINKED_IDEMPOTENT",
                  message:
                    "既に同じ仕入明細へ確定紐付け済みです（二重作成なし）。",
                  product_id: productId,
                  auction_item_number: itemNumber,
                  searched_number_type: numberType,
                  matched_number_type: matchedNumberType,
                  product_registration_preserved: true,
                  tax_confirmed: amountResult.tax_confirmed,
                  allocated_amount: toNumOrNull(
                    concurrentSame.allocated_amount
                  ),
                  candidate_count: 1,
                  candidate: candidateSummary,
                  link: concurrentSame,
                  audit: formatAuditSummary(audit),
                  product_cost: productCost || null,
                },
                200,
                cors
              );
            }

            return jsonResponse(
              {
                success: false,
                linked: false,
                is_reused: false,
                status: "error",
                error_code: "LINK_CREATE_ERROR",
                reason_code: "LINK_CREATE_ERROR",
                error: insErr.message,
                message: `自動紐付けの作成中にエラーが発生しました: ${insErr.message}`,
                product_id: productId,
                auction_item_number: itemNumber,
                product_registration_preserved: true,
              },
              500,
              cors
            );
          }
          savedLink = insertedLink;
        }

        const { data: postLinks } = await supabase
          .from("document_product_links")
          .select("*")
          .eq("document_line_id", targetLineId)
          .eq("is_deleted", false)
          .eq("status", "confirmed");
        const concurrentOther = ((postLinks || []) as Record<string, unknown>[]).filter(
          (lk) => String(lk.product_id) !== productId
        );
        if (concurrentOther.length > 0 && savedLink?.id) {
          await supabase
            .from("document_product_links")
            .update({
              is_deleted: true,
              deleted_at: new Date().toISOString(),
              deleted_by: "auto_link_conflict_rollback",
              status: "unlinked",
            })
            .eq("id", savedLink.id);
          return jsonResponse(
            {
              success: true,
              linked: false,
              is_reused: false,
              status: "conflict_existing_link",
              reason_code: "LINE_ALREADY_LINKED_TO_OTHER_PRODUCT",
              message:
                "同時更新により別商品への確定リンクが検出されたため、自動紐付けを取り消して既存リンクを保護しました。",
              product_id: productId,
              auction_item_number: itemNumber,
              searched_number_type: numberType,
              matched_number_type: matchedNumberType,
              product_registration_preserved: true,
              candidate_count: 1,
              candidate: candidateSummary,
              candidates: [candidateSummary],
              conflicting_links: concurrentOther,
            },
            200,
            cors
          );
        }

        await supabase
          .from("document_lines")
          .update({ match_status: "confirmed", updated_at: confirmedAt })
          .eq("id", targetLineId);

        await refreshDocumentStatus(supabase, String(targetLine.document_id));

        const audit = await computeAuditSummary(
          supabase,
          String(targetLine.document_id)
        );
        const productCost = await computeProductCostBreakdown(
          supabase,
          productId
        );
        const updatedCandidate = formatAutoLinkCandidateSummary(
          { ...targetLine, match_status: "confirmed" },
          matchedField,
          savedLink ? [savedLink] : []
        );

        return jsonResponse(
          {
            success: true,
            linked: true,
            is_reused: false,
            status: "linked",
            reason_code: "AUTO_LINKED_EXACT_UNIQUE",
            message: "一意の仕入明細を確認し、商品へ自動紐付けしました。",
            product_id: productId,
            auction_item_number: itemNumber,
            searched_number_type: numberType,
            matched_number_type: matchedNumberType,
            match_method: matchMethod,
            product_registration_preserved: true,
            tax_confirmed: amountResult.tax_confirmed,
            allocated_amount: amountResult.allocated_amount,
            candidate_count: 1,
            candidate: updatedCandidate,
            link: savedLink,
            audit: formatAuditSummary(audit),
            product_cost: productCost || null,
          },
          200,
          cors
        );
      } catch (autoErr: unknown) {
        const msg =
          autoErr instanceof Error ? autoErr.message : String(autoErr);
        return jsonResponse(
          {
            success: false,
            linked: false,
            is_reused: false,
            status: "error",
            error_code: "AUTO_LINK_INTERNAL_ERROR",
            reason_code: "AUTO_LINK_INTERNAL_ERROR",
            error: msg,
            message: `自動紐付け処理中にエラーが発生しました: ${msg}`,
            product_id: productId,
            auction_item_number: itemNumber,
            product_registration_preserved: true,
          },
          500,
          cors
        );
      }
    }

    // ----------------------------------------------------
    // 9. register_drive_document: Drive自動取込の原本を台帳へ登録
    //    - 原本は既にDriveにある前提(アップロードしない)
    //    - status は pending / pending_amount のみ。processed にはしない
    //    - 同じ drive_file_id の再送は重複登録しない
    //    - validate_only: true は DB を一切読み書きしない
    // ----------------------------------------------------
    if (action === ACTIONS.register_drive_document) {
      const driveFileId = asString(
        body.drive_file_id ?? body.file_id ?? body.driveFileId
      );
      if (!driveFileId) {
        return errorResponse(
          "DRIVE_FILE_ID_REQUIRED",
          "drive_file_id は必須です。",
          400,
          cors
        );
      }

      const fileName = asString(body.file_name ?? body.fileName ?? body.name);
      if (!fileName) {
        return errorResponse(
          "FILE_NAME_REQUIRED",
          "file_name は必須です。",
          400,
          cors
        );
      }

      // 入力検証のみで終了(DB書込なし・DB読取なし)
      if (body.validate_only === true) {
        return jsonResponse(
          {
            success: true,
            validate_only: true,
            action,
            writes_performed: false,
            would_insert: {
              drive_file_id: driveFileId,
              file_name: fileName,
              status: optionalNumber(body.total_amount) === null
                ? "pending_amount"
                : "pending",
            },
          },
          200,
          cors
        );
      }

      // 重複判定: 同じ Drive ファイルIDの再送は既存を返す(二重登録しない)
      const { data: existingByDriveId, error: driveIdErr } = await supabase
        .from("documents")
        .select("*")
        .eq("drive_file_id", driveFileId)
        .eq("is_deleted", false)
        .maybeSingle();
      if (driveIdErr) {
        return errorResponse("DB_QUERY_ERROR", driveIdErr.message, 500, cors);
      }
      if (existingByDriveId) {
        const audit = await computeAuditSummary(
          supabase,
          String(existingByDriveId.id)
        );
        return jsonResponse(
          {
            success: true,
            is_reused: true,
            matched_by: "drive_file_id",
            document: existingByDriveId,
            audit: formatAuditSummary(audit),
          },
          200,
          cors
        );
      }

      const idempotencyKey =
        asString(body.idempotency_key) || `drive:${driveFileId}`;

      const { data: existingByKey, error: keyErr } = await supabase
        .from("documents")
        .select("*")
        .eq("idempotency_key", idempotencyKey)
        .eq("is_deleted", false)
        .maybeSingle();
      if (keyErr) {
        return errorResponse("DB_QUERY_ERROR", keyErr.message, 500, cors);
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
            matched_by: "idempotency_key",
            document: existingByKey,
            audit: formatAuditSummary(audit),
          },
          200,
          cors
        );
      }

      const totalAmount = optionalNumber(body.total_amount);
      // processed にはしない。金額未確定なら pending_amount。
      const initialStatus = totalAmount === null ? "pending_amount" : "pending";

      const insertRecord = {
        idempotency_key: idempotencyKey,
        document_number: optionalText(body.document_number),
        invoice_registration_number: optionalText(
          body.invoice_registration_number
        ),
        document_type: asString(body.document_type) || "invoice",
        supplier_name: asString(body.supplier_name) || "未設定",
        supplier_code: optionalText(body.supplier_code),
        issue_date: optionalText(body.issue_date),
        due_date: optionalText(body.due_date),
        currency: asString(body.currency) || "JPY",
        total_amount: totalAmount,
        tax_amount: optionalNumber(body.tax_amount),
        drive_file_id: driveFileId,
        drive_folder_id: optionalText(
          body.drive_folder_id ?? body.folder_id
        ),
        drive_file_url: optionalText(
          body.drive_file_url ?? body.file_url ?? body.view_url
        ),
        file_name: fileName,
        mime_type:
          asString(body.mime_type).toLowerCase() || "application/pdf",
        file_size: optionalNumber(body.file_size) ?? 0,
        file_fingerprint: await computeSha256(`drive:${driveFileId}`),
        status: initialStatus,
        notes: optionalText(body.notes ?? body.note),
        created_by: asString(body.confirmed_by) || "drive-worker",
      };

      const { data: newDoc, error: insertErr } = await supabase
        .from("documents")
        .insert(insertRecord)
        .select()
        .single();
      if (insertErr) {
        return errorResponse("DB_INSERT_ERROR", insertErr.message, 500, cors);
      }

      return jsonResponse(
        {
          success: true,
          is_reused: false,
          document: newDoc,
          audit: formatAuditSummary(
            await computeAuditSummary(supabase, String(newDoc.id))
          ),
        },
        201,
        cors
      );
    }

    // ----------------------------------------------------
    // 10. update_document_folder: 原本のDrive移動結果を台帳へ反映
    //     - drive_folder_id / drive_file_url の更新が主目的
    //     - processed へ変えるのは mark_processed: true を明示した時だけ
    //       (body.status では絶対に変えない)
    //     - validate_only: true は DB を一切読み書きしない
    // ----------------------------------------------------
    if (action === ACTIONS.update_document_folder) {
      const documentId = asString(body.document_id)
        || asString(body.id);
      const driveFileId = asString(
        body.drive_file_id ?? body.file_id ?? body.driveFileId
      );

      if (!documentId && !driveFileId) {
        return errorResponse(
          "DOCUMENT_ID_REQUIRED",
          "document_id または drive_file_id は必須です。",
          400,
          cors
        );
      }

      const nextFolderId = optionalText(
        body.drive_folder_id ?? body.folder_id
      );
      const nextFileUrl = optionalText(
        body.drive_file_url ?? body.file_url ?? body.view_url
      );
      const markProcessed = body.mark_processed === true;

      if (nextFolderId === null && nextFileUrl === null && !markProcessed) {
        return errorResponse(
          "NO_UPDATE_FIELDS",
          "更新対象がありません (drive_folder_id / drive_file_url / mark_processed)。",
          400,
          cors
        );
      }

      if (body.validate_only === true) {
        return jsonResponse(
          {
            success: true,
            validate_only: true,
            action,
            writes_performed: false,
            would_update: {
              lookup: documentId
                ? { document_id: documentId }
                : { drive_file_id: driveFileId },
              drive_folder_id: nextFolderId,
              drive_file_url: nextFileUrl,
              status: markProcessed ? "processed" : "(変更なし)",
            },
          },
          200,
          cors
        );
      }

      let docQuery = supabase
        .from("documents")
        .select("*")
        .eq("is_deleted", false);
      docQuery = documentId
        ? docQuery.eq("id", documentId)
        : docQuery.eq("drive_file_id", driveFileId);

      const { data: doc, error: docErr } = await docQuery.maybeSingle();
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

      const updateRecord: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (nextFolderId !== null) updateRecord.drive_folder_id = nextFolderId;
      if (nextFileUrl !== null) updateRecord.drive_file_url = nextFileUrl;
      // 明示的な mark_processed のみ processed へ
      if (markProcessed) updateRecord.status = "processed";

      const { data: updatedDoc, error: updErr } = await supabase
        .from("documents")
        .update(updateRecord)
        .eq("id", doc.id)
        .select()
        .single();
      if (updErr) {
        return errorResponse("DB_UPDATE_ERROR", updErr.message, 500, cors);
      }

      return jsonResponse(
        {
          success: true,
          is_reused: false,
          mark_processed_applied: markProcessed,
          document: updatedDoc,
          audit: formatAuditSummary(
            await computeAuditSummary(supabase, String(doc.id))
          ),
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