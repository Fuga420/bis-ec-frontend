import { useEffect, useMemo, useState } from "react";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import { adminThemeClass } from "@/lib/adminTheme";
import type { PokecaLightWorkerState } from "@/pages/products/lib/pokecaRawStorageAi";
import {
  buildPokecaLightResultRows,
  countPokecaLightPrices,
  countPokecaLightResultRows,
  pickFailedProductIds,
  type PokecaLightResultRow,
} from "@/pages/products/lib/pokecaLightResult";
import PokecaLightResultRowView from "@/pages/products/components/PokecaLightResultRow";

type ResultFilter = "all" | "success" | "failed";

interface PokecaLightResultModalProps {
  open: boolean;
  worker: PokecaLightWorkerState | null;
  /** 商品ID→サムネイルURL（一覧から取得できた分だけ） */
  imageMap: Map<string, string>;
  isRefreshing: boolean;
  isStarting: boolean;
  isAutoRefreshing: boolean;
  errorMessage: string;
  noticeMessage: string;
  onRefresh: () => void;
  onRetryFailed: (productIds: string[]) => void;
  onClose: () => void;
}

function SummaryStat({
  label,
  value,
  tone = "default",
  suffix,
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "muted";
  suffix?: string;
}) {
  const toneClass =
    tone === "success"
      ? "text-primary-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "muted"
          ? "text-foreground-500"
          : "text-foreground-950";
  return (
    <div className="min-w-0">
      <p className="text-[11px] leading-none text-foreground-500">{label}</p>
      <p className="mt-1 flex items-baseline gap-0.5">
        <span
          className={`admin-numeric text-[17px] font-semibold leading-none ${toneClass}`}
        >
          {value}
        </span>
        {suffix && (
          <span className="admin-numeric text-[11px] leading-none text-foreground-400">
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * ライト版AI（旧裏ストレージ向け）の結果ビュー。
 *
 * データは既存のステータス取得（worker_state と商品別集計）のみから組み立てる。
 * 実行中は呼び出し元の進捗取得（5秒間隔）で worker が更新されるため、
 * モーダルを開いたままでも件数・結果が最新に追随する。
 */
export default function PokecaLightResultModal({
  open,
  worker,
  imageMap,
  isRefreshing,
  isStarting,
  isAutoRefreshing,
  errorMessage,
  noticeMessage,
  onRefresh,
  onRetryFailed,
  onClose,
}: PokecaLightResultModalProps) {
  const { isTestMode } = useOperatingMode();
  const [filter, setFilter] = useState<ResultFilter>("all");

  // 開き直したとき・別ジョブに変わったときは絞り込みを解除する
  useEffect(() => {
    if (!open) setFilter("all");
  }, [open, worker?.jobId]);

  // モーダル表示中は背景のページスクロールを止める
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const rows = useMemo<PokecaLightResultRow[]>(
    () => (worker ? buildPokecaLightResultRows(worker) : []),
    [worker]
  );
  const counts = useMemo(() => countPokecaLightResultRows(rows), [rows]);
  const priceStats = useMemo(
    () =>
      worker
        ? countPokecaLightPrices(worker)
        : { known: 0, priced: 0, unpriced: 0 },
    [worker]
  );
  const failedIds = useMemo(() => pickFailedProductIds(rows), [rows]);

  const visibleRows = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((row) => row.status === filter);
  }, [rows, filter]);

  if (!open || !worker) return null;

  const isRunning = worker.status === "running";
  const total = worker.totalCount > 0 ? worker.totalCount : rows.length;
  const processed = Math.min(worker.processedCount, total > 0 ? total : 0);
  const statusLabel = isRunning
    ? "実行中"
    : worker.status === "failed"
      ? worker.successCount > 0
        ? "一部失敗"
        : "失敗"
      : worker.status === "completed"
        ? "完了"
        : "待機";
  const statusChipClass = isRunning
    ? "tone-ai"
    : worker.status === "failed"
      ? "tone-warning"
      : worker.status === "completed"
        ? "tone-success"
        : "tone-neutral";

  const chips: { key: ResultFilter; label: string; count: number }[] = [
    { key: "all", label: "すべて", count: counts.total },
    { key: "success", label: "成功", count: counts.success },
    { key: "failed", label: "失敗", count: counts.failed },
  ];

  const warning = errorMessage;

  const handleRetry = () => {
    if (isRunning || failedIds.length === 0 || isStarting) return;
    onRetryFailed(failedIds);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ライト版AIの結果"
    >
      <div
        className={`products-theme admin-font ${adminThemeClass(
          isTestMode
        )} flex max-h-[88vh] w-full max-w-[1000px] flex-col overflow-hidden rounded-[10px] border border-background-200 bg-white`}
      >
        {/* ヘッダー */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-background-200 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="st-badge tone-ai h-[22px] w-[22px] justify-center px-0"
              aria-hidden="true"
            >
              <i className="ri-sparkling-line text-[13px] leading-none"></i>
            </span>
            <h3 className="admin-title min-w-0 truncate text-[15px] font-semibold leading-[1.4] text-foreground-950">
              ライト版AI 結果
            </h3>
            <span className={`st-badge shrink-0 ${statusChipClass}`}>
              {statusLabel}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="結果を再取得"
              title="結果を再取得"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i
                className={`ri-refresh-line flex h-4 w-4 items-center justify-center text-[15px] ${
                  isRefreshing ? "animate-spin" : ""
                }`}
              ></i>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              title="閉じる"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[16px] leading-none text-foreground-400 transition-colors hover:bg-background-100 hover:text-foreground-700"
            >
              <i className="ri-close-line"></i>
            </button>
          </div>
        </div>

        {/* サマリー */}
        <div className="shrink-0 border-b border-background-200 bg-background-50 px-4 py-3 md:px-6">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
            <SummaryStat label="対象件数" value={total.toLocaleString("ja-JP")} suffix="件" />
            <SummaryStat
              label="処理済み"
              value={processed.toLocaleString("ja-JP")}
              suffix={`/ ${total.toLocaleString("ja-JP")}`}
            />
            <SummaryStat
              label="成功"
              value={worker.successCount.toLocaleString("ja-JP")}
              suffix="件"
              tone="success"
            />
            <SummaryStat
              label="失敗"
              value={worker.failedCount.toLocaleString("ja-JP")}
              suffix="件"
              tone={worker.failedCount > 0 ? "warning" : "default"}
            />
            <SummaryStat
              label="スキップ"
              value={worker.skippedCount.toLocaleString("ja-JP")}
              suffix="件"
            />
            <SummaryStat
              label="価格あり"
              value={priceStats.priced.toLocaleString("ja-JP")}
              suffix="件"
              tone="success"
            />
            <SummaryStat
              label="価格なし"
              value={priceStats.unpriced.toLocaleString("ja-JP")}
              suffix="件"
              tone={priceStats.unpriced > 0 ? "default" : "muted"}
            />
          </div>

          <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-relaxed text-foreground-500">
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <i
                className={`${
                  isRunning && isAutoRefreshing
                    ? "ri-loader-4-line animate-spin text-primary-600"
                    : "ri-information-line text-foreground-400"
                } flex h-3.5 w-3.5 items-center justify-center text-[13px]`}
                aria-hidden="true"
              ></i>
              {isRunning
                ? "実行中のため自動更新しています（5秒間隔）"
                : "直近のライト版実行の結果です"}
            </span>
            {priceStats.known > 0 && (
              <span className="whitespace-nowrap">
                価格は処理済み {priceStats.known} 件の集計
              </span>
            )}
            {rows.length < total && (
              <span className="whitespace-nowrap text-foreground-400">
                商品別の明細は取得できた {rows.length} 件を表示
              </span>
            )}
          </p>

          {warning && (
            <p className="mt-2 break-words text-[11px] leading-relaxed text-amber-800">
              {warning}
            </p>
          )}
          {noticeMessage && (
            <p className="mt-2 break-words text-[11px] leading-relaxed text-foreground-600">
              {noticeMessage}
            </p>
          )}
        </div>

        {/* 絞り込み */}
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-background-200 px-4 py-2 md:px-6">
          {chips.map((chip) => {
            const active = filter === chip.key;
            const isFailedChip = chip.key === "failed" && chip.count > 0;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilter(chip.key)}
                aria-pressed={active}
                className={`h-7 cursor-pointer whitespace-nowrap rounded-md border px-2.5 text-[11px] transition-colors ${
                  active
                    ? isFailedChip
                      ? "border-amber-300 bg-amber-50 font-medium text-amber-800"
                      : "border-primary-300 bg-primary-50 font-medium text-primary-700"
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
          {counts.skipped > 0 && (
            <span className="admin-numeric ml-1 whitespace-nowrap text-[10px] leading-none text-foreground-400">
              スキップ {counts.skipped}
            </span>
          )}
          <span className="admin-numeric ml-auto whitespace-nowrap text-[10px] leading-none text-foreground-400">
            {visibleRows.length}件を表示
          </span>
        </div>

        {/* 商品別リスト */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {visibleRows.length === 0 ? (
            <p className="px-6 py-12 text-center text-[12px] text-foreground-500">
              {rows.length === 0
                ? "この実行分の商品別結果はまだ取得できていません。上の件数はサーバーが返す集計値です。実行が進むと、取得できた範囲で商品別に表示されます。"
                : "該当する商品はありません。"}
            </p>
          ) : (
            visibleRows.map((row) => (
              <PokecaLightResultRowView
                key={row.productId}
                row={row}
                imageUrl={imageMap.get(row.productId) ?? ""}
              />
            ))
          )}
        </div>

        {/* フッター */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-background-200 px-4 py-3 md:px-6">
          <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-foreground-400">
            {isRunning
              ? "処理はサーバー側で継続します。閉じても結果は残ります。"
              : "失敗した商品だけをライト版で再実行できます（日時予約・原価入力はありません）。"}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRunning || isStarting || failedIds.length === 0}
              title={
                isRunning
                  ? "実行中のジョブがあるため開始できません"
                  : failedIds.length === 0
                    ? "再実行できる失敗商品がありません"
                    : "失敗した商品のみライト版で再実行します"
              }
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-white px-3 text-[12px] font-semibold text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStarting ? (
                <i className="ri-loader-4-line flex h-3.5 w-3.5 animate-spin items-center justify-center text-[13px]"></i>
              ) : (
                <i className="ri-refresh-line flex h-3.5 w-3.5 items-center justify-center text-[13px]"></i>
              )}
              失敗のみ再実行
              {failedIds.length > 0 && (
                <span className="admin-numeric text-[11px] text-foreground-500">
                  {failedIds.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-8 cursor-pointer whitespace-nowrap rounded-md bg-primary-500 px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-primary-600"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}