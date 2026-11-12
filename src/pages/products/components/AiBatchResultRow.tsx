import { memo, useState } from "react";
import { Link } from "react-router-dom";
import type {
  AiBatchDisplayItem,
  AiBatchDisplayStatus,
} from "@/pages/products/types";
import {
  deriveAiBatchDisplayStatus,
  explainAiBatchError,
  isCostMarkupFloorBasis,
} from "@/pages/products/lib/aiBatch";

/** 商品別ステータスの表示ラベル */
export const AI_BATCH_DISPLAY_STATUS_LABELS: Record<
  AiBatchDisplayStatus,
  string
> = {
  pending: "受付待ち",
  retry_wait: "再試行待ち",
  processing: "処理中",
  // 契約上 completed は「生成および下書き自動反映完了」を意味する
  success: "反映完了",
  failed: "失敗",
  excluded: "対象外",
  cancelled: "予約取消",
  // GAS 契約外応答（completed と error_code の同時返却）
  contract_violation: "要確認",
};

// 塗りのバッジは使わず、文字色だけで状態を区別する（強調は成功と失敗のみ）。
const DISPLAY_STATUS_TEXT_STYLES: Record<AiBatchDisplayStatus, string> = {
  pending: "text-foreground-400",
  retry_wait: "text-amber-700",
  processing: "text-foreground-600",
  success: "text-primary-700",
  failed: "text-amber-700",
  excluded: "text-foreground-500",
  cancelled: "text-foreground-400",
  contract_violation: "text-amber-700",
};

interface AiBatchResultRowProps {
  item: AiBatchDisplayItem;
}

/**
 * 結果リストの1行（コンパクトなリスト形式）。
 *
 * 初期表示は「商品名・商品ID・処理状態・エラー概要・商品詳細への導線」だけに絞り、
 * 生成結果の詳細（提案価格・価格根拠・エラーコードなど）は行ごとに展開して確認する。
 * APIから取得した値は削除せず、表示上の折りたたみだけで整理している。
 *
 * ポーリングのたびに items 配列が作り直されるため、行を memo 化して
 * 変化のない商品の再描画（点滅）を防ぐ。並び順は API の順序をそのまま使う。
 */
function AiBatchResultRow({ item }: AiBatchResultRowProps) {
  const [expanded, setExpanded] = useState(false);
  const display = deriveAiBatchDisplayStatus(item);
  const rawName = (item.product_name ?? "").trim();
  const isNameMissing = rawName === "";
  const displayName = isNameMissing ? "商品名未入力" : rawName;

  const errorSummary =
    item.error_code || item.error_message
      ? explainAiBatchError(item.error_code, item.error_message)
      : "";
  const hasPrice = item.proposed_price != null || Boolean(item.price_note);
  const hasDetail =
    hasPrice ||
    Boolean(item.error_code) ||
    Boolean(item.error_message) ||
    Boolean(item.draft_id) ||
    item.draft_version != null;

  return (
    <div className="border-b border-background-200/70 last:border-b-0">
      <div className="flex items-start gap-3 px-6 py-2.5 transition-colors hover:bg-background-50">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p
              className={`min-w-0 max-w-full truncate text-[13px] font-medium leading-snug ${
                isNameMissing ? "text-foreground-400" : "text-foreground-900"
              }`}
            >
              {displayName}
            </p>
            <span className="shrink-0 font-mono text-[11px] leading-none tabular-nums text-foreground-400">
              {item.product_id}
            </span>
          </div>

          {(display === "failed" ||
            display === "excluded" ||
            display === "contract_violation" ||
            display === "retry_wait") &&
            errorSummary && (
              <p
                className={`mt-1 line-clamp-2 break-words text-[11px] leading-relaxed ${
                  display === "excluded"
                    ? "text-foreground-600"
                    : "text-amber-800"
                }`}
              >
                {display === "excluded" ? "対象外理由: " : ""}
                {errorSummary}
              </p>
            )}

          {display === "contract_violation" && (
            <p className="mt-0.5 line-clamp-1 break-words text-[10px] leading-relaxed text-foreground-500">
              GAS側は completed のため「失敗のみ再実行」に含まれない場合があります。
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <span
            className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium leading-none ${
              DISPLAY_STATUS_TEXT_STYLES[display]
            }`}
          >
            {display === "processing" && (
              <i className="ri-loader-4-line flex h-3 w-3 animate-spin items-center justify-center text-[12px]"></i>
            )}
            {AI_BATCH_DISPLAY_STATUS_LABELS[display]}
          </span>

          {hasDetail && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? "詳細を閉じる" : "詳細を表示"}
              title={expanded ? "詳細を閉じる" : "詳細を表示"}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[14px] leading-none text-foreground-400 transition-colors hover:bg-background-100 hover:text-foreground-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-200"
            >
              <i
                className={`flex h-3.5 w-3.5 items-center justify-center text-[14px] transition-transform ${
                  expanded ? "rotate-180" : ""
                } ri-arrow-down-s-line`}
              ></i>
            </button>
          )}

          <Link
            to={`/products/${item.product_id}`}
            className="inline-flex cursor-pointer items-center gap-0.5 whitespace-nowrap text-[11px] leading-none text-foreground-500 transition-colors hover:text-primary-700 hover:underline"
          >
            商品を開く
            <i className="ri-arrow-right-s-line flex h-3 w-3 items-center justify-center text-[12px]"></i>
          </Link>
        </div>
      </div>

      {expanded && hasDetail && (
        <div className="space-y-1 px-6 pb-2.5">
          {hasPrice && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {item.proposed_price != null ? (
                <span className="admin-numeric text-[11px] font-semibold leading-none text-foreground-800">
                  提案価格 ¥{item.proposed_price.toLocaleString("ja-JP")}
                </span>
              ) : display === "success" ? (
                <span className="text-[11px] font-medium leading-none text-amber-700">
                  提案価格 未設定（要入力）
                </span>
              ) : null}
              {isCostMarkupFloorBasis(item.price_basis) && (
                <span className="inline-flex h-[16px] items-center whitespace-nowrap rounded border border-background-300 px-1 text-[10px] font-medium leading-none text-foreground-600">
                  最低粗利率下限
                </span>
              )}
              {item.price_note && (
                <span className="w-full break-words text-[10px] leading-relaxed text-foreground-500">
                  {item.price_note}
                </span>
              )}
            </div>
          )}

          {(item.error_code || item.error_message) && (
            <div className="space-y-0.5">
              <p className="break-words text-[11px] leading-relaxed text-foreground-700">
                {explainAiBatchError(item.error_code, item.error_message)}
              </p>
              {item.error_message &&
                item.error_message !==
                  explainAiBatchError(item.error_code, item.error_message) && (
                  <p className="break-words text-[10px] leading-relaxed text-foreground-500">
                    サーバー応答: {item.error_message}
                  </p>
                )}
              {item.error_code && (
                <p className="font-mono text-[10px] leading-relaxed text-foreground-400">
                  エラーコード: {item.error_code}
                </p>
              )}
            </div>
          )}

          {(item.draft_id || item.draft_version != null) && (
            <p className="font-mono text-[10px] leading-relaxed text-foreground-400">
              下書き
              {item.draft_version != null ? ` v${item.draft_version}` : ""}
              {item.draft_id ? ` · ${item.draft_id}` : ""}
            </p>
          )}

          {display === "contract_violation" && (
            <p className="break-words text-[10px] leading-relaxed text-foreground-500">
              GAS側は completed のため「失敗のみ再実行」に含まれない場合があります。商品詳細で下書きを確認してください。
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(AiBatchResultRow, (prev, next) => {
  const a = prev.item;
  const b = next.item;
  return (
    a.product_id === b.product_id &&
    a.product_name === b.product_name &&
    a.status === b.status &&
    a.retry_count === b.retry_count &&
    a.error_code === b.error_code &&
    a.error_message === b.error_message &&
    a.proposed_price === b.proposed_price &&
    a.price_note === b.price_note &&
    a.price_basis === b.price_basis &&
    a.draft_id === b.draft_id &&
    a.draft_version === b.draft_version
  );
});