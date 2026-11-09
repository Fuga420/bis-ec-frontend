import { useEffect, useMemo, useState } from "react";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import { adminThemeClass } from "@/lib/adminTheme";
import type {
  AiBatchDisplayItem,
  AiBatchDisplayStatus,
  AiBatchOverallStatus,
  AiBatchRunSummary,
} from "@/pages/products/types";
import {
  AI_BATCH_STATUS_LABELS,
  deriveAiBatchDisplayStatus,
  formatJstDateTime,
  isTerminalBatchStatus,
} from "@/pages/products/lib/aiBatch";
import AiBatchResultRow from "@/pages/products/components/AiBatchResultRow";

interface AiBatchResultModalProps {
  open: boolean;
  items: AiBatchDisplayItem[] | null;
  batchStatus: AiBatchOverallStatus | null;
  batchId: string | null;
  scheduleId: string | null;
  activeRunKey: string | null;
  scheduledAt: string | null;
  createdAt: string | null;
  canCancelSchedule: boolean;
  dispatchErrorMessage: string;
  runs: AiBatchRunSummary[];
  isPolling: boolean;
  isSubmitting: boolean;
  isCancelling: boolean;
  pollError: string;
  errorMessage: string;
  onSelectRun: (runKey: string) => Promise<void> | void;
  onCancelSchedule: () => Promise<void> | void;
  onRetryFailed: () => void;
  onClose: () => void;
}

type ResultFilter = "all" | "success" | "failed" | "excluded" | "review";

function createEmptyCounts(): Record<AiBatchDisplayStatus, number> {
  return {
    pending: 0,
    retry_wait: 0,
    processing: 0,
    success: 0,
    failed: 0,
    excluded: 0,
    cancelled: 0,
    contract_violation: 0,
  };
}

// 件数の集計表示。大きな色付きカードは使わず、見出しラベル＋数字の横並びだけにする。
function StatBlock({
  label,
  value,
  total,
  valueClassName,
}: {
  label: string;
  value: number;
  total?: number;
  valueClassName: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] leading-none text-foreground-500">{label}</p>
      <p className="mt-2 flex items-baseline gap-1">
        <span
          className={`admin-numeric text-[20px] font-semibold leading-none tracking-tight ${valueClassName}`}
        >
          {value}
        </span>
        {total != null && (
          <span className="admin-numeric text-[11px] leading-none text-foreground-400">
            / {total}
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * AI一括生成の「予約・進捗・結果」モーダル。
 *
 * 商品一覧・商品詳細と同じ業務管理UI（白 / ニュートラルグレー / 深緑）に揃える。
 *  - ヘッダー：見出し＋全体状態＋閉じる
 *  - 予約・実行情報：開始予定日時（日本時間）・実行/予約履歴切替・開始時エラー
 *  - 集計：反映完了・失敗・処理中・対象外を優先し、受付待ち・再試行待ち・要確認は補助行
 *  - リスト：商品ごとの状態（対象外理由を含む）を文字と控えめな色で示す（ここだけスクロール）
 *  - フッター：開始前なら「予約を取り消す」、完了後なら「失敗のみ再実行」／閉じる
 *
 * 件数・割合はすべて API 応答（items[] の状態）の集計のみで、架空の進捗は使わない。
 */
export default function AiBatchResultModal({
  open,
  items,
  batchStatus,
  batchId,
  scheduleId,
  activeRunKey,
  scheduledAt,
  createdAt,
  canCancelSchedule,
  dispatchErrorMessage,
  runs,
  isPolling,
  isSubmitting,
  isCancelling,
  pollError,
  errorMessage,
  onSelectRun,
  onCancelSchedule,
  onRetryFailed,
  onClose,
}: AiBatchResultModalProps) {
  const { isTestMode } = useOperatingMode();
  const [filter, setFilter] = useState<ResultFilter>("all");

  // 開き直したとき・表示対象ジョブを切り替えたときは絞り込みを解除する（前回の絞り込みで商品が見えない誤解を防ぐ）
  useEffect(() => {
    if (!open) setFilter("all");
  }, [open, activeRunKey]);

  const counts = useMemo(() => {
    const result = createEmptyCounts();
    (items ?? []).forEach((item) => {
      result[deriveAiBatchDisplayStatus(item)] += 1;
    });
    return result;
  }, [items]);

  const total = items?.length ?? 0;
  // 確定済み＝この時点で結果が確定している件数（成功・失敗・対象外・取消・要確認）
  const confirmed =
    counts.success +
    counts.failed +
    counts.excluded +
    counts.cancelled +
    counts.contract_violation;
  const confirmedRatio = total > 0 ? Math.min(1, confirmed / total) : 0;

  const terminal = isTerminalBatchStatus(batchStatus);
  const isWaitingSchedule =
    batchStatus === "scheduled" ||
    batchStatus === "starting" ||
    batchStatus === "dispatch_retry";
  const isCancelled = batchStatus === "cancelled";
  const hasFailure = counts.failed > 0 || batchStatus === "failed";
  const hasExcluded = counts.excluded > 0;
  const needsReview = counts.contract_violation > 0;
  const warning = dispatchErrorMessage || pollError || errorMessage;

  const visibleItems = useMemo(() => {
    const source = items ?? [];
    if ((!terminal && !hasExcluded) || filter === "all") return source;
    return source.filter((item) => {
      const status = deriveAiBatchDisplayStatus(item);
      if (filter === "success") return status === "success";
      if (filter === "failed") return status === "failed";
      if (filter === "excluded") return status === "excluded";
      return status === "contract_violation";
    });
  }, [items, filter, terminal, hasExcluded]);

  if (!open || !items) return null;

  const subtitle = isWaitingSchedule
    ? "開始予定時刻になると、PC・ブラウザを閉じていてもサーバー側で順次生成します"
    : isCancelled
      ? "この予約は開始前に取り消されました（AI生成は実行されていません）"
      : terminal
        ? "下書きへの反映結果と対象外商品を確認できます"
        : "完了した商品から順に下書きへ反映されます";

  const overallChipClass =
    batchStatus === "dispatch_retry"
      ? "tone-warning"
      : isCancelled
        ? "tone-neutral"
        : terminal
          ? hasFailure || needsReview
            ? "tone-warning"
            : "tone-success"
          : "tone-ai";

  const filterChips: { key: ResultFilter; label: string; count: number }[] = [
    { key: "all", label: "すべて", count: total },
    { key: "success", label: "反映完了", count: counts.success },
    { key: "failed", label: "失敗", count: counts.failed },
  ];
  if (hasExcluded) {
    filterChips.push({
      key: "excluded",
      label: "対象外",
      count: counts.excluded,
    });
  }
  if (needsReview) {
    filterChips.push({
      key: "review",
      label: "要確認",
      count: counts.contract_violation,
    });
  }

  const formattedScheduledAt = scheduledAt
    ? formatJstDateTime(scheduledAt)
    : "";
  const formattedCreatedAt = createdAt ? formatJstDateTime(createdAt) : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="AI一括生成の進捗・結果"
    >
      <div
        className={`products-theme admin-font ${adminThemeClass(
          isTestMode
        )} flex max-h-[calc(100vh-48px)] w-full max-w-[820px] flex-col overflow-hidden rounded-[10px] border border-background-200 bg-white`}
      >
        {/* ヘッダー（固定） */}
        <div className="flex items-start justify-between gap-4 border-b border-background-200 px-5 py-3">
          <div className="min-w-0">
            <h3 className="admin-title text-[16px] font-semibold leading-[1.4] text-foreground-950">
              {scheduleId
                ? "AI一括生成の予約・結果"
                : "AI一括生成の進捗・結果"}
            </h3>
            <p className="mt-1 truncate text-[11px] leading-none text-foreground-500">
              {subtitle}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {batchStatus && (
              <span className={`st-badge ${overallChipClass}`}>
                {AI_BATCH_STATUS_LABELS[batchStatus]}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              title="閉じる"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[16px] leading-none text-foreground-400 transition-colors hover:bg-background-100 hover:text-foreground-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-200"
            >
              <i className="ri-close-line"></i>
            </button>
          </div>
        </div>

        {/* サーバー保存の即時実行・予約情報＆履歴切替（全デバイス共通） */}
        {(activeRunKey || runs.length > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-background-200 bg-background-50 px-5 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-foreground-700">
              <span className="inline-flex items-center rounded border border-background-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-foreground-700">
                {scheduleId ? "日時予約" : "即時実行"}
              </span>
              {scheduleId && formattedScheduledAt && (
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground-900">
                  <i className="ri-calendar-schedule-line flex h-3.5 w-3.5 items-center justify-center text-foreground-500"></i>
                  開始予定: {formattedScheduledAt}
                </span>
              )}
              {!scheduleId && formattedCreatedAt && (
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground-900">
                  <i className="ri-play-circle-line flex h-3.5 w-3.5 items-center justify-center text-foreground-500"></i>
                  受付日時: {formattedCreatedAt}
                </span>
              )}
              {scheduleId ? (
                <span className="font-mono text-[11px] text-foreground-400">
                  予約ID: {scheduleId.slice(0, 8)}
                </span>
              ) : batchId ? (
                <span className="font-mono text-[11px] text-foreground-400">
                  バッチID: {batchId.slice(0, 14)}
                </span>
              ) : null}
            </div>

            {runs.length > 0 && (
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="ai-run-history-select"
                  className="whitespace-nowrap text-[11px] text-foreground-500"
                >
                  実行・予約履歴:
                </label>
                <select
                  id="ai-run-history-select"
                  value={activeRunKey ?? ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      void onSelectRun(e.target.value);
                    }
                  }}
                  className="h-7 max-w-[320px] rounded border border-background-300 bg-white px-2 text-[11px] text-foreground-900 focus:border-primary-500 focus:outline-none"
                >
                  {runs.map((r) => {
                    const timeStr =
                      r.run_type === "scheduled" && r.scheduled_at
                        ? formatJstDateTime(r.scheduled_at, {
                            withSuffix: false,
                          })
                        : formatJstDateTime(r.created_at, {
                            withSuffix: false,
                          });
                    const typePrefix =
                      r.run_type === "scheduled" ? "[予約]" : "[即時]";
                    return (
                      <option key={r.run_key} value={r.run_key}>
                        {typePrefix} {timeStr} ·{" "}
                        {AI_BATCH_STATUS_LABELS[r.overall_status]}（
                        {r.total_count}件）
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>
        )}

        {/* 集計（固定） */}
        <div className="border-b border-background-200 px-5 py-3">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
            <StatBlock
              label="反映完了"
              value={counts.success}
              total={total}
              valueClassName="text-primary-700"
            />
            <StatBlock
              label="失敗"
              value={counts.failed}
              valueClassName={
                hasFailure ? "text-amber-700" : "text-foreground-700"
              }
            />
            <StatBlock
              label={isWaitingSchedule ? "予約待機" : "処理中"}
              value={isWaitingSchedule ? counts.pending : counts.processing}
              valueClassName="text-foreground-700"
            />
            {hasExcluded && (
              <StatBlock
                label="対象外"
                value={counts.excluded}
                valueClassName="text-foreground-700"
              />
            )}
            <p className="ml-auto pb-0.5 text-right text-[10px] leading-none text-foreground-400">
              {isPolling ? "自動更新中" : terminal ? "取得完了" : ""}
            </p>
          </div>

          {/* 進捗バー：確定済み件数と総件数が取れるときのみ表示（推定値は使わない） */}
          {!terminal && !isWaitingSchedule && (
            <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-background-200">
              {total > 0 ? (
                <div
                  className="h-full rounded-full bg-primary-500 transition-[width] duration-300 ease-out"
                  style={{ width: `${confirmedRatio * 100}%` }}
                ></div>
              ) : (
                <div className="indeterminate-progress-bar h-full w-1/3 rounded-full bg-primary-400"></div>
              )}
            </div>
          )}

          {/* 補助的な内訳：受付待ち・再試行待ち・対象外・要確認も常に確認できるようにする */}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-none text-foreground-500">
            <span className="admin-numeric">
              {isWaitingSchedule ? "固定商品数" : "受付待ち"} {counts.pending}
            </span>
            {!isWaitingSchedule && (
              <span className="admin-numeric">
                再試行待ち {counts.retry_wait}
              </span>
            )}
            {hasExcluded && (
              <span className="admin-numeric font-medium text-foreground-700">
                対象外 {counts.excluded}
              </span>
            )}
            <span
              className={`admin-numeric ${
                needsReview ? "font-medium text-amber-700" : ""
              }`}
            >
              要確認 {counts.contract_violation}
            </span>
            {!terminal && !isWaitingSchedule && (
              <span className="admin-numeric text-foreground-400">
                確定済み {confirmed} / {total}
              </span>
            )}
          </p>

          {/* 補助テキスト（背景色・枠線は付けない） */}
          {terminal && !isCancelled ? (
            hasFailure || needsReview ? (
              <p className="mt-2 text-[11px] leading-relaxed text-foreground-500">
                失敗した商品は内容を確認し、必要であれば「失敗のみ再実行」で再生成できます。
                {hasExcluded
                  ? " 開始前に状態が変わった商品は理由とともに「対象外」として記録されています。"
                  : ""}
              </p>
            ) : (
              <p className="mt-2 flex items-center gap-1 text-[11px] leading-relaxed text-foreground-500">
                <i className="ri-check-line flex h-3 w-3 items-center justify-center text-[12px] text-primary-600"></i>
                {counts.success > 0
                  ? "失敗した商品はありません。完了した商品から下書きの内容を確認できます。"
                  : "処理可能な商品がありませんでした。各商品の対象外理由を確認してください。"}
              </p>
            )
          ) : null}

          {warning && (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-800">
              {warning}
              {pollError && !terminal
                ? "（表示は最後に取得できた状態です。処理は継続しています）"
                : ""}
            </p>
          )}

          {needsReview && (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-800">
              {counts.contract_violation}
              件は「status:completed と error_code
              の同時返却（GAS の契約外応答）」です。成功表示はしていませんが、GAS
              側では completed 扱いのため「失敗のみ再実行」の対象に含まれない
              可能性があります。各商品を開いて下書きの内容を確認してください。
            </p>
          )}

          <p className="mt-2 text-[10px] leading-relaxed text-foreground-400">
            完了した商品は、サーバー側で同じ商品の下書き（商品情報・英文翻訳など）へ自動反映されます（公開・Square登録は行いません）。修正は商品詳細の「商品情報を編集」から行えます。提案価格は実行時点の確定済み仕入明細からの概算原価をもとにしています（原価取得に失敗した場合は生成を進めません）。
          </p>

          {/* 完了後（または対象外発生時）は状態で絞り込める */}
          {(terminal || hasExcluded) && !isCancelled && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1">
              {filterChips.map((chip) => {
                const active = filter === chip.key;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setFilter(chip.key)}
                    aria-pressed={active}
                    className={`h-7 cursor-pointer whitespace-nowrap rounded-md border px-2.5 text-[11px] transition-colors ${
                      active
                        ? "border-primary-300 bg-primary-50 font-medium text-primary-700"
                        : "border-background-200 bg-white text-foreground-600 hover:bg-background-50"
                    }`}
                  >
                    {chip.label}
                    <span className="admin-numeric ml-1 text-foreground-400">
                      {chip.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 結果リスト（この領域だけスクロールする） */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visibleItems.length === 0 ? (
            <p className="px-5 py-10 text-center text-[12px] text-foreground-500">
              該当する商品はありません。
            </p>
          ) : (
            visibleItems.map((item) => (
              <AiBatchResultRow key={item.product_id} item={item} />
            ))
          )}
        </div>

        {/* フッター（固定） */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-background-200 px-5 py-3">
          <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-foreground-400">
            {terminal
              ? "閉じると、この結果表示は破棄されます。どのデバイスからでも「AI生成履歴・予約」から再確認できます。"
              : "この画面を閉じても処理はサーバー側で継続します。どのデバイスからでも進捗と結果を確認できます。"}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {canCancelSchedule && (
              <button
                type="button"
                onClick={() => void onCancelSchedule()}
                disabled={isCancelling || isSubmitting}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-red-200 bg-white px-3 text-[12px] font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCancelling ? (
                  <i className="ri-loader-4-line flex h-3.5 w-3.5 animate-spin items-center justify-center text-[13px]"></i>
                ) : (
                  <i className="ri-close-circle-line flex h-3.5 w-3.5 items-center justify-center text-[13px]"></i>
                )}
                予約を取り消す
              </button>
            )}
            {terminal && counts.failed > 0 && (
              <button
                type="button"
                onClick={onRetryFailed}
                disabled={isSubmitting}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-white px-3 text-[12px] font-semibold text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <i className="ri-loader-4-line flex h-3.5 w-3.5 animate-spin items-center justify-center text-[13px]"></i>
                ) : (
                  <i className="ri-refresh-line flex h-3.5 w-3.5 items-center justify-center text-[13px]"></i>
                )}
                失敗のみ再実行
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`h-8 cursor-pointer whitespace-nowrap rounded-md px-3.5 text-[12px] font-semibold transition-colors ${
                terminal && counts.failed === 0
                  ? "bg-primary-500 text-white hover:bg-primary-600"
                  : "border border-background-300 bg-white text-foreground-700 hover:bg-background-100"
              }`}
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
