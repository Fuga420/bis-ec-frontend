import {
  MAX_AI_BATCH_SIZE,
  MIN_COST_MARKUP_RATE_MAX,
} from "@/pages/products/lib/aiBatch";

interface AiBatchConfirmModalProps {
  open: boolean;
  count: number;
  isBusy: boolean;
  errorMessage?: string;
  // 概算原価への最低上乗せ率（「30」のような％表記の文字列）。
  // 小数（0より大きく5.0以下）への変換は送信時に行う。
  minMarkupPercent: string;
  onMinMarkupPercentChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

// 許容範囲は GAS v103 契約（0 < min_cost_markup_rate <= 5.0）に合わせる。
const MAX_MARKUP_PERCENT = MIN_COST_MARKUP_RATE_MAX * 100;

/** 入力された％表記を検証する（0％より大きく500％以下のみ受ける）。 */
export function parseMinMarkupPercent(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const percent = Number(trimmed);
  if (!Number.isFinite(percent)) return null;
  if (!(percent > 0) || percent > MAX_MARKUP_PERCENT) return null;
  return percent;
}

export default function AiBatchConfirmModal({
  open,
  count,
  isBusy,
  errorMessage,
  minMarkupPercent,
  onMinMarkupPercentChange,
  onCancel,
  onConfirm,
}: AiBatchConfirmModalProps) {
  if (!open) return null;

  const tooMany = count > MAX_AI_BATCH_SIZE;
  const markupPercent = parseMinMarkupPercent(minMarkupPercent);
  const markupError =
    markupPercent === null
      ? `概算原価への最低上乗せ率は 0％より大きく ${MAX_MARKUP_PERCENT}％ 以下の数値で入力してください。`
      : "";
  const canRun = count > 0 && !tooMany && !isBusy && !markupError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-background-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <i className="ri-sparkling-line w-5 h-5 flex items-center justify-center text-accent-600"></i>
          <h3 className="text-base font-bold text-foreground-950">
            一括AI生成の確認
          </h3>
        </div>
        <p className="mt-3 text-sm text-foreground-700">
          選択中の <span className="font-bold">{count}</span> 件を一括で受付します。サーバー側が順次生成し、画面を閉じても処理は継続します。
        </p>

        {/* 概算原価への最低上乗せ率: 下限価格 = 概算原価 × (1 + 上乗せ率)。 */}
        <div className="mt-4 rounded-lg border border-background-200 bg-background-50 px-3 py-3">
          <label
            htmlFor="ai-batch-min-markup"
            className="text-[13px] font-semibold text-foreground-900"
          >
            概算原価への最低上乗せ率（％）
          </label>
          <div className="mt-2 flex items-center gap-2">
            <div className="relative w-28">
              <input
                id="ai-batch-min-markup"
                type="text"
                inputMode="decimal"
                value={minMarkupPercent}
                disabled={isBusy}
                onChange={(e) =>
                  onMinMarkupPercentChange(
                    e.target.value.replace(/[^0-9.]/g, "")
                  )
                }
                aria-invalid={Boolean(markupError)}
                className="h-9 w-full rounded-md border border-background-300 bg-white py-1.5 pl-3 pr-8 text-sm tabular-nums text-foreground-950 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-foreground-500">
                ％
              </span>
            </div>
            <span className="text-[11px] text-foreground-500">
              初期値 30％
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-foreground-500">
            下限価格は「概算原価 ×（1 + 上乗せ率）」を切り上げた金額です。相場がそれを上回る場合は相場価格を提案します。原価は確定済みの仕入明細からの概算で、税額が未確認の明細を含む場合があります。
          </p>
          {markupError && (
            <p className="mt-1.5 text-[11px] font-medium text-red-700">
              {markupError}
            </p>
          )}
        </div>

        {tooMany ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
            <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
            一度に受付できるのは最大 {MAX_AI_BATCH_SIZE} 件です。選択を減らしてください。
          </p>
        ) : (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-background-100 px-3 py-2 text-xs leading-relaxed text-foreground-600">
            <i className="ri-information-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
            生成結果は候補として保存されます（確定・公開・Square登録は行いません）。約5秒間隔で進捗を確認し、失敗した商品のみ後から再実行できます。
          </p>
        )}

        {errorMessage && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
            <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
            {errorMessage}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canRun}
            className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-accent-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? (
              <>
                <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                受付中...
              </>
            ) : (
              "受付する"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}