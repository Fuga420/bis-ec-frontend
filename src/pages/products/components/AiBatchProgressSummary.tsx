import type { AiBatchDisplayStatus } from "@/pages/products/types";

interface AiBatchProgressSummaryProps {
  counts: Record<AiBatchDisplayStatus, number>;
  total: number;
  isWaitingSchedule: boolean;
  isTerminal: boolean;
  isCancelled: boolean;
  isPolling: boolean;
  hasFailure: boolean;
  needsReview: boolean;
  hasExcluded: boolean;
  warning: string;
  pollError: string;
}

function MiniStat({
  label,
  value,
  emphasis = false,
  tone = "foreground",
}: {
  label: string;
  value: number;
  emphasis?: boolean;
  tone?: "foreground" | "primary" | "warning";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary-700"
      : tone === "warning"
        ? "text-amber-700"
        : emphasis
          ? "text-foreground-900"
          : "text-foreground-600";

  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[11px] leading-none text-foreground-500">
        {label}
      </span>
      <span
        className={`admin-numeric text-[13px] font-semibold leading-none ${toneClass}`}
      >
        {value}
      </span>
    </span>
  );
}

/**
 * 進捗サマリー。
 *
 * 最も重要な指標は「処理済み件数 / 全件数」。件数は既存の items[] 状態の集計のみで、
 * 推定値やダミーは使わない。内訳（反映完了・失敗・処理中）は同じ行に並べ、
 * 受付待ち・再試行待ち・対象外・要確認は補助行に置く。
 */
export default function AiBatchProgressSummary({
  counts,
  total,
  isWaitingSchedule,
  isTerminal,
  isCancelled,
  isPolling,
  hasFailure,
  needsReview,
  hasExcluded,
  warning,
  pollError,
}: AiBatchProgressSummaryProps) {
  // 確定済み（結果が確定している件数）。進捗率はこの値のみから算出する。
  const processed =
    counts.success +
    counts.failed +
    counts.excluded +
    counts.cancelled +
    counts.contract_violation;
  const processedRatio = total > 0 ? Math.min(1, processed / total) : 0;

  const inProgressLabel = isWaitingSchedule ? "予約待機" : "処理中";
  const inProgressValue = isWaitingSchedule ? counts.pending : counts.processing;

  return (
    <div className="px-6 pb-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        {/* 最重要指標：処理済み / 全件 */}
        <div className="min-w-0">
          <p className="flex items-baseline gap-1">
            <span className="admin-numeric text-[26px] font-semibold leading-none tracking-tight text-foreground-950">
              {processed}
            </span>
            <span className="admin-numeric text-[12px] leading-none text-foreground-400">
              / {total}
            </span>
          </p>
          <p className="mt-1.5 text-[11px] leading-none text-foreground-500">
            処理済み
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-0.5">
          <MiniStat label="反映完了" value={counts.success} tone="primary" />
          <MiniStat
            label="失敗"
            value={counts.failed}
            tone={hasFailure ? "warning" : "foreground"}
          />
          <MiniStat label={inProgressLabel} value={inProgressValue} emphasis />
        </div>

        <p className="ml-auto pb-1 text-right text-[10px] leading-none text-foreground-400">
          {isPolling ? "自動更新中" : isTerminal ? "取得完了" : ""}
        </p>
      </div>

      {/* 進捗バー：確定済み件数と総件数が取れるときのみ表示（推定値は使わない） */}
      {!isTerminal && !isWaitingSchedule && (
        <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-background-200">
          {total > 0 ? (
            <div
              className="h-full rounded-full bg-primary-500 transition-[width] duration-300 ease-out"
              style={{ width: `${processedRatio * 100}%` }}
            ></div>
          ) : (
            <div className="indeterminate-progress-bar h-full w-1/3 rounded-full bg-primary-400"></div>
          )}
        </div>
      )}

      {/* 補助的な内訳：待機系・対象外・要確認も常に数字で確認できるようにする */}
      <p className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1">
        <span className="admin-numeric whitespace-nowrap text-[11px] leading-none text-foreground-500">
          {isWaitingSchedule ? "固定商品数" : "受付待ち"} {counts.pending}
        </span>
        <span className="admin-numeric whitespace-nowrap text-[11px] leading-none text-foreground-500">
          再試行待ち {counts.retry_wait}
        </span>
        <span
          className={`admin-numeric whitespace-nowrap text-[11px] leading-none ${
            hasExcluded ? "font-medium text-foreground-700" : "text-foreground-500"
          }`}
        >
          対象外 {counts.excluded}
        </span>
        <span
          className={`admin-numeric whitespace-nowrap text-[11px] leading-none ${
            needsReview ? "font-medium text-amber-700" : "text-foreground-500"
          }`}
        >
          要確認 {counts.contract_violation}
        </span>
      </p>

      {warning && (
        <p className="mt-2 break-words text-[11px] leading-relaxed text-amber-800">
          {warning}
          {pollError && !isTerminal
            ? "（表示は最後に取得できた状態です。処理は継続しています）"
            : ""}
        </p>
      )}

      {isTerminal && !isCancelled && (hasFailure || needsReview) && (
        <p className="mt-2 break-words text-[11px] leading-relaxed text-amber-800">
          失敗 {counts.failed}件
          {needsReview ? `・要確認 ${counts.contract_violation}件` : ""}
          あります。「失敗」で絞り込んで内容を確認し、必要であれば「失敗のみ再実行」で再生成できます。
        </p>
      )}

      {needsReview && (
        <p className="mt-2 break-words text-[11px] leading-relaxed text-foreground-600">
          要確認は「status:completed と error_code
          の同時返却（契約外応答）」です。成功表示はしていませんが、GAS
          側では completed 扱いのため「失敗のみ再実行」の対象に含まれない
          可能性があります。各商品の詳細を開いて下書きの内容を確認してください。
        </p>
      )}

      {/* 長い説明は短い概要＋折りたたみへ。公開・Square連携を自動実行しない既存仕様は維持する。 */}
      <p className="mt-2 text-[11px] leading-relaxed text-foreground-500">
        完了した商品は、サーバー側で同じ商品の下書きへ自動反映されます（公開・Square登録は行いません）。
      </p>
      <details className="group mt-1">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] leading-relaxed text-foreground-500 marker:hidden hover:text-foreground-700">
          <i className="ri-arrow-right-s-line flex h-3 w-3 items-center justify-center text-[12px] transition-transform group-open:rotate-90"></i>
          自動反映の詳細と注意事項
        </summary>
        <div className="mt-1.5 space-y-1 border-l border-background-200 pl-2.5">
          <p className="text-[11px] leading-relaxed text-foreground-500">
            自動反映の対象は商品情報・英文翻訳などの下書きです。公開・Square登録は行いません。内容の修正は商品詳細の「商品情報を編集」から行えます。
          </p>
          <p className="text-[11px] leading-relaxed text-foreground-500">
            提案価格は、実行時点の確定済み仕入明細から求めた概算原価をもとにしています（原価を取得できなかった場合は生成を進めません）。
          </p>
          <p className="text-[11px] leading-relaxed text-foreground-500">
            開始前に公開済み・アーカイブ済み・画像0枚などになった商品は、理由とともに「対象外」として記録されます（生成は行われません）。
          </p>
        </div>
      </details>
    </div>
  );
}