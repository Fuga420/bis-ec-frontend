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

/**
 * 一括AI生成の確認モーダル。
 *
 * 表示順は「実行方法 → 対象商品 → 開始日時（予約時のみ）→ 対象商品一覧（折りたたみ）
 * → 最低上乗せ率 → オプション」とし、確認画面として必要な情報だけを上から並べる。
 * 長い説明は折りたたみへ移し、ヘッダー／フッターは固定して中央だけをスクロールさせる。
 * 受付・予約・日時計算・検証の処理には関与しない（表示構造のみ）。
 */
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
  // 対象商品一覧は初期状態で折りたたむ（件数だけを1行で見せる）
  const [isTargetListOpen, setIsTargetListOpen] = useState(false);
  // テストモードの詳しい説明は必要時だけ展開する
  const [isTestNoteOpen, setIsTestNoteOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);

  // モーダルを開き直すたびに初期値を現在基準の日本時間へ更新する
  useEffect(() => {
    if (open) {
      setTiming("immediate");
      setScheduledAtLocal(buildDefaultJstDateTimeLocal());
      setForceRegenerate(false);
      setIsTargetListOpen(false);
      setIsTestNoteOpen(false);
      setIsNotesOpen(false);
    }
  }, [open]);

  // モーダル表示中は背景ページのスクロールを止め、中央の内容だけをスクロールさせる
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
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
      ? `0％より大きく ${MAX_MARKUP_PERCENT}％ 以下の数値で入力してください。`
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

  const segmentBase =
    "flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const segmentOn = "border-background-200 bg-white text-foreground-950";
  const segmentOff =
    "border-transparent bg-transparent text-foreground-600 hover:text-foreground-900";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="一括AI生成"
    >
      <div
        className={`products-theme admin-font ${adminThemeClass(
          isTestMode || testOnly
        )} flex max-h-[90vh] w-full max-w-[760px] flex-col overflow-hidden rounded-lg border border-background-200 bg-white`}
      >
        {/* ヘッダー（固定） */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-background-200 px-6">
          <h3 className="admin-title min-w-0 truncate text-[15px] font-semibold leading-[1.4] text-foreground-950">
            一括AI生成
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            aria-label="閉じる"
            title="閉じる"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[16px] leading-none text-foreground-400 transition-colors hover:bg-background-100 hover:text-foreground-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="ri-close-line"></i>
          </button>
        </div>

        {/* 内容（この領域だけスクロールする） */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          {/* 実行方法 */}
          <div
            role="radiogroup"
            aria-label="実行タイミング"
            className="grid grid-cols-2 gap-1 rounded-lg bg-background-100 p-1"
          >
            <button
              type="button"
              role="radio"
              aria-checked={timing === "immediate"}
              disabled={isBusy}
              onClick={() => setTiming("immediate")}
              className={`${segmentBase} ${
                timing === "immediate" ? segmentOn : segmentOff
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
              className={`${segmentBase} ${
                timing === "scheduled" ? segmentOn : segmentOff
              }`}
            >
              <i className="ri-calendar-schedule-line flex h-4 w-4 items-center justify-center text-[15px]"></i>
              日時を指定して予約
            </button>
          </div>

          {/* 対象商品の概要 */}
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="admin-meta text-foreground-600">
              対象商品{" "}
              <span className="admin-numeric text-[15px] font-semibold leading-none text-foreground-950">
                {count}
              </span>{" "}
              件
            </p>
            {testOnly && (
              <span className="st-badge tone-warning">テスト商品専用</span>
            )}
            <p className="admin-meta ml-auto text-[11px] text-foreground-400">
              商品IDを固定（自動追加・差替なし）
            </p>
          </div>

          {/* テストモードの注意（概要1行＋必要時のみ展開） */}
          {testOnly && (
            <div className="mt-2 rounded-md border border-background-200 bg-background-50 px-3 py-2">
              <div className="flex items-start gap-2">
                <i className="ri-flask-line mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-[14px] text-foreground-500"></i>
                <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-foreground-600">
                  対象IDがすべてテスト商品であることを、予約時・実行時の両方で確認します。実商品が混じる場合は拒否・除外されます。
                </p>
                <button
                  type="button"
                  onClick={() => setIsTestNoteOpen((v) => !v)}
                  aria-expanded={isTestNoteOpen}
                  className="shrink-0 cursor-pointer whitespace-nowrap text-[11px] font-medium text-foreground-500 underline-offset-2 transition-colors hover:text-foreground-800 hover:underline"
                >
                  {isTestNoteOpen ? "閉じる" : "詳細"}
                </button>
              </div>
              {isTestNoteOpen && (
                <p className="mt-1.5 border-t border-background-200 pt-1.5 text-[11px] leading-relaxed text-foreground-500">
                  テスト商品専用モード：予約時・実行時の両方で対象IDがすべてテスト商品（is_test=true）であることを確認し、実商品が混じる場合は拒否・除外します。テーマはテストモードのダーク表示に追従します。
                </p>
              )}
            </div>
          )}

          {/* 開始日時（日時指定のときだけ表示） */}
          {timing === "scheduled" && (
            <div className="mt-3 rounded-md border border-background-200 bg-background-50 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="ai-batch-scheduled-at"
                  className="text-[12px] font-semibold text-foreground-900"
                >
                  開始日時（JST）
                </label>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      setScheduledAtLocal(buildPresetJstDateTimeLocal("in_10m"))
                    }
                    className="h-6 cursor-pointer whitespace-nowrap rounded border border-background-300 bg-white px-2 text-[11px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="h-6 cursor-pointer whitespace-nowrap rounded border border-background-300 bg-white px-2 text-[11px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    23:00
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      setScheduledAtLocal(buildPresetJstDateTimeLocal("next_02"))
                    }
                    className="h-6 cursor-pointer whitespace-nowrap rounded border border-background-300 bg-white px-2 text-[11px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    翌02:00
                  </button>
                </div>
              </div>

              <input
                id="ai-batch-scheduled-at"
                type="datetime-local"
                value={scheduledAtLocal}
                disabled={isBusy}
                onChange={(e) => setScheduledAtLocal(e.target.value)}
                aria-invalid={Boolean(scheduleError)}
                className="admin-numeric mt-2 h-10 w-full rounded-md border border-background-300 bg-white px-3 text-sm text-foreground-950 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50"
              />

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
              <p className="mt-1.5 text-[11px] leading-relaxed text-foreground-500">
                約1分間隔の定期確認で開始します。開始前であれば結果画面から予約を取り消せます。
              </p>
            </div>
          )}

          {/* 対象商品一覧（初期は折りたたみ） */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setIsTargetListOpen((v) => !v)}
              aria-expanded={isTargetListOpen}
              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-background-200 bg-background-50 px-3 py-2 text-left transition-colors hover:bg-background-100"
            >
              <span className="admin-meta min-w-0 truncate text-foreground-700">
                対象商品{" "}
                <span className="admin-numeric font-semibold text-foreground-950">
                  {targets.length}
                </span>{" "}
                件・
                {isTargetListOpen ? "一覧を閉じる" : "一覧を確認"}
              </span>
              <i
                className={`${
                  isTargetListOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"
                } flex h-4 w-4 shrink-0 items-center justify-center text-[15px] text-foreground-400`}
              ></i>
            </button>

            {isTargetListOpen && (
              <div className="mt-1.5 max-h-52 overflow-y-auto overscroll-contain rounded-md border border-background-200 bg-background-50 px-2.5 py-1.5">
                {targets.length === 0 ? (
                  <p className="py-3 text-center text-[11px] text-foreground-500">
                    対象商品が選択されていません。
                  </p>
                ) : (
                  targets.map((t, idx) => (
                    <div
                      key={t.product_id}
                      className="flex items-baseline gap-2 py-0.5 text-[11px] leading-snug"
                    >
                      <span className="admin-numeric w-5 shrink-0 text-right text-foreground-400">
                        {idx + 1}.
                      </span>
                      <span className="admin-numeric shrink-0 font-medium text-foreground-800">
                        {t.product_id}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-foreground-500">
                        {t.product_name || "商品名未入力"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 最低上乗せ率 */}
          <div className="mt-3 rounded-md border border-background-200 bg-background-50 px-3 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label
                htmlFor="ai-batch-min-markup"
                className="text-[12px] font-semibold text-foreground-900"
              >
                最低上乗せ率
              </label>
              <div className="relative w-[112px]">
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
                  className="admin-numeric h-9 w-full rounded-md border border-background-300 bg-white py-1.5 pl-3 pr-7 text-sm text-foreground-950 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-foreground-500">
                  ％
                </span>
              </div>
              <span className="admin-meta text-[11px] text-foreground-500">
                初期値 30％
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-foreground-500">
              下限価格＝概算原価×（1＋上乗せ率）。原価は実行時に仕入明細から取得します。
            </p>
            {markupError && (
              <p className="mt-1.5 text-[11px] font-medium text-red-700">
                {markupError}
              </p>
            )}
          </div>

          {/* 再生成オプション */}
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-md border border-background-200 bg-white px-3 py-2.5">
            <input
              type="checkbox"
              checked={forceRegenerate}
              disabled={isBusy}
              onChange={(e) => setForceRegenerate(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer rounded border-background-300 text-primary-600 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-foreground-900">
                生成済みのAI下書きがある商品も再生成する
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-foreground-500">
                予約中・処理待ち・処理中の商品は重複防止のため受付できません。
              </span>
            </span>
          </label>

          {/* 注意事項（必要なときだけ展開） */}
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setIsNotesOpen((v) => !v)}
              aria-expanded={isNotesOpen}
              className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-foreground-500 transition-colors hover:text-foreground-800"
            >
              <i className="ri-information-line flex h-3.5 w-3.5 items-center justify-center text-[13px]"></i>
              実行時の注意事項
              <i
                className={`${
                  isNotesOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"
                } flex h-3.5 w-3.5 items-center justify-center text-[13px]`}
              ></i>
            </button>
            {isNotesOpen && (
              <p className="mt-1.5 rounded-md bg-background-100 px-3 py-2 text-[11px] leading-relaxed text-foreground-600">
                {timing === "scheduled"
                  ? "開始前に公開済み・アーカイブ済み・画像なし等になった商品は理由を記録して対象外にします（代わりの商品は自動選定しません）。生成結果は下書き保存までとし、自動公開・Square連携は行いません。"
                  : "完了した商品は下書き商品へ自動反映されます（公開・Square登録は行いません）。約5秒間隔で進捗を確認し、失敗した商品のみ後から再実行できます。"}
              </p>
            )}
          </div>

          {tooMany && (
            <p className="mt-3 flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-700">
              <i className="ri-error-warning-line mt-0.5 flex h-4 w-4 items-center justify-center"></i>
              一度に受付・予約できるのは最大 {MAX_AI_BATCH_SIZE} 件です。選択を減らしてください。
            </p>
          )}

          {errorMessage && (
            <p className="mt-3 flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-700">
              <i className="ri-error-warning-line mt-0.5 flex h-4 w-4 items-center justify-center"></i>
              {errorMessage}
            </p>
          )}
        </div>

        {/* フッター（固定） */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-background-200 px-6 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="inline-flex h-10 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-background-300 bg-white px-4 text-[13px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary-500 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? (
              <>
                <i className="ri-loader-4-line flex h-4 w-4 animate-spin items-center justify-center text-[15px]"></i>
                {timing === "scheduled" ? "予約中..." : "実行中..."}
              </>
            ) : timing === "scheduled" ? (
              "予約する"
            ) : (
              "実行する"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}