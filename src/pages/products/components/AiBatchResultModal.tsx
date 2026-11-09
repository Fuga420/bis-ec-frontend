import { useEffect, useMemo, useState } from "react";
import type {
  AiBatchDisplayItem,
  AiBatchDisplayStatus,
  AiBatchOverallStatus,
} from "@/pages/products/types";
import {
  AI_BATCH_STATUS_LABELS,
  deriveAiBatchDisplayStatus,
  isTerminalBatchStatus,
} from "@/pages/products/lib/aiBatch";
import AiBatchResultRow from "@/pages/products/components/AiBatchResultRow";

interface AiBatchResultModalProps {
  open: boolean;
  items: AiBatchDisplayItem[] | null;
  batchStatus: AiBatchOverallStatus | null;
  isPolling: boolean;
  isSubmitting: boolean;
  pollError: string;
  errorMessage: string;
  onRetryFailed: () => void;
  onClose: () => void;
}

type ResultFilter = "all" | "success" | "failed" | "review";

function createEmptyCounts(): Record<AiBatchDisplayStatus, number> {
  return {
    pending: 0,
    retry_wait: 0,
    processing: 0,
    success: 0,
    failed: 0,
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
 * AI一括生成の「進捗・結果」モーダル。
 *
 * 商品一覧・商品詳細と同じ業務管理UI（白 / ニュートラルグレー / 深緑）に揃える。
 *  - ヘッダー：見出し＋全体状態＋閉じる
 *  - 集計：反映完了・失敗・処理中を優先し、受付待ち・再試行待ち・要確認は補助行
 *  - リスト：商品ごとの状態を文字と控えめな色で示す（ここだけスクロール）
 *  - フッター：失敗のみ再実行／閉じる（既存の実行条件は変更しない）
 *
 * 件数・割合はすべて API 応答（items[] の状態）の集計のみで、架空の進捗は使わない。
 * ジョブ状態・進捗取得・結果反映・再実行のロジックには触れない。
 */
export default function AiBatchResultModal({
  open,
  items,
  batchStatus,
  isPolling,
  isSubmitting,
  pollError,
  errorMessage,
  onRetryFailed,
  onClose,
}: AiBatchResultModalProps) {
  const [filter, setFilter] = useState<ResultFilter>("all");

  // 開き直したときは絞り込みを解除する（前回の絞り込みで商品が見えない誤解を防ぐ）
  useEffect(() => {
    if (!open) setFilter("all");
  }, [open]);

  const counts = useMemo(() => {
    const result = createEmptyCounts();
    (items ?? []).forEach((item) => {
      result[deriveAiBatchDisplayStatus(item)] += 1;
    });
    return result;
  }, [items]);

  const total = items?.length ?? 0;
  // 確定済み＝この時点で結果が確定している件数（成功・失敗・要確認）
  const confirmed =
    counts.success + counts.failed + counts.contract_violation;
  const confirmedRatio = total > 0 ? Math.min(1, confirmed / total) : 0;

  const terminal = isTerminalBatchStatus(batchStatus);
  const hasFailure = counts.failed > 0;
  const needsReview = counts.contract_violation > 0;
  const warning = pollError || errorMessage;

  const visibleItems = useMemo(() => {
    const source = items ?? [];
    if (!terminal || filter === "all") return source;
    return source.filter((item) => {
      const status = deriveAiBatchDisplayStatus(item);
      if (filter === "success") return status === "success";
      if (filter === "failed") return status === "failed";
      return status === "contract_violation";
    });
  }, [items, filter, terminal]);

  if (!open || !items) return null;

  const subtitle = terminal
    ? "下書きへの反映結果を確認できます"
    : "完了した商品から順に下書きへ反映されます";

  const overallChipClass = terminal
    ? hasFailure || needsReview
      ? "tone-warning"
      : "tone-success"
    : "tone-ai";

  const filterChips: { key: ResultFilter; label: string; count: number }[] = [
    { key: "all", label: "すべて", count: total },
    { key: "success", label: "反映完了", count: counts.success },
    { key: "failed", label: "失敗", count: counts.failed },
  ];
  if (needsReview) {
    filterChips.push({
      key: "review",
      label: "要確認",
      count: counts.contract_violation,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="AI一括生成の進捗・結果"
    >
      <div className="products-theme admin-font flex max-h-[calc(100vh-48px)] w-full max-w-[800px] flex-col overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white">
        {/* ヘッダー（固定） */}
        <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] px-5 py-3">
          <div className="min-w-0">
            <h3 className="admin-title text-[17px] font-semibold leading-tight text-foreground-950">
              AI一括生成の進捗・結果
            </h3>
            <p className="mt-1 truncate text-[11px] leading-none text-foreground-500">
              {subtitle}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
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

        {/* 集計（固定） */}
        <div className="border-b border-[#E5E7EB] px-5 py-3">
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
              label="処理中"
              value={counts.processing}
              valueClassName="text-foreground-700"
            />
            <p className="ml-auto pb-0.5 text-right text-[10px] leading-none text-foreground-400">
              {isPolling ? "自動更新中" : terminal ? "取得完了" : ""}
            </p>
          </div>

          {/* 進捗バー：確定済み件数と総件数が取れるときのみ表示（推定値は使わない） */}
          {!terminal && (
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

          {/* 補助的な内訳：受付待ち・再試行待ち・要確認も常に確認できるようにする */}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-none text-foreground-500">
            <span className="admin-numeric">
              受付待ち {counts.pending}
            </span>
            <span className="admin-numeric">再試行待ち {counts.retry_wait}</span>
            <span
              className={`admin-numeric ${
                needsReview ? "font-medium text-amber-700" : ""
              }`}
            >
              要確認 {counts.contract_violation}
            </span>
            {!terminal && (
              <span className="admin-numeric text-foreground-400">
                確定済み {confirmed} / {total}
              </span>
            )}
          </p>

          {/* 補助テキスト（背景色・枠線は付けない） */}
          {terminal ? (
            hasFailure || needsReview ? (
              <p className="mt-2 text-[11px] leading-relaxed text-foreground-500">
                失敗した商品は内容を確認し、必要であれば「失敗のみ再実行」で再生成できます。
              </p>
            ) : (
              <p className="mt-2 flex items-center gap-1 text-[11px] leading-relaxed text-foreground-500">
                <i className="ri-check-line flex h-3 w-3 items-center justify-center text-[12px] text-primary-600"></i>
                失敗した商品はありません。完了した商品から下書きの内容を確認できます。
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
            完了した商品は、サーバー側で同じ商品の下書き（商品情報・英文翻訳など）へ自動反映されます（公開・Square登録は行いません）。修正は商品詳細の「商品情報を編集」から行えます。提案価格は確定済みの仕入明細からの概算原価をもとにしています（税額未確認の明細を含む場合があります）。
          </p>

          {/* 完了後は既存の結果を状態で絞り込める */}
          {terminal && (
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E7EB] px-5 py-3">
          <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-foreground-400">
            {terminal
              ? "閉じると、この結果表示は破棄されます。"
              : "この画面を閉じても、受付済みの処理はサーバー側で継続します。閉じている間の進捗は、画面上部の進捗表示から確認できます。"}
          </p>
          <div className="flex shrink-0 items-center gap-2">
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