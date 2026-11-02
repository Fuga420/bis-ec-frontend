import { getSupabaseClient } from "@/lib/supabaseClient";

/**
 * 仕入台帳の商品番号（auction_item_number）による自動照合。
 *
 * 呼び出し先は既存の documents-relay。
 *   { action: "auto_link_product_by_item_number", product_id, auction_item_number }
 * product_id は自動発行の TMP-... 商品IDで、auction_item_number とは別項目。
 * 番号は文字列のまま送る（先頭ゼロ・ハイフンを保持する）。
 *
 * ⚠ バックエンド未配信の間はこの action が UNSUPPORTED_ACTION を返すため、
 * AUTO_LINK_BY_ITEM_NUMBER_ENABLED が false のときはリクエスト自体を送らない。
 * 配信後に実URLで疎通を確認できたら true に切り替える。
 */
export const AUTO_LINK_BY_ITEM_NUMBER_ENABLED = false;

export const AUTO_LINK_ACTION = "auto_link_product_by_item_number";

const RELAY_FUNCTION = "documents-relay";

/**
 * auto_link_product_by_item_number の結果種別。
 * - linked / already_linked_same_product : 紐付け済み（仕入原価と仕入・書類を再取得する）
 * - no_match / multiple_candidates / conflict_existing_link : 自動では紐付けない（手動照合へ）
 * - unsupported : バックエンド未配信（この action が使えない）
 * - error : 通信・中継の失敗（照合だけが未完了。商品登録・編集の成否とは別）
 * - disabled : フラグOFF、または入力・商品IDが無くて呼び出していない
 */
export type AutoLinkStatus =
  | "linked"
  | "already_linked_same_product"
  | "no_match"
  | "multiple_candidates"
  | "conflict_existing_link"
  | "unsupported"
  | "error"
  | "disabled";

export interface AutoLinkResult {
  status: AutoLinkStatus;
  // 画面に出す説明（サーバーの説明があればそれを優先する）
  message: string;
  // 紐付けが成立した（＝仕入原価・仕入書類を再取得する）
  linked: boolean;
  // 既存の「明細を探して紐付け」へ進むべきか
  needsManualLink: boolean;
}

export class AutoLinkApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AutoLinkApiError";
    this.code = code;
  }
}

const DISABLED_RESULT: AutoLinkResult = {
  status: "disabled",
  message: "",
  linked: false,
  needsManualLink: false,
};

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

// 応答から結果種別を取り出す（契約の最終キー名が未確定のため複数候補を安全に読む）。
function readStatusOf(payload: Record<string, unknown>): AutoLinkStatus | null {
  const raw = asString(
    payload.result ??
      payload.status ??
      payload.auto_link_result ??
      payload.link_status ??
      payload.outcome
  )
    .trim()
    .toLowerCase();

  if (raw === "linked") return "linked";
  if (raw === "already_linked_same_product") return "already_linked_same_product";
  if (raw === "no_match") return "no_match";
  if (raw === "multiple_candidates") return "multiple_candidates";
  if (raw === "conflict_existing_link") return "conflict_existing_link";

  // result ではなく真偽値で返る形にも対応する（linked:true のみ紐付け成立とみなす）。
  if (payload.linked === true) return "linked";
  return null;
}

function defaultMessageOf(status: AutoLinkStatus): string {
  switch (status) {
    case "linked":
      return "仕入明細を自動照合して紐付けました。";
    case "already_linked_same_product":
      return "この仕入明細は、この商品に紐付け済みです（自動照合で確認）。";
    case "no_match":
      return "仕入明細は自動照合できませんでした（一致する明細が見つかりませんでした）。";
    case "multiple_candidates":
      return "仕入明細は自動照合できませんでした（候補が複数あるため、自動では選びません）。";
    case "conflict_existing_link":
      return "仕入明細は自動照合できませんでした（対象の明細は既に別の商品に紐付いています）。";
    case "unsupported":
      return "自動照合は現在利用できません（バックエンド未対応）。商品の登録・保存自体は完了しています。";
    case "error":
      return "自動照合だけが未完了です（通信エラー）。商品の登録・保存自体は完了しています。";
    default:
      return "";
  }
}

// documents-relay を呼ぶ。失敗時は error_code を保持した例外に変換する。
async function invokeRelay(
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const client = getSupabaseClient();
  if (!client) {
    throw new AutoLinkApiError(
      "BACKEND_NOT_CONNECTED",
      "バックエンドに接続されていません。"
    );
  }

  const { data, error } = await client.functions.invoke(RELAY_FUNCTION, { body });

  if (error) {
    let code = "RELAY_INVOKE_FAILED";
    let message = error.message || "自動照合の呼び出しに失敗しました。";
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      try {
        const payload = (await context.json()) as Record<string, unknown>;
        code = asString(payload.error_code) || code;
        message =
          asString(payload.message) || asString(payload.error) || message;
      } catch {
        // 応答本文が読めない場合は既定メッセージを使う。
      }
    }
    throw new AutoLinkApiError(code, message);
  }

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.success === false) {
    throw new AutoLinkApiError(
      asString(result.error_code) || "RELAY_ERROR",
      asString(result.message) ||
        asString(result.error) ||
        "自動照合に失敗しました。"
    );
  }
  return result;
}

/**
 * 商品IDと仕入台帳の商品番号で自動照合を試みる。
 *
 * 通信エラーや未配信（UNSUPPORTED_ACTION）でも例外を投げず、
 * 「照合だけが未完了」であることを結果として返す（呼び出し側の登録・保存の成否と混同しない）。
 */
export async function autoLinkProductByItemNumber(params: {
  productId: string;
  auctionItemNumber: string;
}): Promise<AutoLinkResult> {
  const productId = (params.productId ?? "").trim();
  // 前後の空白のみ除去し、先頭ゼロ・ハイフンなどの値はそのまま送る。
  const auctionItemNumber = (params.auctionItemNumber ?? "").trim();

  if (!AUTO_LINK_BY_ITEM_NUMBER_ENABLED) return DISABLED_RESULT;
  if (productId === "" || auctionItemNumber === "") return DISABLED_RESULT;

  let payload: Record<string, unknown>;
  try {
    payload = await invokeRelay({
      action: AUTO_LINK_ACTION,
      product_id: productId,
      auction_item_number: auctionItemNumber,
    });
  } catch (e: unknown) {
    const code = e instanceof AutoLinkApiError ? e.code : "";
    if (code === "UNSUPPORTED_ACTION") {
      return {
        status: "unsupported",
        message: defaultMessageOf("unsupported"),
        linked: false,
        needsManualLink: true,
      };
    }
    return {
      status: "error",
      message: defaultMessageOf("error"),
      linked: false,
      needsManualLink: true,
    };
  }

  const status = readStatusOf(payload);
  if (!status) {
    // 判定できない応答は「未完了」として扱い、成功とも失敗とも断定しない。
    return {
      status: "error",
      message: defaultMessageOf("error"),
      linked: false,
      needsManualLink: true,
    };
  }

  const linked = status === "linked" || status === "already_linked_same_product";
  const needsManualLink =
    status === "no_match" ||
    status === "multiple_candidates" ||
    status === "conflict_existing_link";

  return {
    status,
    message:
      asString(payload.message) || asString(payload.reason) || defaultMessageOf(status),
    linked,
    needsManualLink,
  };
}