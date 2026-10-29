import {
  AI_BATCH_RELAY_FUNCTION_NAME,
  AiRelayError,
  extractRelayError,
  invokeAiRelay,
} from "@/pages/register/lib/aiProduct";
import type {
  AiBatchCreateResponse,
  AiBatchDisplayItem,
  AiBatchDisplayStatus,
  AiBatchItem,
  AiBatchItemStatus,
  AiBatchOverallStatus,
  AiBatchProgressResponse,
  AiBatchRetryResponse,
} from "@/pages/products/types";

// 中継（gas-ai-batch-relay）が扱うaction名。GAS/契約と一致させる。
export const AI_BATCH_ACTIONS = {
  create: "create_ai_product_draft_batch",
  get: "get_ai_product_draft_batch",
  retry: "retry_ai_product_draft_batch",
  // AI解析に使う画像（Drive file_id）の保存・指定解除（空配列）。
  saveSelectedImages: "save_product_ai_selected_images",
} as const;

// 概算原価への最低上乗せ率の既定値（30% = 下限価格は原価 × 1.30）。
// GAS v103 契約: 0 < min_cost_markup_rate <= 5.0
export const DEFAULT_MIN_COST_MARKUP_RATE = 0.3;
export const MIN_COST_MARKUP_RATE_EXCLUSIVE_MIN = 0;
export const MIN_COST_MARKUP_RATE_MAX = 5.0;

// 価格根拠の種別（GAS v103）。原価上乗せ下限を採用した場合の price_basis。
export const PRICE_BASIS_COST_MARKUP_FLOOR = "cost_markup_floor";

/** price_basis が「原価上乗せ下限」かどうか。 */
export function isCostMarkupFloorBasis(basis?: string | null): boolean {
  return (basis ?? "").trim() === PRICE_BASIS_COST_MARKUP_FLOOR;
}

// AI解析に使う画像の最大枚数（サーバー・GASと一致）
export const MAX_AI_ANALYSIS_IMAGES = 3;

// 契約 2.1: 1リクエストあたり最大20件
export const MAX_AI_BATCH_SIZE = 20;

// 進捗取得の間隔（約5秒）
export const AI_BATCH_POLL_INTERVAL_MS = 5000;

// バッチ全体ステータスの表示ラベル
export const AI_BATCH_STATUS_LABELS: Record<AiBatchOverallStatus, string> = {
  queued: "受付済み",
  processing: "処理中",
  completed: "全件反映完了",
  partially_failed: "一部失敗",
  failed: "失敗",
};

const TERMINAL_BATCH_STATUSES: AiBatchOverallStatus[] = [
  "completed",
  "partially_failed",
  "failed",
];

// 完了後は定期取得を停止する判定
export function isTerminalBatchStatus(
  status: AiBatchOverallStatus | null | undefined
): boolean {
  return status != null && TERMINAL_BATCH_STATUSES.includes(status);
}

const ITEM_STATUSES: AiBatchItemStatus[] = [
  "pending",
  "processing",
  "completed",
  "failed",
];

// 契約外の値が来ても「成功」と誤認しない。想定外は pending として保持する。
export function normalizeBatchItemStatus(value: unknown): AiBatchItemStatus {
  const s = typeof value === "string" ? value : "";
  return (ITEM_STATUSES as string[]).includes(s)
    ? (s as AiBatchItemStatus)
    : "pending";
}

// 商品別の表示ステータスを導出する。
// 「再試行待ち」は契約に無いキーを使わず、pending かつ retry_count>0 から導く。
export function deriveAiBatchDisplayStatus(item: {
  status: AiBatchItemStatus;
  retry_count: number;
  error_code?: string | null;
}): AiBatchDisplayStatus {
  // GAS 契約外応答: status:"completed" と error_code が同時に返るケース。
  // 検索未実行・参照元なし・MAX_TOKENS・429 などは、契約上 completed で返っても
  // 「下書き反映完了（成功）」として表示しない。
  // ただし GAS 側の status は completed のため、GAS の retry 対象に含まれない
  // 可能性がある。GAS も failed の「失敗」とは区別し、「要確認（契約外）」として扱う。
  if (item.status === "completed" && item.error_code) {
    return "contract_violation";
  }
  if (item.status === "pending" && item.retry_count > 0) return "retry_wait";
  if (item.status === "pending") return "pending";
  if (item.status === "processing") return "processing";
  if (item.status === "completed") return "success";
  return "failed";
}

/**
 * status:"completed" と error_code が同時に返る「GAS 契約外応答」かどうか。
 * 契約 3.2 では completed は成功（error_code なし）を意味するため、この組み合わせは契約外。
 */
export function isGasContractViolation(item: {
  status: AiBatchItemStatus;
  error_code?: string | null;
}): boolean {
  return item.status === "completed" && Boolean(item.error_code);
}

/**
 * 契約外応答（status:"completed" かつ error_code）を記録する（同一商品は一度だけ）。
 *
 * 画面上は成功表示を防ぐが、GAS 側の status は completed のため、
 * GAS の retry 対象に含まれるとは限らない。後から追跡できるよう、
 * 商品ID・error_code・error_message を残す。バックエンドへは送らない（フロント内の記録）。
 */
export function recordGasContractViolations(
  items: AiBatchDisplayItem[],
  seen: Set<string>
): void {
  items.forEach((item) => {
    if (!isGasContractViolation(item)) return;
    if (seen.has(item.product_id)) return;
    seen.add(item.product_id);
    try {
      console.warn("[AI_BATCH_CONTRACT_VIOLATION]", {
        product_id: item.product_id,
        item_status: item.status,
        error_code: item.error_code,
        error_message: item.error_message,
        note:
          "status:completed と error_code が同時に返る契約外応答。成功表示は行わないが、GAS側は completed のため retry 対象に含まれない可能性がある。",
      });
    } catch {
      // 記録に失敗しても処理は継続する
    }
  });
}

/**
 * 商品別エラーの分かりやすい説明を返す（error_code は呼び出し側で必ず併記する）。
 * 検索付き生成で報告された失敗カテゴリ（検索未実行・参照元なし・MAX_TOKENS・429 等）を
 * 日本語で説明する。分類できないコードは API の message をそのまま使う。
 */
export function explainAiBatchError(
  code?: string | null,
  message?: string | null
): string {
  const upper = (code ?? "").trim().toUpperCase();
  if (upper) {
    if (upper.includes("MAX_TOKENS") || upper.includes("MAX_OUTPUT")) {
      return "生成内容が長すぎて上限（MAX_TOKENS）に達し、出力が完了しませんでした。時間をおいて「失敗のみ再実行」してください。";
    }
    if (
      upper.includes("429") ||
      upper.includes("RATE") ||
      upper.includes("RESOURCE_EXHAUSTED") ||
      upper.includes("QUOTA")
    ) {
      return "APIの利用制限（429 / レート制限）に達しました。時間をおいて「失敗のみ再実行」してください。";
    }
    if (upper.includes("EMPTY_RESPONSE")) {
      return "生成モデルから本文が空の応答が返りました（Stage A の応答が空）。画像・商品情報を確認し、時間をおいて「失敗のみ再実行」してください。";
    }
    if (
      upper.includes("SOURCE") ||
      upper.includes("REFERENCE") ||
      upper.includes("NO_GROUNDING")
    ) {
      return "検索は行われましたが、参考にできる参照元（出典）が見つかりませんでした。画像・商品情報を確認して再実行してください。";
    }
    if (upper.includes("SEARCH") || upper.includes("GROUNDING")) {
      return "画像からの生成に必要な検索（グラウンディング）が実行できませんでした。もう一度「失敗のみ再実行」してください。";
    }
  }
  if (message) return message;
  return "生成に失敗しました。時間をおいて「失敗のみ再実行」してください。";
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

// 受付前に発行する冪等キー。通信失敗による同じ受付の再送で再利用する。
export function createRequestId(prefix = "REQ_BATCH"): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    // フォールバックへ
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 一括生成の受付。batch_id を即時返却する（非同期受付）。
 * 応答の success / batch_id を確認できない場合は成功扱いにしない。
 */
export async function createAiProductDraftBatch(params: {
  requestId: string;
  productIds: string[];
  forceRegenerate?: boolean;
  // 概算原価への最低上乗せ率（0より大きく5.0以下の小数）。未指定は 0.30（30%）。
  minCostMarkupRate?: number;
}): Promise<AiBatchCreateResponse> {
  const body: Record<string, unknown> = {
    action: AI_BATCH_ACTIONS.create,
    request_id: params.requestId,
    product_ids: params.productIds,
    min_cost_markup_rate:
      params.minCostMarkupRate ?? DEFAULT_MIN_COST_MARKUP_RATE,
  };
  if (params.forceRegenerate !== undefined) {
    body.force_regenerate = params.forceRegenerate;
  }
  // product_costs は送らない。原価は中継サーバーが確定済み照合から取得して GAS へ渡す
  // （ブラウザ送信値を原価の正本として採用しない）。
  // model_name は送らない。旧モデル（gemini-3.5-flash-lite 等）を明示送信すると、
  // サーバー側で指定される検索付き生成モデルを上書きしてしまうため、
  // モデルの選択は常にサーバー既定（GAS側）に委ねる。

  const data = await invokeAiRelay<AiBatchCreateResponse>(
    body,
    AI_BATCH_RELAY_FUNCTION_NAME
  );
  if (!data || data.success !== true || !asString(data.batch_id)) {
    const info = extractRelayError(data, "一括AI生成の受付に失敗しました。");
    throw new AiRelayError(info.message, info.code);
  }
  return data;
}

/**
 * バッチの進捗・結果取得。API取得失敗は成功として扱わず例外を投げる。
 */
export async function getAiProductDraftBatch(
  batchId: string
): Promise<AiBatchProgressResponse> {
  const data = await invokeAiRelay<AiBatchProgressResponse>(
    {
      action: AI_BATCH_ACTIONS.get,
      batch_id: batchId,
    },
    AI_BATCH_RELAY_FUNCTION_NAME
  );
  if (!data || data.success !== true) {
    const info = extractRelayError(
      data,
      "一括AI生成の進捗を取得できませんでした。"
    );
    throw new AiRelayError(info.message, info.code);
  }
  return data;
}

/**
 * 失敗分のみ再実行。成功（completed）済み商品は再生成されない。
 * 契約 2.3: request_id は冪等性キー。同一 request_id の再送は再試行を重複登録せず
 * 初回応答（is_reused:true）を返す。応答を受け取れなかった再送では同じ request_id を使う。
 * 失敗商品が無い場合は success:false / NO_FAILED_ITEMS を返す（成功ではない）。
 */
export async function retryAiProductDraftBatch(params: {
  batchId: string;
  requestId: string;
}): Promise<AiBatchRetryResponse> {
  const data = await invokeAiRelay<AiBatchRetryResponse>(
    {
      action: AI_BATCH_ACTIONS.retry,
      batch_id: params.batchId,
      request_id: params.requestId,
    },
    AI_BATCH_RELAY_FUNCTION_NAME
  );
  if (!data) {
    // 応答本体を解析できていない（空応答等）＝受付済みか判断できない。
    // AiRelayError にせず素の Error で伝え、呼び出し側が request_id を保持できるようにする。
    throw new Error(
      "失敗分の再実行の応答を取得できませんでした。時間をおいて再度お試しください。"
    );
  }
  if (data.success !== true) {
    // success:false の代表は NO_FAILED_ITEMS（失敗商品なし）。
    // error_code をそのまま保持して AiRelayError で伝え、呼び出し側が
    // 「受付されなかったことが確定できるコード」かどうかを判定できるようにする。
    const info = extractRelayError(data, "失敗分の再実行に失敗しました。");
    throw new AiRelayError(info.message, info.code);
  }
  return data;
}

/**
 * 「受付されなかったことが確定できる」GAS応答の error_code。
 * 契約 2.1〜2.3 に定義された、受付前に弾かれる検証エラーと、再試行対象が無いエラーだけを列挙する。
 * これらは retry が登録されていないことが確定しているため、request_id を破棄してよい。
 *
 * 一覧に無いコード（未知コード・判定不能なエラー）は「受付済みか判断できない」ため保持する。
 */
const DEFINITIVE_REJECTION_CODES: ReadonlySet<string> = new Set([
  // retry 固有：失敗商品なし／対象バッチなし（＝再試行は登録されていない）
  "NO_FAILED_ITEMS",
  "BATCH_NOT_FOUND",
  // 受付前の入力・認証バリデーション（＝処理に到達していない）
  "BATCH_ID_REQUIRED",
  "REQUEST_ID_REQUIRED",
  "UNAUTHORIZED_ADMIN_ACCESS",
]);

/**
 * 失敗分再実行（retry）の送信後エラーを分類する（契約 2.3 の冪等性キー運用）。
 *
 * request_id を破棄してよいのは「受付されなかったことが確定した応答」だけ:
 *   - 成功応答（呼び出し側で成功として別途処理する）
 *   - 受付されなかったことが確定できる GAS エラーコード（NO_FAILED_ITEMS /
 *     BATCH_NOT_FOUND など、DEFINITIVE_REJECTION_CODES に列挙したもの）
 *
 * これら以外はすべて「GASが受付済みか判断できない」ため request_id を保持して再送する:
 *   - 中継のタイムアウト / 転送失敗 / HTTP 5xx（＝素の Error。JSON応答を解析できていない）
 *   - 応答解析失敗（中継がGAS本体を解析できず GAS_INVALID_RESPONSE を返した場合）
 *   - 上記の確定コードに該当しない、未知・判定不能なエラーコード
 */
export type RetryFailureClass = "definitive_rejection" | "unknown";

export function classifyRetryFailure(err: unknown): RetryFailureClass {
  // 素の Error は「JSON応答を解析できていない」状態（タイムアウト・転送失敗・5xx等）→ 保持。
  if (!(err instanceof AiRelayError)) return "unknown";
  // 受付されなかったことが確定できるコードだけを破棄対象にする（allowlist）。
  // それ以外（GAS_INVALID_RESPONSE・未知コードなど）は受付済みの可能性を排除できないため保持。
  const code = err.code ?? "";
  return DEFINITIVE_REJECTION_CODES.has(code)
    ? "definitive_rejection"
    : "unknown";
}

/**
 * AI解析に使う画像（Drive の file_id）を保存する。
 * 空配列 [] は指定解除。成功（success:true）を確認できない場合は例外にする
 * （保存されたように扱って生成を進めないため）。
 */
export async function saveProductAiSelectedImages(params: {
  productId: string;
  selectedImageIds: string[];
}): Promise<void> {
  if (params.selectedImageIds.length > MAX_AI_ANALYSIS_IMAGES) {
    throw new AiRelayError(
      `AI解析に使う画像は最大${MAX_AI_ANALYSIS_IMAGES}枚です。`,
      "TOO_MANY_SELECTED_IMAGES"
    );
  }
  const data = await invokeAiRelay<Record<string, unknown>>(
    {
      action: AI_BATCH_ACTIONS.saveSelectedImages,
      product_id: params.productId,
      selected_image_ids: params.selectedImageIds,
    },
    AI_BATCH_RELAY_FUNCTION_NAME
  );
  if (!data || data.success !== true) {
    const info = extractRelayError(
      data as { error?: string; message?: string; error_code?: string } | null,
      "AI解析用画像の保存に失敗しました。"
    );
    throw new AiRelayError(info.message, info.code);
  }
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 契約の items[] を画面表示用アイテムへ変換する。
 * product_name は受付時に保持した名前マップから復元する（APIは名前を返さないため）。
 */
export function toAiBatchDisplayItems(
  apiItems: AiBatchItem[] | undefined,
  previous: AiBatchDisplayItem[] | null,
  nameMap: Record<string, string>
): AiBatchDisplayItem[] {
  const prevMap = new Map(
    (previous ?? []).map((item) => [item.product_id, item])
  );
  return (apiItems ?? []).map((api) => {
    const productId = asString(api.product_id);
    const prev = prevMap.get(productId);
    return {
      product_id: productId,
      product_name:
        nameMap[productId] ?? prev?.product_name ?? productId,
      status: normalizeBatchItemStatus(api.status),
      retry_count:
        typeof api.retry_count === "number" ? api.retry_count : 0,
      error_code: api.error_code ? asString(api.error_code) : null,
      error_message: api.error_message ? asString(api.error_message) : null,
      // 完了時に返る draft 識別子を保持する（表示・遷移の補助。表示名の生成には使わない）。
      draft_id: api.draft_id ? asString(api.draft_id) : null,
      draft_version:
        typeof api.draft_version === "number" ? api.draft_version : null,
      // GAS v102以降: 提案価格と価格根拠（price_note）。未返却なら null のまま保持する。
      proposed_price: asNumberOrNull(api.proposed_price),
      price_note: api.price_note ? asString(api.price_note) : null,
      // GAS v103: 価格根拠の種別（"cost_markup_floor" = 原価上乗せ下限を採用）
      price_basis: api.price_basis ? asString(api.price_basis) : null,
    };
  });
}