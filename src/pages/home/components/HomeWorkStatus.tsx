import { Link } from "react-router-dom";
import { useAiBatch } from "@/pages/products/context/AiBatchProvider";
import { AI_BATCH_STATUS_LABELS } from "@/pages/products/lib/aiBatch";
import type {
  HomeDataState,
  HomeDocumentSummary,
} from "@/pages/home/hooks/useHomeSummary";

interface HomeWorkStatusProps {
  documentState: HomeDataState;
  documents: HomeDocumentSummary;
  onReloadDocuments: () => void;
}

function formatCount(value: number): string {
  return value.toLocaleString("ja-JP");
}

const RELOAD_BUTTON_CLASS =
  "shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-medium text-foreground-600 transition-colors hover:bg-background-100 hover:text-foreground-900";

/**
 * 作業状況。仕入照合とAI生成を、1枚のカードの中で行として並べる。
 * 数値は既存の取得結果だけを使い、取得できない場合は
 * 「集計情報なし」とだけ表示してダッシュ記号を並べない。
 */
export default function HomeWorkStatus({
  documentState,
  documents,
  onReloadDocuments,
}: HomeWorkStatusProps) {
  const aiBatch = useAiBatch();
  const activeRun = aiBatch.runs.find((run) => run.is_active) ?? null;
  const latestRun = aiBatch.runs[0] ?? null;

  const currentStatus =
    activeRun?.overall_status ??
    (aiBatch.hasActiveBatch ? aiBatch.batchStatus : null);
  const isRunning = currentStatus !== null;

  // 実行中の件数は、実行履歴の集計値を優先し、無い場合だけ取得済みの内訳から数える。
  const currentCounts = activeRun
    ? `完了 ${formatCount(activeRun.completed_count)} / 対象 ${formatCount(
        activeRun.eligible_count
      )}${activeRun.failed_count > 0 ? ` ・ 失敗 ${formatCount(activeRun.failed_count)}` : ""}`
    : aiBatch.hasActiveBatch && aiBatch.countsConfirmed && aiBatch.items
      ? `完了 ${formatCount(
          aiBatch.items.filter((item) => item.status === "completed").length
        )} / 対象 ${formatCount(aiBatch.items.length)}`
      : "";

  // 過去の失敗は現在の処理とは分けて、直近の結果としてだけ示す。
  const pastFailure =
    !isRunning &&
    latestRun &&
    (latestRun.failed_count > 0 ||
      latestRun.overall_status === "failed" ||
      latestRun.overall_status === "partially_failed")
      ? latestRun.failed_count > 0
        ? `直近の実行に失敗 ${formatCount(latestRun.failed_count)} 件`
        : "直近の実行に失敗"
      : "";

  const aiSummary = isRunning
    ? currentCounts || "実行中"
    : "実行中の処理なし";

  return (
    <div className="divide-y divide-background-200">
      {/* 仕入照合 */}
      {documentState === "error" ? (
        <div className="flex items-center justify-between gap-3 pb-3.5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground-900">
              仕入照合
            </p>
            <p className="mt-1 text-[12px] text-foreground-500">
              件数を取得できませんでした
            </p>
          </div>
          <button
            type="button"
            onClick={onReloadDocuments}
            className={RELOAD_BUTTON_CLASS}
          >
            再読み込み
          </button>
        </div>
      ) : (
        <Link
          to="/documents"
          className="-mx-1 flex cursor-pointer items-center justify-between gap-4 rounded-md px-1 pb-3.5 transition-colors hover:bg-background-50"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground-900">
              仕入照合
            </p>
            <p className="mt-1 text-[12px] text-foreground-500">
              {documentState === "success" && documents.total !== null
                ? `全 ${formatCount(documents.total)} 件`
                : "読み込み中"}
            </p>
          </div>
          {documentState === "success" && documents.pending !== null && (
            <p className="flex shrink-0 items-baseline gap-1.5">
              <span className="text-[12px] text-foreground-500">未完了</span>
              <span className="admin-numeric text-[24px] font-semibold leading-none text-foreground-950">
                {formatCount(documents.pending)}
              </span>
              <span className="text-[12px] text-foreground-500">件</span>
            </p>
          )}
        </Link>
      )}

      {/* AI生成 */}
      <div className="flex items-start justify-between gap-4 pt-3.5">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground-900">AI生成</p>
          <p className="mt-1 text-[12px] text-foreground-500">{aiSummary}</p>
          {pastFailure && (
            <p className="mt-0.5 text-[12px] text-foreground-400">
              {pastFailure}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isRunning && currentStatus && (
            <span className="text-[13px] font-semibold text-foreground-800">
              {AI_BATCH_STATUS_LABELS[currentStatus]}
            </span>
          )}
          <button
            type="button"
            onClick={() => void aiBatch.openRunHistory()}
            className="cursor-pointer whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-medium text-foreground-600 transition-colors hover:bg-background-100 hover:text-foreground-900"
          >
            履歴
          </button>
        </div>
      </div>
    </div>
  );
}