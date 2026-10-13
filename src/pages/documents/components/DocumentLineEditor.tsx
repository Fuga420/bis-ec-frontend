import { useState } from "react";
import ProductLinkSearch from "./ProductLinkSearch";
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
  // 紐付け解除（保存済みのみ）。
  onUnlink: (line: DocumentLedgerLine) => void;
  disabled?: boolean;
  busyLineId?: string | null;
}

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
  };
}

const cellInputClass =
  "w-full rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-sm text-foreground-900 placeholder:text-foreground-300 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * 手動明細行の追加・修正。
 * - 品目（item_name_raw）は新規明細で必須。
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
}: DocumentLineEditorProps) {
  const [searchingLineId, setSearchingLineId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState<Record<string, string>>({});
  const [allocatedText, setAllocatedText] = useState<Record<string, string>>({});

  const getAmountText = (line: DocumentLedgerLine): string => {
    if (Object.prototype.hasOwnProperty.call(amountText, line.line_id)) {
      return amountText[line.line_id];
    }
    return line.amount === null || line.amount === undefined
      ? ""
      : String(line.amount);
  };

  const getAllocatedText = (line: DocumentLedgerLine): string => {
    if (Object.prototype.hasOwnProperty.call(allocatedText, line.line_id)) {
      return allocatedText[line.line_id];
    }
    return line.allocated_amount === null || line.allocated_amount === undefined
      ? ""
      : String(line.allocated_amount);
  };

  const updateLine = (lineId: string, patch: Partial<DocumentLedgerLine>) => {
    onChange(
      lines.map((line) =>
        line.line_id === lineId ? { ...line, ...patch } : line
      )
    );
  };

  const handleAmountChange = (line: DocumentLedgerLine, raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    setAmountText((prev) => ({ ...prev, [line.line_id]: digits }));
    updateLine(line.line_id, { amount: digits === "" ? null : Number(digits) });
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
            const linked = (line.product_id ?? "").trim() !== "";
            const saved = Boolean(line.server_id);
            const busy = busyLineId === line.line_id;
            return (
              <div
                // React の key は配列番号ではなく明細ID（line_id = get_document が返す id）を使う。
                key={line.line_id}
                className="rounded-lg border border-background-200 bg-white p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-background-100 px-1.5 text-[11px] font-bold tabular-nums text-foreground-600">
                    {line.line_number ?? index + 1}
                  </span>
                  {!saved && (
                    <span className="text-[10px] text-foreground-400">
                      未保存
                    </span>
                  )}
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

                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px_150px]">
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
                      金額
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={getAmountText(line)}
                      disabled={disabled || busy}
                      onChange={(e) => handleAmountChange(line, e.target.value)}
                      placeholder="未入力可"
                      className={`${cellInputClass} tabular-nums`}
                    />
                  </label>
                </div>

                {/* 紐付け商品 */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-background-100 pt-2.5">
                  <span className="text-[11px] font-medium text-foreground-500">
                    紐付け商品
                  </span>
                  {linked ? (
                    <>
                      <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-primary-100 px-2.5 py-1 text-[11px] font-bold text-primary-700">
                        <i className="ri-link w-3 h-3 flex items-center justify-center"></i>
                        <span className="max-w-[220px] truncate">
                          {line.product_name || line.product_id}
                        </span>
                        <span className="font-mono text-[10px] opacity-80">
                          {line.product_id}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onUnlink(line)}
                        disabled={disabled || busy || !line.link_id}
                        className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 py-1 text-[11px] font-medium text-foreground-600 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <i className="ri-link-unlink w-3 h-3 flex items-center justify-center"></i>
                        解除
                      </button>
                    </>
                  ) : (
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
                  )}

                  {/* 割当金額（明細金額が未入力の場合に必要） */}
                  <label className="ml-auto flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-foreground-500">
                      割当金額
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={getAllocatedText(line)}
                      disabled={disabled || busy}
                      onChange={(e) =>
                        setAllocatedText((prev) => ({
                          ...prev,
                          [line.line_id]: e.target.value.replace(/[^0-9]/g, ""),
                        }))
                      }
                      placeholder="明細金額を使用"
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
                        onLink(line, product, getAllocatedText(line));
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