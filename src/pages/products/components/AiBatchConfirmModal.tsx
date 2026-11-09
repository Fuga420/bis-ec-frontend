import { useEffect, useMemo, useState } from "react";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import { adminThemeClass } from "@/lib/adminTheme";
import {
  MAX_AI_BATCH_SIZE,
  MIN_COST_MARKUP_RATE_MAX,
  buildDefaultJstDateTimeLocal,
  buildPresetJstDateTimeLocal,
  formatJstDateTime,
  parseJstDateTimeLocalToIso,
} from "@/pages/products/lib/aiBatch";
import type { AiBatchTarget } from "@/pages/products/types";

export type AiBatchExecutionTiming = "immediate" | "scheduled";

interface AiBatchConfirmModalProps {
  open: boolean;
  count: number;
  targets: AiBatchTarget[];
  isBusy: boolean;
  errorMessage?: string;
  // 概算原価への最低上乗せ率（「30」のような％表記の文字列）。
  // 小数（0より大きく5.0以下）への変換は送信時に行う。
  minMarkupPercent: string;
  onMinMarkupPercentChange: (value: string) => void;
  onCancel: () => void;
  testOnly?: boolean;
  onConfirmImmediate: (forceRegenerate: boolean) => void | Promise<void>;
  onConfirmSchedule: (
    scheduledAtIso: string,
    forceRegenerate: boolean
  ) => void | Promise<void>;
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
  targets,
  isBusy,
  errorMessage,
  minMarkupPercent,
  onMinMarkupPercentChange,
  onCancel,
  onConfirmImmediate,
  onConfirmSchedule,
  testOnly = false,
}: AiBatchConfirmModalProps) {
  const { isTestMode } = useOperatingMode();
  const [timing, setTiming] = useState<AiBatchExecutionTiming>("immediate");
  const [scheduledAtLocal, setScheduledAtLocal] = useState<string>(() =>
    buildDefaultJstDateTimeLocal()
  );
  const [forceRegenerate, setForceRegenerate] = useState(false);

  // モーダルを開き直すたびに初期値を現在基準の日本時間へ更新する
  useEffect(() => {
    if (open) {
      setTiming("immediate");
      setScheduledAtLocal(buildDefaultJstDateTimeLocal());
      setForceRegenerate(false);
    }
  }, [open]);

  const parsedSchedule = useMemo(() => {
    if (timing !== "scheduled") {
      return { iso: null, error: "", formattedJst: "" };
    }
    const res = parseJstDateTimeLocalToIso(scheduledAtLocal);
    return {
      iso: res.iso,
      error: res.error,
      formattedJst: res.iso ? formatJstDateTime(res.iso) : "",
    };
  }, [timing, scheduledAtLocal]);

  if (!open) return null;

  const tooMany = count > MAX_AI_BATCH_SIZE;
  const markupPercent = parseMinMarkupPercent(minMarkupPercent);
  const markupError =
    markupPercent === null
      ? `概算原価への最低上乗せ率は 0％より大きく ${MAX_MARKUP_PERCENT}％ 以下の数値で入力してください。`
      : "";

  const scheduleError = timing === "scheduled" ? parsedSchedule.error : "";
  const canSubmit =
    count > 0 && !tooMany && !isBusy && !markupError && !scheduleError;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (timing === "scheduled") {
      if (!parsedSchedule.iso) return;
      void onConfirmSchedule(parsedSchedule.iso, forceRegenerate);
      return;
    }
    void onConfirmImmediate(forceRegenerate);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={`products-theme admin-font ${adminThemeClass(
          isTestMode || testOnly
        )} flex max-h-[calc(100vh-32px)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-background-200 bg-white`}
      >
        <div className="overflow-y-auto p-5">
          <div className="flex items-center gap-2">
            <i className="ri-sparkling-line w-5 h-5 flex items-center justify-center text-accent-600"></i>
            <h3 className="text-[16px] font-semibold leading-[1.4] text-foreground-950">
              一括AI生成の確認
            </h3>
          </div>

          {/* 実行方法の切替（今すぐ実行 / 日時を指定して予約） */}
          <div
            role="radiogroup"
            aria-label="実行タイミング"
            className="mt-3.5 grid grid-cols-2 gap-1 rounded-lg bg-background-100 p-1"
          >
            <button
              type="button"
              role="radio"
              aria-checked={timing === "immediate"}
              disabled={isBusy}
              onClick={() => setTiming("immediate")}
              className={`flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                timing === "immediate"
                  ? "bg-white text-foreground-950 shadow-sm"
                  : "text-foreground-600 hover:text-foreground-900"
              }`}
            >
              <i className="ri-play-circle-line flex h-4 w-4 items-center justify-center text-[15px]"></i>
              今すぐ実行
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={timing === "scheduled"}
              disabled={isBusy}
              onClick={() => setTiming("scheduled")}
              className={`flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                timing === "scheduled"
                  ? "bg-white text-foreground-950 shadow-sm"
                  : "text-foreground-600 hover:text-foreground-900"
              }`}
            >
              <i className="ri-calendar-schedule-line flex h-4 w-4 items-center justify-center text-[15px]"></i>
              日時を指定して予約
            </button>
          </div>

          <p className="mt-3 text-sm text-foreground-700">
            {timing === "scheduled" ? (
              <>
                選択中の <span className="font-bold">{count}</span>{" "}
                件の商品IDを固定して予約します。予約後はPC・ブラウザを閉じても指定時刻以降にサーバーが処理します。
              </>
            ) : (
              <>
                選択中の <span className="font-bold">{count}</span>{" "}
                件を一括で受付します。サーバー側が順次生成し、画面を閉じても処理は継続します。
              </>
            )}
          </p>

          {testOnly && (
            <p className="mt-2.5 flex items-start gap-1.5 rounded-md border border-background-200 bg-background-100 px-3 py-2 text-xs leading-relaxed text-foreground-700">
              <i className="ri-flask-line mt-0.5 w-4 h-4 flex items-center justify-center text-foreground-600"></i>
              テスト商品専用モード：予約時・実行時の両方で対象IDがすべてテスト商品（is_test=true）であることを確認し、実商品が混じる場合は拒否・除外します。
            </p>
          )}

          {/* 日時指定セクション（予約選択時のみ） */}
          {timing === "scheduled" && (
            <div className="mt-3.5 rounded-lg border border-background-200 bg-background-50 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="ai-batch-scheduled-at"
                  className="text-[13px] font-semibold text-foreground-900"
                >
                  開始日時（日本時間 JST）
                </label>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      setScheduledAtLocal(buildPresetJstDateTimeLocal("in_10m"))
                    }
                    className="h-6 cursor-pointer rounded border border-background-300 bg-white px-2 text-[11px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:opacity-50"
                  >
                    10分後
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      setScheduledAtLocal(
                        buildPresetJstDateTimeLocal("tonight_23")
                      )
                    }
                    className="h-6 cursor-pointer rounded border border-background-300 bg-white px-2 text-[11px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:opacity-50"
                  >
                    23:00
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      setScheduledAtLocal(buildPresetJstDateTimeLocal("next_02"))
                    }
                    className="h-6 cursor-pointer rounded border border-background-300 bg-white px-2 text-[11px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:opacity-50"
                  >
                    翌 02:00
                  </button>
                </div>
              </div>

              <div className="mt-2">
                <input
                  id="ai-batch-scheduled-at"
                  type="datetime-local"
                  value={scheduledAtLocal}
                  disabled={isBusy}
                  onChange={(e) => setScheduledAtLocal(e.target.value)}
                  aria-invalid={Boolean(scheduleError)}
                  className="h-9 w-full rounded-md border border-background-300 bg-white px-3 text-sm tabular-nums text-foreground-950 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              {parsedSchedule.formattedJst && !scheduleError && (
                <p className="mt-1.5 text-[12px] font-medium text-primary-700">
                  開始予定: {parsedSchedule.formattedJst}
                </p>
              )}
              {scheduleError && (
                <p className="mt-1.5 text-[11px] font-medium text-red-700">
                  {scheduleError}
                </p>
              )}
              <p className="mt-1 text-[11px] leading-relaxed text-foreground-500">
                約1分間隔の定期確認で開始します。開始前であれば結果画面から予約を取り消せます。
              </p>
            </div>
          )}

          {/* 選択済み商品IDの確認（固定保存対象） */}
          {targets.length > 0 && (
            <div className="mt-3.5 rounded-lg border border-background-200 bg-white px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-foreground-800">
                  対象商品の確認（商品ID固定: {targets.length}件）
                </span>
                <span className="text-[11px] text-foreground-400">
                  自動追加・差替なし
                </span>
              </div>
              <div className="mt-1.5 max-h-28 overflow-y-auto rounded border border-background-200 bg-background-50 px-2.5 py-1.5">
                {targets.map((t, idx) => (
                  <div
                    key={t.product_id}
                    className="flex items-baseline gap-2 py-0.5 text-[11px] leading-snug"
                  >
                    <span className="w-5 shrink-0 text-right tabular-nums text-foreground-400">
                      {idx + 1}.
                    </span>
                    <span className="shrink-0 font-mono font-medium text-foreground-800">
                      {t.product_id}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground-500">
                      {t.product_name || "商品名未入力"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 概算原価への最低上乗せ率: 下限価格 = 概算原価 × (1 + 上乗せ率)。 */}
          <div className="mt-3.5 rounded-lg border border-background-200 bg-background-50 px-3 py-3">
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
              下限価格は「概算原価 ×（1 + 上乗せ率）」を切り上げた金額です。原価は実行時にサーバー側で確定済み仕入明細から取得します（取得失敗時は原価なし扱いせず中断します）。
            </p>
            {markupError && (
              <p className="mt-1.5 text-[11px] font-medium text-red-700">
                {markupError}
              </p>
            )}
          </div>

          {/* 完了済み商品の意図的な再生成オプション */}
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-background-200 bg-white px-3 py-2.5">
            <input
              type="checkbox"
              checked={forceRegenerate}
              disabled={isBusy}
              onChange={(e) => setForceRegenerate(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-background-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-foreground-900">
                生成済みのAI下書きがある商品も再生成する
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-foreground-500">
                完了後の商品を意図的に再生成・上書きする場合に選択します（予約中・処理待ち・処理中の商品は重複防止のため受付できません）。
              </span>
            </span>
          </label>

          {tooMany ? (
            <p className="mt-3 flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
              <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
              一度に受付・予約できるのは最大 {MAX_AI_BATCH_SIZE}{" "}
              件です。選択を減らしてください。
            </p>
          ) : (
            <p className="mt-3 flex items-start gap-1.5 rounded-md bg-background-100 px-3 py-2 text-xs leading-relaxed text-foreground-600">
              <i className="ri-information-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
              {timing === "scheduled"
                ? "開始前に公開済み・アーカイブ済み・画像なし等になった商品は理由を記録して対象外にします（代わりの商品は自動選定しません）。生成結果は下書き保存までとし、自動公開・Square連携は行いません。"
                : "完了した商品は下書き商品へ自動反映されます（公開・Square登録は行いません）。約5秒間隔で進捗を確認し、失敗した商品のみ後から再実行できます。"}
            </p>
          )}

          {errorMessage && (
            <p className="mt-3 flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
              <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
              {errorMessage}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-background-200 bg-white px-5 py-3.5">
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
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-accent-500 px-4 py-2 text-sm font-bold text-accent-950 transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? (
              <>
                <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                {timing === "scheduled" ? "予約中..." : "受付中..."}
              </>
            ) : timing === "scheduled" ? (
              "予約する"
            ) : (
              "受付する"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
