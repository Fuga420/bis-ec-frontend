import { useEffect, useState } from "react";

interface DocumentTotalsProps {
  // 原本合計（原本に印字された合計額）
  originalTotal: number;
  // 明細合計（明細行の合計）
  lineTotalValue: number;
  // 原本合計を手入力で修正できるようにするか
  editable?: boolean;
  onOriginalTotalChange?: (value: number) => void;
}

function formatYen(value: number): string {
  return `¥${(Number(value) || 0).toLocaleString("ja-JP")}`;
}

/**
 * 原本合計・明細合計・差額の表示。
 * 差額が0なら一致（グリーン）、0以外なら不一致（注意色）として表示する。
 */
export default function DocumentTotals({
  originalTotal,
  lineTotalValue,
  editable = false,
  onOriginalTotalChange,
}: DocumentTotalsProps) {
  const [input, setInput] = useState(String(originalTotal ?? 0));

  // 親の値が変わったら入力欄を同期する。
  useEffect(() => {
    setInput(String(originalTotal ?? 0));
  }, [originalTotal]);

  const difference = (Number(originalTotal) || 0) - (Number(lineTotalValue) || 0);
  const isBalanced = difference === 0;

  const handleInput = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    setInput(digits);
    onOriginalTotalChange?.(digits === "" ? 0 : Number(digits));
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {/* 原本合計 */}
      <div className="rounded-lg border border-background-200 bg-background-50 px-4 py-3">
        <p className="flex items-center gap-1.5 text-xs text-foreground-500">
          <i className="ri-file-text-line w-3.5 h-3.5 flex items-center justify-center"></i>
          原本合計
        </p>
        {editable ? (
          <div className="mt-1.5 flex items-center gap-1">
            <span className="text-sm text-foreground-500">¥</span>
            <input
              type="text"
              inputMode="numeric"
              value={input === "0" ? "" : input}
              placeholder="0"
              onChange={(e) => handleInput(e.target.value)}
              aria-label="原本合計"
              className="h-9 w-full rounded-md border border-background-300 bg-white px-3 text-sm font-semibold tabular-nums text-foreground-950 placeholder:text-foreground-300 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </div>
        ) : (
          <p className="mt-1.5 text-lg font-bold tabular-nums text-foreground-950">
            {formatYen(originalTotal)}
          </p>
        )}
      </div>

      {/* 明細合計 */}
      <div className="rounded-lg border border-background-200 bg-background-50 px-4 py-3">
        <p className="flex items-center gap-1.5 text-xs text-foreground-500">
          <i className="ri-list-check-2 w-3.5 h-3.5 flex items-center justify-center"></i>
          明細合計
        </p>
        <p className="mt-1.5 text-lg font-bold tabular-nums text-foreground-950">
          {formatYen(lineTotalValue)}
        </p>
      </div>

      {/* 差額 */}
      <div
        className={`rounded-lg border px-4 py-3 ${
          isBalanced
            ? "border-primary-200 bg-primary-50"
            : "border-amber-300 bg-amber-50"
        }`}
      >
        <p className="flex items-center gap-1.5 text-xs text-foreground-500">
          <i className="ri-scales-3-line w-3.5 h-3.5 flex items-center justify-center"></i>
          差額（原本 − 明細）
        </p>
        <p
          className={`mt-1.5 text-lg font-bold tabular-nums ${
            isBalanced ? "text-primary-700" : "text-amber-800"
          }`}
        >
          {isBalanced ? "¥0（一致）" : `${difference < 0 ? "-" : ""}${formatYen(Math.abs(difference))}`}
        </p>
      </div>
    </div>
  );
}