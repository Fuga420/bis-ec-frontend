import { memo } from "react";
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
  contract_violation: "text-amber-700",
};

interface AiBatchResultRowProps {
  item: AiBatchDisplayItem;
}

/**
 * 結果リストの1行（コンパクトなリスト形式）。
 *
 * ポーリングのたびに items 配列が作り直されるため、行を memo 化して
 * 変化のない商品の再描画（点滅）を防ぐ。行の高さは内容に応じて変わるが、
 * 並び順は API の順序をそのまま使い、自動スクロールは行わない。
 */
function AiBatchResultRow({ item }: AiBatchResultRowProps) {
  const display = deriveAiBatchDisplayStatus(item);
  const rawName = (item.product_name ?? "").trim();
  const isNameMissing = rawName === "";
  const displayName = isNameMissing ? "商品名未入力" : rawName;

  return (
    <div className="flex items-start gap-3 border-b border-[#E5E7EB]/70 px-5 py-2 transition-colors last:border-b-0 hover:bg-background-50">
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-[13px] leading-snug ${
            isNameMissing
              ? "font-medium text-foreground-400"
              : "font-medium text-foreground-900"
          }`}
        >
          {displayName}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] leading-none tabular-nums text-foreground-400">
          {item.product_id}
        </p>

        {(item.proposed_price != null || item.price_note) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {item.proposed_price != null && (
              <span className="admin-numeric text-[11px] font-semibold leading-none text-foreground-800">
                提案価格 ¥{item.proposed_price.toLocaleString("ja-JP")}
              </span>
            )}
            {isCostMarkupFloorBasis(item.price_basis) && (
              <span className="inline-flex h-[16px] items-center whitespace-nowrap rounded border border-background-300 px-1 text-[10px] font-medium leading-none text-foreground-600">
                原価上乗せ下限
              </span>
            )}
            {item.price_note && (
              <span className="w-full break-words text-[10px] leading-relaxed text-foreground-500">
                {item.price_note}
              </span>
            )}
          </div>
        )}

        {display === "failed" && (item.error_code || item.error_message) && (
          <p className="mt-1 break-words text-[11px] leading-relaxed text-amber-800">
            {explainAiBatchError(item.error_code, item.error_message)}
            {item.error_code ? `（コード: ${item.error_code}）` : ""}
          </p>
        )}

        {display === "contract_violation" && (
          <>
            {(item.error_code || item.error_message) && (
              <p className="mt-1 break-words text-[11px] leading-relaxed text-amber-800">
                {explainAiBatchError(item.error_code, item.error_message)}
                {item.error_code ? `（コード: ${item.error_code}）` : ""}
              </p>
            )}
            <p className="mt-0.5 break-words text-[10px] leading-relaxed text-foreground-500">
              GAS側は completed のため「失敗のみ再実行」に含まれない場合があります。商品詳細で下書きを確認してください。
            </p>
          </>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
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
        {display === "success" && (
          <Link
            to={`/products/${item.product_id}`}
            className="inline-flex cursor-pointer items-center gap-0.5 whitespace-nowrap text-[11px] leading-none text-foreground-500 transition-colors hover:text-primary-700 hover:underline"
          >
            商品を開く
            <i className="ri-arrow-right-s-line flex h-3 w-3 items-center justify-center text-[12px]"></i>
          </Link>
        )}
      </div>
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
    a.price_basis === b.price_basis
  );
});