// gas-ai-batch-relay
// 一括AI出品ドラフト生成（バッチ）専用の中継（Readdy Backend Edge Function）。
//
// 役割（AI_BATCH_API_CONTRACT.md 5章）:
//   Readdy(ブラウザ) --POST/GET--> この中継 --(mode:admin + admin_key をサーバー側で付与)--> GAS /exec
//
// ・ブラウザには GAS URL も ADMIN_API_KEY も出さない。
// ・クライアントから mode / admin_key が送られても破棄し、サーバー側の値で必ず上書きする。
// ・対象はバッチ3actionのみ。単品系（gas-ai-relay）は一切変更しない。
// ・バッチAPIに単品用 product_id は要求しない（create は product_ids 配列を受け取る）。
//
// 認証: ゲートウェイの JWT 検証（verify_jwt=true）に委ねる。
// 環境変数（既存 gas-ai-relay と同じプロジェクトSecretsを流用）:
//   GAS_WEBHOOK_URL                : GAS Web App の /exec URL
//   GAS_ADMIN_SECRET               : GAS 管理者キー（サーバー側でのみ付与）
//   ALLOWED_ORIGINS                : 許可オリジン（カンマ区切り、任意）

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const MAX_BATCH_SIZE = 20;

const BATCH_ACTIONS = {
  create: "create_ai_product_draft_batch",
  get: "get_ai_product_draft_batch",
  retry: "retry_ai_product_draft_batch",
} as const;

const KNOWN_ACTIONS: string[] = [
  BATCH_ACTIONS.create,
  BATCH_ACTIONS.get,
  BATCH_ACTIONS.retry,
];

const ALLOWED_FORWARD_FIELDS: Record<string, readonly string[]> = {
  // model_name は意図的に転送しない。旧モデル（gemini-3.5-flash-lite 等）を
  // クライアントから上書き送信されると、GAS 側で指定される検索付き生成モデルを
  // 打ち消してしまうため、モデルの選択は常にサーバー（GAS）既定に委ねる。
  [BATCH_ACTIONS.create]: [
    "request_id",
    "product_ids",
    "force_regenerate",
  ],
  [BATCH_ACTIONS.get]: ["batch_id"],
  [BATCH_ACTIONS.retry]: ["batch_id", "request_id"],
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

// ---------- validation ----------

type ValidationResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; code: string; message: string };

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
  const payload: Record<string, unknown> = {
    request_id: requestId,
    product_ids: productIds,
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
      const { status, data } = await forwardPostToGas(gasUrl, {
        action,
        mode: "admin",
        admin_key: adminSecret,
        ...v.payload,
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
