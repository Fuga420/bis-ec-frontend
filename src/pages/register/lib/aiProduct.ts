import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { categories, conditions } from "@/mocks/productForm";

// 認証付き中継（Readdy Backend Edge Function）の関数名。
// ブラウザには共有秘密キーを置かず、中継がサーバー側で GAS 管理者認証を付与する。
// 単品生成・確定・取得は既存の gas-ai-relay をそのまま維持する。
export const AI_RELAY_FUNCTION_NAME = "gas-ai-relay";

// 一括AI生成（バッチ受付・進捗取得・失敗分再実行）専用の中継関数名。
// 一括のみ gas-ai-batch-relay を使い、単品系は gas-ai-relay のまま維持する。
export const AI_BATCH_RELAY_FUNCTION_NAME = "gas-ai-batch-relay";

// GAS側の action 名。Antigravity実装の action 名とここを一致させる。
export const AI_ACTIONS = {
  generateDraft: "generate_ai_product_draft",
  confirmDraft: "confirm_ai_product_draft",
  getDraft: "get_ai_product_draft",
} as const;

// 登録画像は最大20枚。AI解析には画面の並び順で先頭最大3枚を使用する。
export const MAX_PRODUCT_IMAGES = 20;
export const AI_ANALYSIS_IMAGE_COUNT = 3;

// 管理者の共有秘密キーはフロントへ埋め込まない。
// 認証付きサーバー経由の接続方針が確定するまで、認証ヘッダーは一切送らない。

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

// UI内部表現：ハッシュタグは配列で保持する。
// API境界（送受信）では hashtags_ja（文字列）へ明示的に変換する。
export interface AiProductCandidate {
  title_ja: string;
  title_en: string;
  description_ja: string;
  description_en: string;
  hashtags: string[];
  condition: string;
  category: string;
  brand: string;
  sku: string;
  size: string;
  // 価格サジェスト（AI概算）。正の整数のみ採用し、不正値・欠損は null のまま保持する（0で補わない）。
  price: number | null;
}

// AI生成結果（candidate と draft識別子をまとめて保持する）
export interface AiProductGeneration {
  candidate: AiProductCandidate;
  productId: string;
  draftId: string;
  // draft_version は数値で返る想定。返却値をそのまま（文字列化せず）保持する。
  draftVersion: string | number;
}

interface TempDraftResponse {
  success: boolean;
  product_id?: string;
  error?: string;
}

interface AiGenerateResponse {
  success: boolean;
  product_id?: string;
  draft_id?: string;
  draft_version?: string | number;
  candidate?: Record<string, unknown> | null;
  review_status?: string;
  confirmed_fingerprint?: string;
  error?: string;
  // 中継・GASが返す安全なエラー情報（汎用メッセージで隠さず表示する）
  error_code?: string;
  message?: string;
}

export interface ConfirmAiProductDraftParams {
  productId: string;
  draftId: string;
  draftVersion: string | number;
  confirmationAttemptId: string;
  confirmedData: Record<string, unknown>;
}

export interface ConfirmAiProductDraftResponse {
  success: boolean;
  product_id?: string;
  draft_id?: string;
  draft_version?: string | number;
  review_status?: string;
  confirmed_fingerprint?: string;
  error?: string;
  // 中継・GASが返す安全なエラー情報（汎用メッセージで隠さず表示する）
  error_code?: string;
  message?: string;
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 価格サジェスト（AI概算）を正規化する。
 * 「正の安全な整数」のみ採用し、それ以外（null / 0 / 負数 / 小数 / 非数値）は null を返す。
 * 0 や架空の値で補わない。
 */
export function normalizeAiPrice(value: unknown): number | null {
  let n: number;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string" && value.trim() !== "") {
    n = Number(value.trim());
  } else {
    return null;
  }
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null;
  if (n <= 0) return null;
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

// 受信した hashtags_ja（文字列）をUI用の配列へ変換する（境界変換）
function hashtagsFromApi(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => asString(v)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

// UI用の配列をAPI用の hashtags_ja（スペース区切り文字列）へ変換する（境界変換）
export function hashtagsToApi(hashtags: string[]): string {
  return hashtags
    .map((h) => h.trim())
    .filter(Boolean)
    .join(" ");
}

// 状態は必ず日本語6種類のラベルで保存する。
// 「S」などのランクや内部IDが来ても6種類へ解決してから送信する（ランクをそのまま送らない）。
const RANK_TO_CONDITION_ID: Record<string, string> = {
  S: "new",
  N: "new",
  SA: "like_new",
  A: "excellent",
  B: "good",
  C: "fair",
  D: "poor",
  E: "poor",
};

export function resolveConditionLabel(value: string): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const byId = conditions.find((c) => c.id === raw);
  if (byId) return byId.label;
  const byLabel = conditions.find((c) => c.label === raw);
  if (byLabel) return byLabel.label;
  const mappedId = RANK_TO_CONDITION_ID[raw.toUpperCase()];
  if (mappedId) {
    return conditions.find((c) => c.id === mappedId)?.label ?? "";
  }
  return "";
}

// 表示・選択用に、状態の値を6種類のいずれかのIDへ解決する（解決不可なら空）。
export function resolveConditionId(value: string): string {
  const label = resolveConditionLabel(value);
  if (!label) return "";
  return conditions.find((c) => c.label === label)?.id ?? "";
}

// カテゴリの英語ラベル・別名を内部IDへ解決する。
// AI生成は "Sneakers" のような表示ラベルを返すことがあり、そのまま送ると
// GAS側で INVALID_CATEGORY_VALUE になるため、送信前に必ずIDへ正規化する。
const CATEGORY_ALIASES: Record<string, string> = {
  sneaker: "sneaker",
  sneakers: "sneaker",
  shoe: "sneaker",
  shoes: "sneaker",
  "スニーカー": "sneaker",
  pokemon_card: "pokemon_card",
  "pokemon card": "pokemon_card",
  pokemoncard: "pokemon_card",
  pokemon: "pokemon_card",
  "ポケモンカード": "pokemon_card",
  jewelry: "jewelry",
  jewellery: "jewelry",
  "ジュエリー": "jewelry",
  apparel: "apparel",
  clothing: "apparel",
  clothes: "apparel",
  "アパレル": "apparel",
  fashion_goods: "fashion_goods",
  "fashion goods": "fashion_goods",
  fashiongoods: "fashion_goods",
  accessories: "fashion_goods",
  "ファッション小物": "fashion_goods",
  other: "other",
  "その他": "other",
};

export function resolveCategoryId(value: string): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const byId = categories.find((c) => c.id === raw);
  if (byId) return byId.id;
  const byLabel = categories.find((c) => c.label === raw);
  if (byLabel) return byLabel.id;
  return CATEGORY_ALIASES[raw.toLowerCase()] ?? "";
}

/**
 * 中継・GASが返す安全なエラー情報を保持するエラー。
 * 汎用の「もう一度お試しください」で隠さず、error_code と message を表示に使う。
 */
export class AiRelayError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "AiRelayError";
    this.code = code;
  }
}

// 応答から安全な message / error_code を取り出す（秘密値は含まない）。
export function extractRelayError(
  data: { error?: string; message?: string; error_code?: string } | null,
  fallback: string
): { code: string; message: string } {
  const code = asString(data?.error_code);
  const message = asString(data?.message) || asString(data?.error);
  return { code, message: message || fallback };
}

// 表示用にエラーを整形する（error_code は併記して原因を隠さない）。
export function formatAiError(err: unknown, fallback = "処理に失敗しました。"): string {
  if (err instanceof AiRelayError) {
    return err.code ? `${err.message}（コード: ${err.code}）` : err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

// レスポンスのばらつきを吸収して候補を正規化する（欠損時は空文字/nullで保持）
// GAS契約：title_ja, title_en, description_ja, description_en, hashtags_ja,
//          condition, category, brand, sku, size, price
export function normalizeCandidate(
  raw: Record<string, unknown>
): AiProductCandidate {
  return {
    title_ja: asString(raw.title_ja ?? raw.title ?? raw.name),
    title_en: asString(raw.title_en ?? raw.titleEn),
    description_ja: asString(raw.description_ja ?? raw.description),
    description_en: asString(raw.description_en),
    hashtags: hashtagsFromApi(raw.hashtags_ja ?? raw.hashtags),
    condition: asString(raw.condition),
    category: asString(raw.category),
    brand: asString(raw.brand),
    sku: asString(raw.sku),
    size: asString(raw.size),
    // 価格サジェスト：正式な受信キーは candidate.price。正の整数以外は null のまま保持する。
    price: normalizeAiPrice(raw.price),
  };
}

/**
 * get_ai_product_draft で取得した draft から AI価格案（candidate.price）を取り出す。
 * draft は candidate 配下に候補を持つ場合と、トップレベルに展開されている場合の
 * どちらでも扱えるようにする。正の整数のみ採用し、それ以外は null を返す（0で補わない）。
 */
export function extractAiDraftPrice(
  draft: Record<string, unknown> | null | undefined
): number | null {
  if (!draft || typeof draft !== "object") return null;
  const nested = draft.candidate;
  const source =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : draft;
  return normalizeAiPrice(source.price);
}

// ポケモンカードの場合に confirmed_data へ含めるカード属性（既存フォームの項目）
export interface PokemonCardConfirmedData {
  card_name: string;
  set_name: string;
  card_number: string;
  rarity: string;
  language: string;
  grading_status: "graded" | "ungraded";
  grader: string;
  grade: string;
  certification_number: string;
  card_condition: string;
}

/**
 * 確定データ（confirmed_data）を組み立てる。
 * GAS（Antigravity実装）の実キー名に合わせる：
 *   product_name / planned_sale_price / condition / category / brand /
 *   description / hashtags_ja / sneaker_sku / sneaker_size /
 *   translated_title / translated_description
 * ポケモンカードの場合のみ pokemon_card（既存フォームのカード属性）を追加する。
 * 価格は呼び出し側で「正の安全な整数」を検証済みの値をそのまま使う（丸め・null化しない）。
 */
export function buildConfirmedData(
  candidate: AiProductCandidate,
  price: number,
  pokemonCard?: PokemonCardConfirmedData | null
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    product_name: candidate.title_ja,
    planned_sale_price: price,
    condition: resolveConditionLabel(candidate.condition),
    category: resolveCategoryId(candidate.category) || candidate.category,
    brand: candidate.brand,
    description: candidate.description_ja,
    hashtags_ja: hashtagsToApi(candidate.hashtags),
    sneaker_sku: candidate.sku,
    sneaker_size: candidate.size,
    translated_title: candidate.title_en,
    translated_description: candidate.description_en,
  };
  if (pokemonCard) data.pokemon_card = pokemonCard;
  return data;
}

/**
 * 価格入力を検証する。正の「安全な整数」のみ許可する。
 * 小数は丸めて採用せず、不正値は null にせず、確定前の入力エラーとして返す。
 */
export function validatePositiveSafeInteger(
  input: string
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "販売予定価格を入力してください。" };
  }
  if (!/^\d+$/.test(trimmed)) {
    return {
      ok: false,
      error: "販売予定価格は半角数字の整数で入力してください（小数は不可）。",
    };
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) {
    return {
      ok: false,
      error:
        "販売予定価格が大きすぎます。安全に扱える整数の範囲で入力してください。",
    };
  }
  if (value <= 0) {
    return {
      ok: false,
      error: "販売予定価格は1以上の整数で入力してください。",
    };
  }
  return { ok: true, value };
}

// confirmation_attempt_id を生成する（対応ブラウザは randomUUID）
export function createConfirmationAttemptId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // フォールバックへ
  }
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * 認証付き中継（Edge Function）を呼び出す。
 * ブラウザから共有秘密キーや接続先URLは送らない
 * （セッションJWTは supabase-js が Authorization に自動付与する）。
 */
export async function invokeAiRelay<T>(
  body: Record<string, unknown>,
  functionName: string = AI_RELAY_FUNCTION_NAME
): Promise<T> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      "バックエンド（Readdy Backend / SaaS Supabase）に接続されていません。管理者に接続を依頼してください。"
    );
  }
  const { data, error } = await client.functions.invoke(functionName, { body });
  if (error) {
    let message = error.message || "中継サーバーへの接続に失敗しました。";
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const parsed = (await ctx.json()) as {
          error?: string;
          message?: string;
          error_code?: string;
        };
        const info = extractRelayError(parsed, message);
        message = info.code
          ? `${info.message}（コード: ${info.code}）`
          : info.message;
      }
    } catch {
      // error.message をそのまま使う
    }
    throw new Error(message);
  }
  return data as T;
}

/**
 * 未保存商品のAI生成用に、画像保存 + 商品ID付き仮draftを作成する。
 * 既存の登録POST（actionなし）を最小payloadで流用する。
 * 商品名・カテゴリ・状態・価格などの必須項目は送らない（架空の値で埋めない）。
 * 認証ヘッダーは送らない。
 */
export async function createTempProductDraft(images: File[]): Promise<string> {
  const imagesPayload = await Promise.all(
    images.map(async (file) => ({
      file_name: file.name,
      mime_type: file.type,
      base64: await fileToBase64(file),
    }))
  );

  const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ publish_status: "draft", images: imagesPayload }),
  });

  const text = await response.text();
  const data = parseJson<TempDraftResponse>(text);
  if (!response.ok || !data || data.success !== true || !data.product_id) {
    throw new Error(
      data?.error ||
        `画像保存または仮draftの作成に失敗しました (HTTP ${response.status})`
    );
  }
  return data.product_id;
}

/**
 * 既存商品の画像を差し替える（update_product_images）。
 * 同じ product_id を再利用し、新規商品は作らない。
 * images の並び順がそのまま保存順序になる（全置換）。
 */
export async function updateProductImages(
  productId: string,
  images: File[]
): Promise<void> {
  const newImages = await Promise.all(
    images.map(async (file, index) => ({
      client_id: createClientId(index),
      file_name: file.name,
      mime_type: file.type,
      base64: await fileToBase64(file),
    }))
  );

  const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "update_product_images",
      product_id: productId,
      image_order: newImages.map((img) => ({
        source: "new",
        id: img.client_id,
      })),
      new_images: newImages,
    }),
  });

  const text = await response.text();
  const data = parseJson<TempDraftResponse>(text);
  if (!response.ok || !data || data.success !== true) {
    throw new Error(
      data?.error || `商品画像の更新に失敗しました (HTTP ${response.status})`
    );
  }
}

function createClientId(index: number): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `img-${index}-${crypto.randomUUID()}`;
    }
  } catch {
    // フォールバックへ
  }
  return `img-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 既存の generate_ai_product_draft API を呼び出す。
 * 送るのは product_id のみ（画像はGAS側がDriveから取得する）。
 * candidate と draft_id / draft_version を返す。認証ヘッダーは送らない。
 */
export async function generateAiProductDraft(
  productId: string
): Promise<AiProductGeneration> {
  // 認証付き中継経由（ブラウザからはキーを送らない）。送るのは product_id のみ。
  const data = await invokeAiRelay<AiGenerateResponse>({
    action: AI_ACTIONS.generateDraft,
    product_id: productId,
  });
  if (!data || data.success !== true) {
    const info = extractRelayError(data, "AI生成に失敗しました。時間をおいて再度お試しください。");
    throw new AiRelayError(info.message, info.code);
  }
  if (!data.candidate) {
    throw new Error("AI生成の候補データが空でした。再度お試しください。");
  }
  return {
    candidate: normalizeCandidate(data.candidate),
    // product_id / draft_id / draft_version は返却値をそのまま保持する
    productId: asString(data.product_id),
    draftId: asString(data.draft_id),
    draftVersion: data.draft_version ?? "",
  };
}

/**
 * AI候補の確認保存。既存 draft を確定する（新規商品は作らない）。
 * draft_id / draft_version / confirmation_attempt_id / confirmed_data を送る。
 * 認証ヘッダーは送らない。
 */
export async function confirmAiProductDraft(
  params: ConfirmAiProductDraftParams
): Promise<ConfirmAiProductDraftResponse> {
  // 認証付き中継経由。接続先URLと管理者キーはサーバー側（Secrets）のみで扱う。
  const data = await invokeAiRelay<ConfirmAiProductDraftResponse>({
    action: AI_ACTIONS.confirmDraft,
    product_id: params.productId,
    draft_id: params.draftId,
    draft_version: params.draftVersion,
    confirmation_attempt_id: params.confirmationAttemptId,
    confirmed_data: params.confirmedData,
  });
  // 確定成功は success:true かつ review_status:"confirmed" で判定する
  // （初回応答の confirmed_fingerprint は必須にしない）。
  if (!data || data.success !== true || data.review_status !== "confirmed") {
    const info = extractRelayError(
      data,
      "AI候補の確定保存に失敗しました。もう一度お試しください。"
    );
    throw new AiRelayError(info.message, info.code);
  }
  return data;
}

/**
 * get_ai_product_draft の取得結果（境界での形式統一後の形）。
 * GAS契約: { success:true, product_id, latest_ai_draft:{ draft_id, draft_version,
 *            review_status, confirmed_fingerprint, ... } }
 * - found: 実体の draft（latest_ai_draft の中身、または展開済みのトップレベル）
 * - none : 正常応答かつ latest_ai_draft:null（＝AI下書きの履歴なし）だけ
 * - error: API取得失敗、または応答形式の不一致（「履歴なし」とは扱わない）
 */
export type AiProductDraftLookup =
  | { status: "found"; draft: Record<string, unknown> }
  | { status: "none" }
  | { status: "error"; message: string };

/**
 * 仮draft（AI候補）の詳細を取得する（get_ai_product_draft）。
 * 中継対象の3actionの1つ。接続先と管理者キーはサーバー側（Secrets）のみで扱う。
 * 境界で latest_ai_draft を取り出して形式を統一し、呼び出し側が
 * draft_id / draft_version / review_status を正しく読めるようにする。
 */
export async function getAiProductDraft(
  productId: string,
  draftId?: string
): Promise<AiProductDraftLookup> {
  let data: Record<string, unknown> | null = null;
  try {
    data = await invokeAiRelay<Record<string, unknown>>({
      action: AI_ACTIONS.getDraft,
      product_id: productId,
      draft_id: draftId ?? "",
    });
  } catch (err) {
    // API取得失敗は「履歴なし」と扱わない（無言スキップしない）。
    return {
      status: "error",
      message:
        err instanceof Error && err.message
          ? err.message
          : "AI下書きの取得に失敗しました。",
    };
  }
  if (!data || data.success !== true) {
    // 応答形式の不一致・APIエラーは「履歴なし」と扱わない（無言スキップしない）。
    const msg =
      asString(data?.message) ||
      asString(data?.error) ||
      "AI下書きの取得に失敗しました。";
    const code = asString(data?.error_code);
    return {
      status: "error",
      message: code ? `${msg}（コード: ${code}）` : msg,
    };
  }

  // 境界での形式統一: GAS は実体を latest_ai_draft 配下に返す。
  // 既に展開済み（トップレベルに draft_id を持つ）場合は二重展開しない。
  const hasNestedKey = Object.prototype.hasOwnProperty.call(
    data,
    "latest_ai_draft"
  );
  const nested = data.latest_ai_draft;

  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { status: "found", draft: nested as Record<string, unknown> };
  }
  if (nested === null) {
    // 正常応答かつ latest_ai_draft:null のときだけ「履歴なし」と扱う。
    return { status: "none" };
  }
  if (!hasNestedKey && asString(data.draft_id)) {
    return { status: "found", draft: data };
  }
  // キー欠落・想定外の型は応答形式の不一致。
  return {
    status: "error",
    message:
      "AI下書きの取得応答の形式が想定と異なります（latest_ai_draft が不正）。",
  };
}