import { useEffect, useState } from "react";
import ProductLinkSearch from "./ProductLinkSearch";
import { isLineLinked, lineLinkedProductIds } from "@/pages/documents/lib/derive";
import {
  TRANSACTION_TYPE_OPTIONS,
  type DocumentLedgerLine,
  type TransactionType,
} from "@/pages/documents/types";

interface DocumentLineEditorProps {
  lines: DocumentLedgerLine[];
  onChange: (lines: DocumentLedgerLine[]) => void;
  // 明細削除（保存済みはサーバー削除、未保存はローカル削除）。
  onDeleteLine: (line: DocumentLedgerLine) => void;
  // 商品の手動紐付け（保存済み明細のみ）。
  onLink: (
    line: DocumentLedgerLine,
    product: { product_id: string; product_name: string },
    allocatedAmountText: string
  ) => void;
  // 紐付け解除（保存済みのみ）。linkId を渡すとその紐付けだけを解除する。
  onUnlink: (line: DocumentLedgerLine, linkId?: string) => void;
  disabled?: boolean;
  busyLineId?: string | null;
  // 検索結果から開いた明細（該当行を強調表示する）
  highlightLineId?: string | null;
}

type NumericField = "amount" | "item_amount" | "fee_amount" | "allocated_amount";

// 明細行の一時ID（画面上の識別用）。
function createLineId(): string {
  return `local-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function createEmptyLine(): DocumentLedgerLine {
  return {
    line_id: createLineId(),
    description: "",
    amount: null,
    transaction_type: "purchase",
    product_id: "",
    product_name: "",
    reception_number: "",
    item_amount: null,
    fee_amount: null,
    links: [],
  };
}

function formatYen(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `¥${Number(value).toLocaleString("ja-JP")}`;
}

const cellInputClass =
  "w-full rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-sm text-foreground-900 placeholder:text-foreground-300 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * 手動明細行の追加・修正。
 * - 品目（item_name_raw）は新規明細で必須。
 * - 受付番号と、商品代金・落札手数料の内訳を明細ごとに保持する。
 * - 金額は「未入力 = null」「明示的な0円 = 0」を区別して送信する。
 * - 商品紐付け/解除は保存済み明細（document_line_id 取得後）で行う。
 */
export default function DocumentLineEditor({
  lines,
  onChange,
  onDeleteLine,
  onLink,
  onUnlink,
  disabled = false,
  busyLineId = null,
  highlightLineId = null,
}: DocumentLineEditorProps) {
  const [searchingLineId, setSearchingLineId] = useState<string | null>(null);
  const [numericText, setNumericText] = useState<Record<string, string>>({});

  // 検索結果から来た明細へスクロールする。
  useEffect(() => {
    if (!highlightLineId) return;
    const el = document.getElementById(`line-${highlightLineId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightLineId, lines.length]);

  const getNumericText = (line: DocumentLedgerLine, field: NumericField): string => {
    const key = `${line.line_id}:${field}`;
    if (Object.prototype.hasOwnProperty.call(numericText, key)) {
      return numericText[key];
    }
    const value = line[field];
    return value === null || value === undefined ? "" : String(value);
  };

  const updateLine = (lineId: string, patch: Partial<DocumentLedgerLine>) => {
    onChange(
      lines.map((line) =>
        line.line_id === lineId ? { ...line, ...patch } : line
      )
    );
  };

  const handleNumericChange = (
    line: DocumentLedgerLine,
    field: NumericField,
    raw: string
  ) => {
    const digits = raw.replace(/[^0-9]/g, "");
    setNumericText((prev) => ({ ...prev, [`${line.line_id}:${field}`]: digits }));
    updateLine(line.line_id, {
      [field]: digits === "" ? null : Number(digits),
    } as Partial<DocumentLedgerLine>);
  };

  const addLine = () => onChange([...lines, createEmptyLine()]);

  const removeLine = (line: DocumentLedgerLine) => {
    onDeleteLine(line);
    if (searchingLineId === line.line_id) setSearchingLineId(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground-950">
          <i className="ri-list-check-2 w-4 h-4 flex items-center justify-center text-primary-600"></i>
          明細行（{lines.length}）
        </h3>
        <button
          type="button"
          onClick={addLine}
          disabled={disabled}
          className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-white px-3 py-1.5 text-xs font-medium text-foreground-700 transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <i className="ri-add-line w-4 h-4 flex items-center justify-center"></i>
          明細行を追加
        </button>
      </div>

      {lines.length === 0 ? (
        <div className="mt-3 flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-background-300 bg-background-50 py-10 text-center">
          <i className="ri-file-list-3-line w-7 h-7 flex items-center justify-center text-foreground-300"></i>
          <p className="text-sm text-foreground-500">
            明細行がありません。「明細行を追加」から登録してください。
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {lines.map((line, index) => {
            const linked = isLineLinked(line);
            const highlighted = highlightLineId === line.line_id;
            const linkedIds = lineLinkedProductIds(line);
            const saved = Boolean(line.server_id);
            const busy = busyLineId === line.line_id;
            const breakdown =
              (line.item_amount ?? 0) + (line.fee_amount ?? 0);
            // 税額は商品代金・手数料に混ぜず、内訳として別に扱う。
            const hasTaxInfo =
              (line.tax_amount !== null && line.tax_amount !== undefined) ||
              (line.fee_tax_amount !== null && line.fee_tax_amount !== undefined);
            const taxBreakdown =
              (line.tax_amount ?? 0) + (line.fee_tax_amount ?? 0);
            const breakdownWithTax = breakdown + taxBreakdown;
            // 税額が取得できている明細のみ、明細金額との一致を確認する。
            const amountMismatch =
              line.amount !== null &&
              line.amount !== undefined &&
              hasTaxInfo &&
              line.amount !== breakdownWithTax;
            return (
              <div
                key={line.line_id}
                id={`line-${line.line_id}`}
                className={`rounded-lg border bg-white p-3 transition-colors ${
                  highlighted
                    ? "border-primary-400 ring-2 ring-primary-200"
                    : "border-background-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-background-100 px-1.5 text-[11px] font-bold tabular-nums text-foreground-600">
                      {line.line_number ?? index + 1}
                    </span>
                    {line.reception_number ? (
                      <span className="inline-flex h-[22px] min-w-0 items-center gap-1 truncate rounded-md bg-secondary-100 px-2 font-mono text-[11px] font-bold text-secondary-900">
                        <i className="ri-hashtag w-3 h-3 flex items-center justify-center"></i>
                        {line.reception_number}
                      </span>
                    ) : (
                      <span className="text-[11px] text-foreground-400">
                        受付番号 未入力
                      </span>
                    )}
                    {!saved && (
                      <span className="text-[10px] text-foreground-400">未保存</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line)}
                    disabled={disabled || busy}
                    aria-label={`${index + 1}行目を削除`}
                    className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-foreground-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <i className="ri-delete-bin-line w-3.5 h-3.5 flex items-center justify-center"></i>
                    削除
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px_160px]">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-foreground-500">
                      品目 <span className="text-red-500">*</span>
                    </span>
                    <input
                      type="text"
                      value={line.description}
                      disabled={disabled || busy}
                      onChange={(e) =>
                        updateLine(line.line_id, { description: e.target.value })
                      }
                      placeholder="明細の内容（例: Air Jordan 1 25.0cm）"
                      className={cellInputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-foreground-500">
                      取引種別
                    </span>
                    <select
                      value={line.transaction_type}
                      disabled={disabled || busy}
                      onChange={(e) =>
                        updateLine(line.line_id, {
                          transaction_type: e.target.value as TransactionType,
                        })
                      }
                      className={`${cellInputClass} cursor-pointer`}
                    >
                      {TRANSACTION_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-foreground-500">
                      受付番号
                    </span>
                    <input
                      type="text"
                      value={line.reception_number ?? ""}
                      disabled={disabled || busy}
                      onChange={(e) =>
                        updateLine(line.line_id, {
                          reception_number: e.target.value,
                        })
                      }
                      placeholder="例: 1234-5678"
                      className={`${cellInputClass} font-mono`}
                    />
                  </label>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-foreground-500">
                      商品代金（税抜）
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={getNumericText(line, "item_amount")}
                      disabled={disabled || busy}
                      onChange={(e) =>
                        handleNumericChange(line, "item_amount", e.target.value)
                      }
                      placeholder="未入力可"
                      className={`${cellInputClass} tabular-nums`}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-foreground-500">
                      落札手数料（税抜）
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={getNumericText(line, "fee_amount")}
                      disabled={disabled || busy}
                      onChange={(e) =>
                        handleNumericChange(line, "fee_amount", e.target.value)
                      }
                      placeholder="未入力可"
                      className={`${cellInputClass} tabular-nums`}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-foreground-500">
                      明細金額（税込）
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={getNumericText(line, "amount")}
                      disabled={disabled || busy}
                      onChange={(e) =>
                        handleNumericChange(line, "amount", e.target.value)
                      }
                      placeholder="未入力可"
                      className={`${cellInputClass} tabular-nums`}
                    />
                  </label>
                </div>

                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-foreground-500">
                  <span className="tabular-nums">
                    商品代金 + 落札手数料 ={" "}
                    <span className="font-semibold text-foreground-800">
                      {formatYen(breakdown)}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    ＋ 税（商品税 {formatYen(line.tax_amount)} / 手数料税{" "}
                    {formatYen(line.fee_tax_amount)}）={" "}
                    <span className="font-semibold text-foreground-800">
                      {formatYen(breakdownWithTax)}
                    </span>
                  </span>
                  {amountMismatch && (
                    <span className="text-amber-700">
                      明細金額と内訳（税額込み）が一致していません
                    </span>
                  )}
                  {!hasTaxInfo && (
                    <span className="text-foreground-400">
                      税額が未取得のため、一致確認は行いません
                    </span>
                  )}
                </p>

                {/* 紐付け商品 */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-background-100 pt-2.5">
                  <span className="text-[11px] font-medium text-foreground-500">
                    紐付け商品
                  </span>
                  {linked ? (
                    <>
                      {(line.links && line.links.length > 0
                        ? line.links
                        : linkedIds.map((id) => ({
                            link_id: line.link_id ?? "",
                            product_id: id,
                            allocated_amount: line.allocated_amount ?? null,
                            link_type: "primary_cost",
                          }))
                      ).map((link) => (
                        <span
                          key={`${line.line_id}-${link.link_id || link.product_id}`}
                          className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-primary-100 px-2.5 py-1 text-[11px] font-bold text-primary-700"
                        >
                          <i className="ri-link w-3 h-3 flex items-center justify-center"></i>
                          <span className="max-w-[180px] truncate font-mono">
                            {link.product_id}
                          </span>
                          {link.allocated_amount !== null && (
                            <span className="tabular-nums text-[10px] font-medium opacity-80">
                              割当 {formatYen(link.allocated_amount)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => onUnlink(line, link.link_id || undefined)}
                            disabled={disabled || busy || !link.link_id}
                            aria-label={`${link.product_id} の紐付けを解除`}
                            className="ml-0.5 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-primary-700 transition-colors hover:bg-primary-200 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <i className="ri-close-line w-3 h-3 flex items-center justify-center"></i>
                          </button>
                        </span>
                      ))}
                    </>
                  ) : (
                    <span className="rounded-md bg-background-100 px-2 py-0.5 text-[11px] text-foreground-500">
                      未紐付け
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setSearchingLineId((prev) =>
                        prev === line.line_id ? null : line.line_id
                      )
                    }
                    disabled={disabled || busy || !saved}
                    className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-white px-3 py-1.5 text-[11px] font-medium text-foreground-700 transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <i className="ri-search-line w-3.5 h-3.5 flex items-center justify-center"></i>
                    {saved ? "商品IDで検索して紐付け" : "保存後に紐付けできます"}
                  </button>

                  {/* 割当金額（明細金額が未入力の場合に必要） */}
                  <label className="ml-auto flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-foreground-500">
                      割当金額
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={getNumericText(line, "allocated_amount")}
                      disabled={disabled || busy}
                      onChange={(e) =>
                        handleNumericChange(line, "allocated_amount", e.target.value)
                      }
                      placeholder="明細金額/内訳を使用"
                      className="h-8 w-[130px] rounded-md border border-background-300 bg-white px-2.5 text-xs tabular-nums text-foreground-900 placeholder:text-foreground-300 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                </div>

                {searchingLineId === line.line_id && (
                  <div className="mt-2.5">
                    <ProductLinkSearch
                      disabled={disabled || busy}
                      onCancel={() => setSearchingLineId(null)}
                      onSelect={(product) => {
                        onLink(
                          line,
                          product,
                          getNumericText(line, "allocated_amount")
                        );
                        setSearchingLineId(null);
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}