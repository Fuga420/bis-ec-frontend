// gas-ai-batch-relay
// 一括AI出品ドラフト生成（バッチ）専用の中継（Readdy Backend Edge Function）。
//
// 役割（AI_BATCH_API_CONTRACT.md 5章 + GAS v103 連携）:
//   Readdy(ブラウザ) --POST/GET--> この中継 --(mode:admin + admin_key をサーバー側で付与)--> GAS /exec
//
// ・ブラウザには GAS URL も ADMIN_API_KEY も出さない。
// ・クライアントから mode / admin_key が送られても破棄し、サーバー側の値で必ず上書きする。
// ・バッチ3action（create / get / retry）に加え、AI解析用画像の保存
//   （save_product_ai_selected_images）をサーバー側で中継する。
// ・単品系（gas-ai-relay）は一切変更しない。
//
// GAS v103 連携（原価・価格下限）:
//   create_ai_product_draft_batch の転送時、対象 product_id ごとに
//   Readdy Backend 内蔵DBの「確定済み手動照合」から原価内訳と紐付け明細を取得し、
//   product_costs（商品IDをキーにしたオブジェクト）として GAS へ渡す。
//   ブラウザから送られた product_costs は原価の正本として採用しない（破棄する）。
//   紐付けリンクが無い商品は null（＝原価なし。GAS 側は従来の相場ベース提案）。
//   原価取得がエラーになった場合は、原価なしで開始せずエラーを返す。
//
//   価格ルールは v103 の「概算原価への上乗せ率（min_cost_markup_rate）」に従う。
//   旧項目 min_gross_margin_rate は受理も転送もしない（契約変更のため廃止）。
//
// 認証: ゲートウェイの JWT 検証（verify_jwt=true）に委ねる。
// 環境変数（既存 gas-ai-relay と同じプロジェクトSecretsを流用）:
//   GAS_WEBHOOK_URL             : GAS Web App の /exec URL
//   GAS_ADMIN_SECRET            : GAS 管理者キー（サーバー側でのみ付与）
//   ALLOWED_ORIGINS             : 許可オリジン（カンマ区切り、任意）
//   SUPABASE_URL                : プロジェクト URL（原価取得用）
//   SUPABASE_SERVICE_ROLE_KEY   : サービスロールキー（原価取得用・サーバー内のみ）

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const MAX_BATCH_SIZE = 20;

// AI解析に使う画像の最大枚数（GAS 側と同じ上限）
const MAX_AI_SELECTED_IMAGES = 3;

// 概算原価への最低上乗せ率の既定値（30% = 下限価格は原価 × 1.30）
const DEFAULT_MIN_COST_MARKUP_RATE = 0.3;

// GAS v103 契約の許容範囲: 0 < min_cost_markup_rate <= 5.0（＝0%超〜500%）
const MIN_COST_MARKUP_RATE_EXCLUSIVE_MIN = 0;
const MIN_COST_MARKUP_RATE_MAX = 5.0;

const BATCH_ACTIONS = {
  create: "create_ai_product_draft_batch",
  get: "get_ai_product_draft_batch",
  retry: "retry_ai_product_draft_batch",
  saveSelectedImages: "save_product_ai_selected_images",
} as const;

const KNOWN_ACTIONS: string[] = [
  BATCH_ACTIONS.create,
  BATCH_ACTIONS.get,
  BATCH_ACTIONS.retry,
  BATCH_ACTIONS.saveSelectedImages,
];

const ALLOWED_FORWARD_FIELDS: Record<string, readonly string[]> = {
  // model_name は意図的に転送しない。旧モデル（gemini-3.5-flash-lite 等）を
  // クライアントから上書き送信されると、GAS 側で指定される検索付き生成モデルを
  // 打ち消してしまうため、モデルの選択は常にサーバー（GAS）既定に委ねる。
  // product_costs も転送しない（ブラウザ送信値を原価の正本として採用しない）。
  // min_gross_margin_rate は v103 で廃止。誤って送られてもホワイトリストで落とす。
  [BATCH_ACTIONS.create]: [
    "request_id",
    "product_ids",
    "force_regenerate",
    "min_cost_markup_rate",
  ],
  [BATCH_ACTIONS.get]: ["batch_id"],
  [BATCH_ACTIONS.retry]: ["batch_id", "request_id"],
  [BATCH_ACTIONS.saveSelectedImages]: ["product_id", "selected_image_ids"],
};

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
  cors: Record<string, string>
): Response {
  return jsonResponse(
    { success: false, error_code: code, error: message, message },
    status,
    cors
  );
}

// ---------- helpers ----------

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

// クライアント入力をホワイトリストで抜き出す（mode / admin_key は絶対に通さない）。
function pickAllowed(
  source: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of fields) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = source[key];
    }
  }
  return out;
}

function parseGasResponse(text: string): unknown {
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

// ---------- GAS forwarding ----------

async function forwardPostToGas(
  gasUrl: string,
  payload: Record<string, unknown>
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(gasUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { status: res.status, data: parseGasResponse(text) };
}

async function forwardGetToGas(
  gasUrl: string,
  params: Record<string, string>
): Promise<{ status: number; data: unknown }> {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${gasUrl}?${query}`, { method: "GET" });
  const text = await res.text();
  return { status: res.status, data: parseGasResponse(text) };
}

// ---------- Product cost (確定済み手動照合の原価) ----------

type SupabaseAdmin = ReturnType<typeof createClient>;

function getSupabaseAdmin(): SupabaseAdmin {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function toNumOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

type Row = Record<string, unknown>;

/**
 * documents-relay の get_product_cost が返す { cost_breakdown, links } と同じ内容を、
 * service_role で DB から組み立てる（レスポンス項目は v_product_cost_breakdown と同一）。
 * 紐付けリンクが無い商品は null（＝原価なし）。
 * DB エラーは呼び出し側で「原価なしとして開始しない」エラーに変換する。
 */
async function fetchProductCost(
  supabase: SupabaseAdmin,
  productId: string
): Promise<{ cost_breakdown: Row; links: Row[] } | null> {
  const { data: links, error: linkErr } = await supabase
    .from("document_product_links")
    .select(
      `id,
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
         document_id,
         is_deleted,
         is_active,
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
       )`
    )
    .eq("product_id", productId)
    .eq("is_deleted", false)
    .eq("status", "confirmed")
    .order("created_at", { ascending: true });

  if (linkErr) {
    throw new Error(`document_product_links: ${linkErr.message}`);
  }

  const linkArr: Row[] = (links ?? []) as Row[];

  // 論理削除・無効化された明細行に紐づくリンクは原価に含めない。
  const validLinks = linkArr.filter((link) => {
    const line = link.line as Row | null | undefined;
    if (!line) return false;
    return !line.is_deleted && line.is_active;
  });
  if (validLinks.length === 0) return null;

  const sumAllocated = (predicate: (link: Row) => boolean): number =>
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

  const documentIds = new Set<string>();
  let lastConfirmedAt: string | null = null;
  for (const l of validLinks) {
    const line = l.line as Row | null | undefined;
    if (line && line.document_id != null) {
      documentIds.add(String(line.document_id));
    }
    const v = l.confirmed_at;
    if (
      typeof v === "string" &&
      (lastConfirmedAt === null || v > lastConfirmedAt)
    ) {
      lastConfirmedAt = v;
    }
  }

  return {
    cost_breakdown: {
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
    },
    links: validLinks,
  };
}

/**
 * 対象の全 product_id の原価を取得する。
 * 1件でも取得に失敗したら throw（原価なし扱いで開始しない）。
 */
async function fetchProductCosts(
  supabase: SupabaseAdmin,
  productIds: string[]
): Promise<Record<string, { cost_breakdown: Row; links: Row[] } | null>> {
  const out: Record<string, { cost_breakdown: Row; links: Row[] } | null> = {};
  for (const productId of productIds) {
    out[productId] = await fetchProductCost(supabase, productId);
  }
  return out;
}

// ---------- validation ----------

type ValidationResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; code: string; message: string };

/**
 * 概算原価への最低上乗せ率を検証する（GAS v103 契約）。
 * 未指定（キーなし）は既定の 0.30（30%）。空文字・範囲外・非数値は null を返す
 * （不正値を黙って既定値に置き換えない）。
 */
function parseMinCostMarkupRate(value: unknown): number | null {
  if (value === undefined || value === null) {
    return DEFAULT_MIN_COST_MARKUP_RATE;
  }
  const n =
    typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  if (!(n > MIN_COST_MARKUP_RATE_EXCLUSIVE_MIN)) return null;
  if (n > MIN_COST_MARKUP_RATE_MAX) return null;
  return Math.round(n * 10000) / 10000;
}

function validateCreate(input: Record<string, unknown>): ValidationResult {
  const requestId = asString(input.request_id);
  if (!requestId) {
    return {
      ok: false,
      code: "REQUEST_ID_REQUIRED",
      message: "request_id は必須です。",
    };
  }
  const rawIds = input.product_ids;
  if (!Array.isArray(rawIds)) {
    return {
      ok: false,
      code: "EMPTY_PRODUCT_IDS",
      message: "product_ids が配列ではありません。",
    };
  }
  const productIds = rawIds.map((v) => asString(v)).filter(Boolean);
  if (productIds.length === 0) {
    return {
      ok: false,
      code: "EMPTY_PRODUCT_IDS",
      message: "product_ids が空です。",
    };
  }
  if (productIds.length > MAX_BATCH_SIZE) {
    return {
      ok: false,
      code: "MAX_BATCH_SIZE_EXCEEDED",
      message: `product_ids は最大${MAX_BATCH_SIZE}件です。`,
    };
  }
  const minRate = parseMinCostMarkupRate(input.min_cost_markup_rate);
  if (minRate === null) {
    return {
      ok: false,
      code: "INVALID_MIN_COST_MARKUP_RATE",
      message:
        "min_cost_markup_rate は 0 より大きく 5.0 以下の小数で指定してください（例: 0.3 = 30%）。",
    };
  }
  const payload: Record<string, unknown> = {
    request_id: requestId,
    product_ids: productIds,
    min_cost_markup_rate: minRate,
  };
  if (typeof input.force_regenerate === "boolean") {
    payload.force_regenerate = input.force_regenerate;
  }
  // model_name は転送しない（検索付き生成のサーバー既定モデルを保持するため）。
  return { ok: true, payload };
}

function validateGet(input: Record<string, unknown>): ValidationResult {
  const batchId = asString(input.batch_id);
  if (!batchId) {
    return {
      ok: false,
      code: "BATCH_ID_REQUIRED",
      message: "batch_id は必須です。",
    };
  }
  return { ok: true, payload: { batch_id: batchId } };
}

function validateRetry(input: Record<string, unknown>): ValidationResult {
  const batchId = asString(input.batch_id);
  if (!batchId) {
    return {
      ok: false,
      code: "BATCH_ID_REQUIRED",
      message: "batch_id は必須です。",
    };
  }
  const requestId = asString(input.request_id);
  if (!requestId) {
    return {
      ok: false,
      code: "REQUEST_ID_REQUIRED",
      message: "request_id は必須です。",
    };
  }
  return { ok: true, payload: { batch_id: batchId, request_id: requestId } };
}

function validateSaveSelectedImages(
  input: Record<string, unknown>
): ValidationResult {
  const productId = asString(input.product_id);
  if (!productId) {
    return {
      ok: false,
      code: "PRODUCT_ID_REQUIRED",
      message: "product_id は必須です。",
    };
  }
  const raw = input.selected_image_ids;
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      code: "INVALID_SELECTED_IMAGE_IDS",
      message: "selected_image_ids は配列で指定してください（空配列は指定解除）。",
    };
  }
  const ids: string[] = [];
  for (const value of raw) {
    const id = asString(value).trim();
    if (!id) continue;
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length > MAX_AI_SELECTED_IMAGES) {
    return {
      ok: false,
      code: "TOO_MANY_SELECTED_IMAGES",
      message: `AI解析に使う画像は最大${MAX_AI_SELECTED_IMAGES}枚です。`,
    };
  }
  return {
    ok: true,
    payload: { product_id: productId, selected_image_ids: ids },
  };
}

// ---------- handler ----------

serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(resolveCorsOrigin(req));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const gasUrl = Deno.env.get("GAS_WEBHOOK_URL") ?? "";
  const adminSecret = Deno.env.get("GAS_ADMIN_SECRET") ?? "";
  if (!gasUrl || !adminSecret) {
    return errorResponse(
      "RELAY_MISCONFIGURED",
      "中継サーバーの設定が不足しています。",
      500,
      cors
    );
  }

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
    if (action === BATCH_ACTIONS.create) {
      const input = pickAllowed(body, ALLOWED_FORWARD_FIELDS[BATCH_ACTIONS.create]);
      const v = validateCreate(input);
      if (!v.ok) return errorResponse(v.code, v.message, 400, cors);

      const productIds = v.payload.product_ids as string[];

      // 原価はサーバー側（Readdy Backend 内蔵DB）で取得したものだけを渡す。
      let productCosts: Record<string, unknown>;
      try {
        const supabase = getSupabaseAdmin();
        productCosts = await fetchProductCosts(supabase, productIds);
      } catch (e) {
        return errorResponse(
          "PRODUCT_COST_FETCH_FAILED",
          `原価の取得に失敗したため一括生成を開始できません: ${
            e instanceof Error ? e.message : "unknown error"
          }`,
          502,
          cors
        );
      }

      const { status, data } = await forwardPostToGas(gasUrl, {
        action,
        mode: "admin",
        admin_key: adminSecret,
        ...v.payload,
        product_costs: productCosts,
      });
      return jsonResponse(data, status >= 200 && status < 300 ? 200 : 502, cors);
    }

    if (action === BATCH_ACTIONS.get) {
      const input = pickAllowed(body, ALLOWED_FORWARD_FIELDS[BATCH_ACTIONS.get]);
      const v = validateGet(input);
      if (!v.ok) return errorResponse(v.code, v.message, 400, cors);
      const { status, data } = await forwardGetToGas(gasUrl, {
        action,
        mode: "admin",
        admin_key: adminSecret,
        batch_id: asString(v.payload.batch_id),
      });
      return jsonResponse(data, status >= 200 && status < 300 ? 200 : 502, cors);
    }

    if (action === BATCH_ACTIONS.saveSelectedImages) {
      const input = pickAllowed(
        body,
        ALLOWED_FORWARD_FIELDS[BATCH_ACTIONS.saveSelectedImages]
      );
      const v = validateSaveSelectedImages(input);
      if (!v.ok) return errorResponse(v.code, v.message, 400, cors);
      const { status, data } = await forwardPostToGas(gasUrl, {
        action,
        mode: "admin",
        admin_key: adminSecret,
        product_id: v.payload.product_id,
        selected_image_ids: v.payload.selected_image_ids,
      });
      return jsonResponse(data, status >= 200 && status < 300 ? 200 : 502, cors);
    }

    const input = pickAllowed(body, ALLOWED_FORWARD_FIELDS[BATCH_ACTIONS.retry]);
    const v = validateRetry(input);
    if (!v.ok) return errorResponse(v.code, v.message, 400, cors);
    const { status, data } = await forwardPostToGas(gasUrl, {
      action,
      mode: "admin",
      admin_key: adminSecret,
      ...v.payload,
    });
    return jsonResponse(data, status >= 200 && status < 300 ? 200 : 502, cors);
  } catch (e) {
    return errorResponse(
      "RELAY_FORWARD_FAILED",
      e instanceof Error ? e.message : "GASへの転送に失敗しました。",
      502,
      cors
    );
  }
});
