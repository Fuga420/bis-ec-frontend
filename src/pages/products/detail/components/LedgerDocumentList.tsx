import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ProductCostLinkDetail } from "@/pages/documents/lib/documentLedgerApi";
import { formatYen } from "@/pages/products/detail/lib/format";

const LINK_TYPE_LABELS: Record<string, string> = {
  primary_cost: "商品代金",
  commission: "落札手数料",
  additional_fee: "追加手数料",
  shipping_cost: "送料",
  other_expense: "その他経費",
  refund: "返金・値引き",
  sale_settlement: "売上精算",
};

// 書類ごとの操作は控えめなゴーストボタンに統一する
const ACTION_BUTTON =
  "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-900";
const ACTION_PDF =
  "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium text-primary-700 transition-colors hover:bg-primary-50";

interface LedgerDocumentListProps {
  loading: boolean;
  errorText: string;
  onRetry: () => void;

  links: ProductCostLinkDetail[];
  notice: string;
  unlinkError: string;

  unlinkingId: string | null;
  unlinkTargetId: string | null;
  onAskUnlink: (linkId: string) => void;
  onCancelUnlink: () => void;
  onConfirmUnlink: (linkId: string) => void;

  // スタッフ用の明細検索パネル
  linkerOpen: boolean;
  onToggleLinker: () => void;
  linker: ReactNode;
}

/** 仕入内訳の金額1項目 */
function Amount({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <span className="whitespace-nowrap text-[11px] tabular-nums text-foreground-500">
      {label}{" "}
      <span
        className={
          strong ? "font-semibold text-foreground-900" : "font-medium text-foreground-700"
        }
      >
        {value}
      </span>
    </span>
  );
}

/**
 * 書類一覧: この商品に紐付いた書類明細を簡潔なリストで表示し、
 * 書類ごとの操作（原本PDF・書類詳細・紐付け解除）をまとめる。
 * 取得・解除の実行は呼び出し元（ProductLedgerSection）が持つ。
 */
export default function LedgerDocumentList({
  loading,
  errorText,
  onRetry,
  links,
  notice,
  unlinkError,
  unlinkingId,
  unlinkTargetId,
  onAskUnlink,
  onCancelUnlink,
  onConfirmUnlink,
  linkerOpen,
  onToggleLinker,
  linker,
}: LedgerDocumentListProps) {
  return (
    <section className="rounded-[10px] border border-background-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-background-100 px-4 py-3 md:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground-950">
            <i className="ri-file-list-3-line w-4 h-4 flex items-center justify-center text-primary-600"></i>
            紐付け書類
          </h2>
          <span className="inline-flex h-[20px] items-center whitespace-nowrap rounded-md bg-background-100 px-2 text-[10px] font-medium leading-none text-foreground-600">
            {links.length}件
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden text-[10px] text-foreground-400 sm:inline">
            スタッフ用 / 自動照合は行いません
          </span>
          <button
            type="button"
            onClick={onToggleLinker}
            aria-expanded={linkerOpen}
            className={`inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              linkerOpen
                ? "border-background-300 bg-white text-foreground-600 hover:bg-background-100"
                : "border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100"
            }`}
          >
            <i
              className={`${
                linkerOpen ? "ri-close-line" : "ri-link-m"
              } w-3.5 h-3.5 flex items-center justify-center`}
            ></i>
            {linkerOpen ? "閉じる" : "明細を探して紐付け"}
          </button>
        </div>
      </div>

      {linkerOpen && (
        <div className="border-b border-background-100 px-4 py-3 md:px-5">
          {linker}
        </div>
      )}

      {(notice || unlinkError) && (
        <div className="flex flex-col gap-1.5 px-4 pt-3 md:px-5">
          {notice && (
            <p className="flex items-start gap-1.5 rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-[11px] font-medium text-primary-800">
              <i className="ri-checkbox-circle-line mt-0.5 w-3.5 h-3.5 shrink-0 flex items-center justify-center"></i>
              <span className="min-w-0 flex-1">{notice}</span>
            </p>
          )}
          {unlinkError && (
            <p className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700">
              <i className="ri-error-warning-line mt-0.5 w-3.5 h-3.5 shrink-0 flex items-center justify-center"></i>
              <span className="min-w-0 flex-1">{unlinkError}</span>
            </p>
          )}
        </div>
      )}

      {loading && (
        <p className="flex items-center gap-1.5 px-4 py-4 text-xs text-foreground-500 md:px-5">
          <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
          書類を読み込み中...
        </p>
      )}

      {!loading && errorText && (
        <div className="m-3 flex flex-wrap items-center gap-2 rounded-lg border border-background-200 bg-background-50 px-3 py-2.5 md:m-4">
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground-600">
            {errorText}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 py-1 text-[11px] font-medium text-foreground-700 transition-colors hover:bg-background-100"
          >
            <i className="ri-refresh-line w-3.5 h-3.5 flex items-center justify-center"></i>
            再読み込み
          </button>
        </div>
      )}

      {!loading && !errorText && links.length === 0 && (
        <div className="m-3 flex items-start gap-2 rounded-lg border border-dashed border-background-300 bg-background-50 px-3 py-3 md:m-4">
          <i className="ri-link-unlink mt-0.5 w-4 h-4 flex items-center justify-center shrink-0 text-foreground-400"></i>
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-foreground-600">
            この商品に紐付いた書類明細はありません。右上の「明細を探して紐付け」から受付番号・品目で検索して紐付けてください。
          </p>
        </div>
      )}

      {!loading && !errorText && links.length > 0 && (
        <ul className="divide-y divide-background-100">
          {links.map((link) => {
            const confirming = unlinkTargetId === link.link_id;
            const busy = unlinkingId === link.link_id;
            return (
              <li
                key={link.link_id}
                className="px-4 py-3 transition-colors hover:bg-background-50/70 md:px-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    {/* 1行目: 書類番号・受付番号・状態 */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="whitespace-nowrap font-mono text-[12px] font-bold text-foreground-950">
                        {link.document_number || "書類番号なし"}
                      </span>
                      {link.reception_number && (
                        <span className="whitespace-nowrap text-[11px] text-foreground-400">
                          受付 {link.reception_number}
                        </span>
                      )}
                      <span className="inline-flex h-[19px] items-center whitespace-nowrap rounded bg-secondary-100 px-1.5 text-[10px] font-medium leading-none text-secondary-900">
                        {LINK_TYPE_LABELS[link.link_type] ?? link.link_type}
                      </span>
                    </div>

                    {/* 2行目: 仕入先・請求日・品目 */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-foreground-500">
                      <span className="whitespace-nowrap">
                        仕入先{" "}
                        <span className="font-medium text-foreground-800">
                          {link.supplier_name || "—"}
                        </span>
                      </span>
                      <span className="whitespace-nowrap">
                        請求日{" "}
                        <span className="font-medium text-foreground-800">
                          {link.issue_date || "—"}
                        </span>
                      </span>
                      <span
                        className="min-w-0 max-w-[240px] truncate text-foreground-400"
                        title={link.item_name}
                      >
                        {link.item_name || "（品目なし）"}
                      </span>
                    </div>

                    {/* 3行目: 金額 */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Amount label="商品代金" value={formatYen(link.item_amount)} strong />
                      <Amount
                        label="落札手数料"
                        value={formatYen(link.fee_amount)}
                        strong
                      />
                      <Amount
                        label="明細（税込）"
                        value={formatYen(link.total_line_amount)}
                      />
                    </div>
                  </div>

                  {/* 書類ごとの操作（控えめに右端へ） */}
                  <div className="flex shrink-0 flex-wrap items-center gap-0.5">
                    {link.drive_url ? (
                      <a
                        href={link.drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={ACTION_PDF}
                      >
                        <i className="ri-file-pdf-2-line w-3.5 h-3.5 flex items-center justify-center"></i>
                        原本PDF
                      </a>
                    ) : (
                      <span className="inline-flex cursor-default items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] text-foreground-300">
                        <i className="ri-link-unlink w-3.5 h-3.5 flex items-center justify-center"></i>
                        原本なし
                      </span>
                    )}
                    {link.document_id && (
                      <Link to={`/documents/${link.document_id}`} className={ACTION_BUTTON}>
                        <i className="ri-file-text-line w-3.5 h-3.5 flex items-center justify-center"></i>
                        書類詳細
                      </Link>
                    )}
                    {!confirming && (
                      <button
                        type="button"
                        onClick={() => onAskUnlink(link.link_id)}
                        className={`${ACTION_BUTTON} hover:bg-red-50 hover:text-red-700`}
                      >
                        <i className="ri-link-unlink w-3.5 h-3.5 flex items-center justify-center"></i>
                        解除
                      </button>
                    )}
                  </div>
                </div>

                {/* 紐付け解除の確認（誤操作防止のため2段階） */}
                {confirming && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-2">
                    <span className="whitespace-nowrap text-[11px] font-medium text-red-700">
                      この書類の紐付けを解除しますか？
                    </span>
                    <span className="min-w-0 flex-1" />
                    <button
                      type="button"
                      onClick={() => onConfirmUnlink(link.link_id)}
                      disabled={busy}
                      className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? (
                        <i className="ri-loader-4-line animate-spin w-3 h-3 flex items-center justify-center"></i>
                      ) : (
                        <i className="ri-link-unlink w-3 h-3 flex items-center justify-center"></i>
                      )}
                      解除する
                    </button>
                    <button
                      type="button"
                      onClick={onCancelUnlink}
                      disabled={busy}
                      className="inline-flex cursor-pointer items-center whitespace-nowrap rounded border border-background-300 bg-white px-2 py-1 text-[10px] font-medium text-foreground-600 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      やめる
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}