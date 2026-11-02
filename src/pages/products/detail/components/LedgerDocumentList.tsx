import { useState, type ReactNode } from "react";
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

// 業務操作は文字リンク相当の控えめなボタンに統一する
const ACTION_LINK =
  "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded px-1.5 py-1 text-[11px] font-medium text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-900";
// 解除はさらに控えめ（危険操作なので文字色も落とす）
const ACTION_UNLINK =
  "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded px-1.5 py-1 text-[11px] font-medium text-foreground-400 transition-colors hover:bg-red-50 hover:text-red-600";

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

/** 明細金額1項目（ラベルは小さく、数値は右揃えで桁を揃える） */
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
    <div className="flex items-baseline gap-1 whitespace-nowrap">
      <dt className="text-[10px] leading-tight text-foreground-400">{label}</dt>
      <dd
        className={`text-[11.5px] leading-tight tabular-nums ${
          strong ? "font-semibold text-foreground-900" : "font-medium text-foreground-700"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/** 書類番号・受付番号などの識別情報1つ分 */
function MetaItem({
  label,
  value,
  mono = false,
  truncate = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1 whitespace-nowrap text-[11px]">
      <span className="shrink-0 text-[10px] text-foreground-400">{label}</span>
      <span
        className={`min-w-0 text-foreground-700 ${
          mono ? "font-mono text-[11px] font-medium" : "font-medium"
        } ${truncate ? "truncate" : ""}`}
        title={truncate ? value : undefined}
      >
        {value}
      </span>
    </span>
  );
}

/**
 * 紐付け書類: 1件を2段構成でコンパクトに表示する。
 *  1段目 = ファイルアイコン・ファイル名・照合チップ（区分）・金額・「明細を表示」
 *  2段目 = 書類番号・受付番号・仕入先・請求日・明細内訳・操作（折りたたみ）
 * 空の識別情報は描画しない（「—」を並べて情報量を増やさない）。
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
  // 2段目（明細）を開いている書類の link_id
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const isExpanded = (linkId: string) => expandedIds.includes(linkId);
  const toggleExpanded = (linkId: string) =>
    setExpandedIds((prev) =>
      prev.includes(linkId)
        ? prev.filter((id) => id !== linkId)
        : [...prev, linkId]
    );

  return (
    <section className="ui-card rounded-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-background-200 px-4 py-2.5 md:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="min-w-0">
            <p className="admin-eyebrow text-[10px] font-semibold tracking-[0.14em] text-foreground-400">
              Ledger
            </p>
            <h2 className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[15px] font-bold leading-tight text-foreground-950">
              <i className="ri-file-list-3-line w-4 h-4 flex items-center justify-center text-primary-600"></i>
              紐付け書類
            </h2>
          </div>
          <span className="inline-flex h-[19px] items-center whitespace-nowrap rounded-full border border-background-200 bg-background-50 px-2 text-[10px] font-medium leading-none tabular-nums text-foreground-600">
            {links.length}件
          </span>

          {/* 常時表示していた補足説明はツールチップに移し、制約は確認できる状態で残す */}
          <span className="group relative inline-flex items-center">
            <button
              type="button"
              aria-label="紐付け書類の操作について"
              className="inline-flex w-4 h-4 cursor-help items-center justify-center rounded-full text-foreground-400 transition-colors hover:text-foreground-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              <i className="ri-information-line w-3.5 h-3.5 flex items-center justify-center"></i>
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 hidden w-64 rounded-md border border-background-200 bg-white p-2.5 text-[11px] leading-relaxed text-foreground-600 shadow-lg group-hover:block group-focus-within:block"
            >
              <span className="block font-medium text-foreground-800">
                スタッフ用の操作です
              </span>
              <span className="mt-1 block">
                受付番号・品目で明細を検索して手動で紐付けます。自動照合は行いません。
              </span>
            </span>
          </span>
        </div>

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

      {linkerOpen && (
        <div className="border-b border-background-200 px-4 py-3 md:px-5">{linker}</div>
      )}

      {(notice || unlinkError) && (
        <div className="flex flex-col gap-1.5 px-4 pt-2.5 md:px-5">
          {notice && (
            <p className="flex items-start gap-1.5 rounded border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-[11px] font-medium text-primary-800">
              <i className="ri-checkbox-circle-line mt-0.5 w-3.5 h-3.5 shrink-0 flex items-center justify-center"></i>
              <span className="min-w-0 flex-1">{notice}</span>
            </p>
          )}
          {unlinkError && (
            <p className="flex items-start gap-1.5 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700">
              <i className="ri-error-warning-line mt-0.5 w-3.5 h-3.5 shrink-0 flex items-center justify-center"></i>
              <span className="min-w-0 flex-1">{unlinkError}</span>
            </p>
          )}
        </div>
      )}

      {loading && (
        <p className="flex items-center gap-1.5 px-4 py-3.5 text-xs text-foreground-500 md:px-5">
          <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
          書類を読み込み中...
        </p>
      )}

      {!loading && errorText && (
        <div className="m-3 flex flex-wrap items-center gap-2 rounded-md border border-background-200 bg-background-50 px-3 py-2 md:m-4">
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
        <div className="m-3 flex items-start gap-2 rounded-md border border-dashed border-background-300 bg-background-50 px-3 py-2.5 md:m-4">
          <i className="ri-link-unlink mt-0.5 w-4 h-4 flex items-center justify-center shrink-0 text-foreground-400"></i>
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-foreground-600">
            この商品に紐付いた書類明細はありません。右上の「明細を探して紐付け」から受付番号・品目で検索して紐付けてください。
          </p>
        </div>
      )}

      {!loading && !errorText && links.length > 0 && (
        <ul className="divide-y divide-background-200">
          {links.map((link) => {
            const confirming = unlinkTargetId === link.link_id;
            const busy = unlinkingId === link.link_id;
            const expanded = isExpanded(link.link_id);
            const fileName = link.document_file_name?.trim() ?? "";
            const itemName = link.item_name?.trim() ?? "";
            // 1段目の主役はファイル名。無ければ品目名。
            const primaryTitle = fileName || itemName || "（品目なし）";
            const secondaryTitle = fileName && itemName ? itemName : "";
            const typeLabel = LINK_TYPE_LABELS[link.link_type] ?? link.link_type;
            const hasMeta =
              Boolean(link.document_number) ||
              Boolean(link.reception_number) ||
              Boolean(link.supplier_name) ||
              Boolean(link.issue_date);

            return (
              <li key={link.link_id} className="px-4 py-2.5 md:px-5">
                {/* 1段目: ファイル名・照合チップ・金額・明細トグル */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-background-100 text-foreground-500">
                      <i
                        className={`${
                          link.drive_url ? "ri-file-pdf-2-line" : "ri-file-list-3-line"
                        } text-[13px] leading-none`}
                        aria-hidden="true"
                      ></i>
                    </span>
                    <div className="min-w-0">
                      <p
                        className="min-w-0 truncate text-[12.5px] font-semibold leading-snug text-foreground-950"
                        title={primaryTitle}
                      >
                        {primaryTitle}
                      </p>
                      {secondaryTitle && (
                        <p
                          className="mt-0.5 truncate text-[11px] leading-tight text-foreground-400"
                          title={secondaryTitle}
                        >
                          {secondaryTitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
                    <span className="inline-flex h-[18px] items-center whitespace-nowrap rounded-full border border-background-300 bg-white px-1.5 text-[10px] font-medium leading-none text-foreground-600">
                      {typeLabel}
                    </span>
                    <span className="whitespace-nowrap text-[13px] font-semibold leading-none tabular-nums text-foreground-950">
                      {formatYen(link.total_line_amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(link.link_id)}
                      aria-expanded={expanded}
                      className="inline-flex cursor-pointer items-center gap-0.5 whitespace-nowrap rounded px-1 py-0.5 text-[11px] font-medium text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-900"
                    >
                      <i
                        className={`${
                          expanded ? "ri-subtract-line" : "ri-add-line"
                        } w-3 h-3 flex items-center justify-center text-xs`}
                        aria-hidden="true"
                      ></i>
                      {expanded ? "閉じる" : "明細を表示"}
                    </button>
                  </div>
                </div>

                {/* 2段目: 識別情報・内訳・操作（必要なときだけ開く） */}
                {expanded && (
                  <div className="tab-fade mt-2 rounded-md border border-background-100 bg-background-50 px-2.5 py-2">
                    {hasMeta ? (
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                        {link.document_number && (
                          <MetaItem
                            label="書類番号"
                            value={link.document_number}
                            mono
                          />
                        )}
                        {link.reception_number && (
                          <MetaItem
                            label="受付番号"
                            value={link.reception_number}
                            mono
                          />
                        )}
                        {link.supplier_name && (
                          <MetaItem
                            label="仕入先"
                            value={link.supplier_name}
                            truncate
                          />
                        )}
                        {link.issue_date && (
                          <MetaItem label="請求日" value={link.issue_date} />
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-foreground-400">
                        書類番号などの識別情報は未登録です。
                      </p>
                    )}

                    <dl className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <Amount
                        label="商品代金"
                        value={formatYen(link.item_amount)}
                        strong
                      />
                      <Amount
                        label="落札手数料"
                        value={formatYen(link.fee_amount)}
                        strong
                      />
                      <Amount
                        label="明細（税込）"
                        value={formatYen(link.total_line_amount)}
                      />
                    </dl>

                    <div className="mt-1.5 flex flex-wrap items-center gap-0.5 border-t border-background-200 pt-1.5">
                      {link.drive_url ? (
                        <a
                          href={link.drive_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={ACTION_LINK}
                        >
                          <i className="ri-file-pdf-2-line w-3.5 h-3.5 flex items-center justify-center"></i>
                          原本PDF
                        </a>
                      ) : (
                        <span className="inline-flex cursor-default items-center gap-1 whitespace-nowrap px-1.5 py-1 text-[11px] text-foreground-300">
                          <i className="ri-link-unlink w-3.5 h-3.5 flex items-center justify-center"></i>
                          原本なし
                        </span>
                      )}
                      {link.document_id && (
                        <Link to={`/documents/${link.document_id}`} className={ACTION_LINK}>
                          <i className="ri-file-text-line w-3.5 h-3.5 flex items-center justify-center"></i>
                          書類詳細
                        </Link>
                      )}
                      {!confirming && (
                        <>
                          <span className="mx-0.5 h-3 w-px bg-background-200" />
                          <button
                            type="button"
                            onClick={() => onAskUnlink(link.link_id)}
                            className={ACTION_UNLINK}
                          >
                            <i className="ri-link-unlink w-3.5 h-3.5 flex items-center justify-center"></i>
                            紐付けを解除
                          </button>
                        </>
                      )}
                    </div>

                    {/* 紐付け解除の確認（誤操作防止のため2段階） */}
                    {confirming && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded border border-red-200 bg-red-50 px-2.5 py-2">
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