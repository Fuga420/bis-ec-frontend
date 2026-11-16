import { useEffect } from "react";
import type { PokecaLightWorkerState } from "@/pages/products/lib/pokecaRawStorageAi";
import type { AdminProduct } from "@/pages/products/types";
import type { PokecaLightCoverage } from "@/pages/pokeka/lib/rawStorage";

export interface PokecaLightStatusView {
  label: string;
  tone: "idle" | "running" | "done" | "failed";
  /** 実行中の実進捗（status API の processed_count） */
  processed?: number;
  /** 対象件数（status API の total_target_products） */
  total?: number;
}

interface PokecaLightAiPanelProps {
  open: boolean;
  onClose: () => void;
  /** ストレージタブの商品（旧裏ストレージ全件）。整備状況の対象範囲の表示に使う */
  products: AdminProduct[];
  /** ストレージ全体の整備状況の集計（直近ジョブの結果とは別の指標） */
  coverage: PokecaLightCoverage | null;
  selectedCount: number;
  isStarting: boolean;
  status: PokecaLightStatusView;
  /** ライト版の現在のジョブ状態（進捗と結果の実データ） */
  worker: PokecaLightWorkerState | null;
  /** 開始直後の控えめな通知（実行開始・既存ジョブの表示など） */
  noticeMessage?: string;
  /** 開始に失敗したときのメッセージ */
  errorMessage?: string;
  onRun: () => void;
  /** 直近の実行結果（商品別・集計）を開く */
  onOpenResult: () => void;
  canOpenResult: boolean;
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("ja-JP");
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[11px] leading-none text-foreground-500">
        {label}
      </span>
      <span className="admin-numeric text-[12px] font-semibold leading-none tabular-nums text-foreground-900">
        {value}
      </span>
      {suffix && (
        <span className="text-[11px] leading-none text-foreground-400">
          {suffix}
        </span>
      )}
    </span>
  );
}

/**
 * ストレージタブのライト版AIパネル（右サイド）。
 *
 * 通常画面には常設せず、「AI生成」から開いたときだけ表示する。
 * 中身は既存のジョブ状態（usePokecaRawStorageAi の worker_state）と
 * ストレージ全件の整備状況（coverage）を、そのまま縦に並べたもの。
 * 実行対象・実行条件・進捗・履歴・再実行の処理は変更していない。
 */
export default function PokecaLightAiPanel({
  open,
  onClose,
  products,
  coverage,
  selectedCount,
  isStarting,
  status,
  worker,
  noticeMessage = "",
  errorMessage = "",
  onRun,
  onOpenResult,
  canOpenResult,
}: PokecaLightAiPanelProps) {
  // 開いている間は Esc で閉じ、背景スクロールを止める
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const storageTotal = products.length;

  const total = worker?.totalCount ?? 0;
  const processed = worker
    ? Math.min(worker.processedCount, total > 0 ? total : worker.processedCount)
    : 0;
  const progressRatio =
    total > 0 ? Math.min(100, Math.floor((processed / total) * 100)) : null;

  const failedCount = worker?.failedCount ?? 0;
  const hasFailures = failedCount > 0 || (worker?.failures.length ?? 0) > 0;

  const coverageRate = coverage?.priceRate ?? null;

  const statusTextClass =
    status.tone === "failed"
      ? "text-amber-700"
      : status.tone === "idle"
        ? "text-foreground-400"
        : "text-foreground-800";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      ></div>

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="ライト版AI"
        className="relative flex h-full w-full flex-col border-l border-background-200 bg-white sm:max-w-[400px]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-background-200 px-4 py-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="admin-title whitespace-nowrap text-[13px] font-semibold text-foreground-950">
              ライト版AI
            </h2>
            <span
              className={`whitespace-nowrap text-[11px] font-medium leading-none ${statusTextClass}`}
            >
              {status.label}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2 text-[12px] font-medium text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-900"
          >
            閉じる
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium leading-none text-foreground-700">
              処理
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="admin-numeric whitespace-nowrap text-[12px] tabular-nums text-foreground-900">
                {total > 0
                  ? `${formatNumber(processed)} / ${formatNumber(total)} 件`
                  : "—"}
              </span>
              {progressRatio !== null && (
                <>
                  <span
                    className="h-1 min-w-[64px] flex-1 overflow-hidden rounded-full bg-background-200"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full bg-foreground-700"
                      style={{ width: `${progressRatio}%` }}
                    ></span>
                  </span>
                  <span className="admin-numeric whitespace-nowrap text-[11px] tabular-nums text-foreground-600">
                    {progressRatio}%
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="min-w-0 border-t border-background-200 pt-3">
            <p className="text-[11px] font-medium leading-none text-foreground-700">
              直近の実行
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {worker ? (
                <>
                  <Stat label="成功" value={formatNumber(worker.successCount)} />
                  <Stat label="失敗" value={formatNumber(failedCount)} />
                  <Stat
                    label="スキップ"
                    value={formatNumber(worker.skippedCount)}
                  />
                  <Stat label="対象" value={formatNumber(total)} suffix="件" />
                </>
              ) : (
                <span className="text-[11px] leading-none text-foreground-400">
                  —
                </span>
              )}
            </div>
          </div>

          {hasFailures && (
            <div className="min-w-0 border-t border-background-200 pt-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="whitespace-nowrap text-[11px] font-medium leading-none text-foreground-700">
                  失敗詳細
                </p>
                <span className="admin-numeric whitespace-nowrap text-[11px] leading-none text-amber-700">
                  {formatNumber(failedCount)}件
                </span>
              </div>
              <div className="mt-1.5 max-h-56 overflow-y-auto overscroll-contain">
                {worker?.failures.length ? (
                  worker.failures.map((failure, index) => (
                    <div
                      key={`${failure.product_id}-${index}`}
                      className="flex flex-wrap items-baseline gap-x-2 py-0.5 text-[11px] leading-snug"
                    >
                      <span className="admin-numeric shrink-0 text-foreground-700">
                        {failure.product_id || "-"}
                      </span>
                      {failure.product_name && (
                        <span className="min-w-0 max-w-[160px] truncate text-foreground-500">
                          {failure.product_name}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 break-words text-foreground-600">
                        {failure.error_message}
                        {failure.error_code ? `（${failure.error_code}）` : ""}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] leading-relaxed text-foreground-500">
                    商品別の内容は「結果を見る」で確認できます。
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="min-w-0 border-t border-background-200 pt-3">
            <p className="text-[11px] font-medium leading-none text-foreground-700">
              ストレージ全体の整備状況
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {coverage ? (
                <>
                  <Stat
                    label="参考価格あり"
                    value={formatNumber(coverage.priced)}
                  />
                  <Stat
                    label="参考価格なし"
                    value={formatNumber(coverage.unpriced)}
                  />
                  <Stat
                    label="価格カバレッジ"
                    value={
                      coverageRate === null
                        ? "—"
                        : `約${coverageRate.toFixed(1)}%`
                    }
                  />
                  <Stat
                    label="作家あり"
                    value={formatNumber(coverage.authorKnown)}
                  />
                  <Stat
                    label="作家なし"
                    value={formatNumber(coverage.authorMissing)}
                  />
                </>
              ) : (
                <span className="text-[11px] leading-none text-foreground-400">
                  —
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-foreground-400">
              {coverage
                ? `集計対象: ストレージ ${formatNumber(
                    coverage.total ?? storageTotal
                  )}件`
                : `集計対象: ストレージ ${formatNumber(storageTotal)}件`}
            </p>
          </div>

          {(errorMessage || noticeMessage) && (
            <p className="min-w-0 break-words text-[11px] leading-relaxed text-foreground-500">
              {errorMessage ? (
                <span className="text-amber-700">{errorMessage}</span>
              ) : (
                noticeMessage
              )}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-background-200 px-4 py-3">
          <button
            type="button"
            onClick={onOpenResult}
            disabled={!canOpenResult}
            title={canOpenResult ? undefined : "表示できる実行結果がまだありません"}
            className="inline-flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-background-300 bg-white px-3 text-[12px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:border-background-200 disabled:text-foreground-300 disabled:hover:bg-white"
          >
            結果を見る
          </button>
          <button
            type="button"
            onClick={onRun}
            disabled={selectedCount === 0 || isStarting}
            title={
              selectedCount === 0 ? "一覧で商品を選択してください" : undefined
            }
            className="inline-flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-foreground-950 bg-foreground-950 px-3 text-[12px] font-semibold text-background-50 transition-colors hover:bg-foreground-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isStarting ? "開始中" : `実行（${selectedCount}件）`}
          </button>
        </div>
      </aside>
    </div>
  );
}