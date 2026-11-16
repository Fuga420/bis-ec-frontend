import { useState } from "react";
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
  /** ストレージタブの商品（旧裏ストレージ全件）。整備状況の対象範囲の表示に使う */
  products: AdminProduct[];
  /**
   * 整備状況の集計。status API の商品別情報、または集計値から組み立てたもの。
   * null のときだけ「まだ返っていない」と表示する。
   */
  coverage: PokecaLightCoverage | null;
  selectedCount: number;
  isStarting: boolean;
  status: PokecaLightStatusView;
  onRun: () => void;
  /** 直近の実行結果（商品別・集計）を開く */
  onOpenResult: () => void;
  /**
   * 表示できる実行結果（実行中・完了・失敗のいずれかのジョブ）があるか。
   * 無い場合は「結果を見る」を無効表示にし、押しても無反応にしない。
   */
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
  tone = "default",
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "default" | "muted";
}) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[11px] leading-none text-foreground-500">
        {label}
      </span>
      <span
        className={`admin-numeric text-[12px] font-semibold leading-none tabular-nums ${
          tone === "muted" ? "text-foreground-500" : "text-foreground-950"
        }`}
      >
        {value}
      </span>
      {suffix && (
        <span className="admin-numeric text-[11px] leading-none text-foreground-400">
          {suffix}
        </span>
      )}
    </span>
  );
}

/**
 * ストレージタブのライト版AIパネル（コンパクト作業パネル）。
 *
 * 上段：名称・処理状態・実行／結果確認
 * 中段「実行状況」：ジョブの処理済み件数 / 対象件数と進捗率（＝ジョブの進み具合）
 * 中段「整備状況」：参考価格・作家情報の整備割合（＝ジョブ進捗とは別の指標）
 * 詳細：仕様説明と作家別件数（折りたたみ）
 *
 * 状態と件数は、この画面から開始したかどうかに関係なく
 * GET /pokeca-raw-storage-ai/status の worker_state に追随する。
 * 商品別情報（items[]）が返らない応答でも、APIの集計値
 * （processed_count / price_found_count / illustrator_counts）で表示する。
 */
export default function PokecaLightAiPanel({
  products,
  coverage,
  selectedCount,
  isStarting,
  status,
  onRun,
  onOpenResult,
  canOpenResult,
}: PokecaLightAiPanelProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const storageTotal = products.length;
  const isRunning = status.tone === "running";

  const statusDotClass =
    status.tone === "running"
      ? "bg-foreground-800"
      : status.tone === "failed"
        ? "bg-amber-600"
        : status.tone === "done"
          ? "bg-foreground-900"
          : "bg-foreground-300";

  const progressRatio =
    isRunning &&
    typeof status.processed === "number" &&
    typeof status.total === "number" &&
    status.total > 0
      ? Math.min(100, Math.floor((status.processed / status.total) * 100))
      : null;

  const progressText =
    isRunning && typeof status.processed === "number"
      ? typeof status.total === "number" && status.total > 0
        ? `${status.processed.toLocaleString("ja-JP")} / ${status.total.toLocaleString("ja-JP")}件（${progressRatio}%）`
        : `${status.processed.toLocaleString("ja-JP")}件を処理`
      : null;

  const coverageRate =
    coverage &&
    coverage.known !== null &&
    coverage.known > 0 &&
    coverage.priced !== null
      ? Math.floor((coverage.priced / coverage.known) * 100)
      : null;

  return (
    <section className="rounded-lg border border-background-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="admin-title whitespace-nowrap text-[13px] font-semibold text-foreground-950">
            ライト版AI
          </h3>
          <span className="hidden whitespace-nowrap text-[11px] leading-none text-foreground-400 md:inline">
            カード情報の抽出・参考価格の補助
          </span>
          <span
            className="hidden text-[11px] leading-none text-foreground-300 md:inline"
            aria-hidden="true"
          >
            ·
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium leading-none text-foreground-700">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass} ${
                isRunning ? "animate-pulse" : ""
              }`}
              aria-hidden="true"
            ></span>
            {status.label}
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenResult}
            disabled={!canOpenResult}
            title={
              canOpenResult
                ? "直近のライト版実行の結果を表示します"
                : "表示できる実行結果がまだありません"
            }
            className="inline-flex h-8 cursor-pointer items-center whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 text-[12px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:border-background-200 disabled:bg-white disabled:text-foreground-300 disabled:hover:bg-white"
          >
            結果を見る
          </button>
          <button
            type="button"
            onClick={onRun}
            disabled={selectedCount === 0 || isStarting}
            title={
              selectedCount === 0
                ? "一覧で商品を選択してください"
                : "選択した商品をライト版AIで処理します"
            }
            className="inline-flex h-8 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-foreground-950 bg-foreground-950 px-3 text-[12px] font-semibold text-background-50 transition-colors hover:bg-foreground-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isStarting ? (
              <>
                <i
                  className="ri-loader-4-line flex h-3.5 w-3.5 animate-spin items-center justify-center text-[13px]"
                  aria-hidden="true"
                ></i>
                開始中
              </>
            ) : (
              <>ライト版を実行（{selectedCount}件）</>
            )}
          </button>
        </div>
      </div>

      {/* 実行状況：ジョブの進み具合（処理済み / 対象・進捗率） */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-background-200 px-3.5 py-2">
        <span className="w-[52px] shrink-0 text-[11px] leading-none text-foreground-400">
          実行状況
        </span>
        <span className="admin-numeric whitespace-nowrap text-[12px] leading-none text-foreground-700">
          {progressText ? (
            <>
              処理済み{" "}
              <span className="font-semibold tabular-nums text-foreground-950">
                {progressText}
              </span>
            </>
          ) : status.tone === "idle" ? (
            <span className="text-[11px] text-foreground-500">
              実行中のジョブはありません
            </span>
          ) : (
            <span className="text-[11px] text-foreground-500">
              {status.tone === "done"
                ? "直近の実行は完了しています"
                : "直近の実行で処理できなかった商品があります"}
            </span>
          )}
        </span>
        {progressRatio !== null && (
          <span className="ml-auto flex min-w-[96px] max-w-[220px] flex-1 items-center gap-2">
            <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-background-200">
              <span
                className="block h-full rounded-full bg-foreground-900"
                style={{ width: `${progressRatio}%` }}
                aria-hidden="true"
              ></span>
            </span>
            <span className="admin-numeric shrink-0 text-[11px] font-medium tabular-nums text-foreground-700">
              {progressRatio}%
            </span>
          </span>
        )}
      </div>

      {/* 整備状況：参考価格・作家情報の整備割合（進捗率とは別の指標） */}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-background-200 px-3.5 py-2">
        <span className="w-[52px] shrink-0 text-[11px] leading-none text-foreground-400">
          整備状況
        </span>
        {coverage ? (
          <>
            <span className="whitespace-nowrap text-[11px] leading-none text-foreground-500">
              {coverage.source === "worker" ? (
                <>
                  処理済み{" "}
                  <span className="admin-numeric tabular-nums text-foreground-700">
                    {formatNumber(coverage.known)}
                  </span>
                  件
                  {coverage.total !== null && coverage.total > 0 && (
                    <span className="text-foreground-300">
                      （対象 {formatNumber(coverage.total)}件中）
                    </span>
                  )}
                </>
              ) : (
                <>
                  直近の結果{" "}
                  <span className="admin-numeric tabular-nums text-foreground-700">
                    {formatNumber(coverage.known)}
                  </span>
                  件
                  <span className="text-foreground-300">
                    （ストレージ {formatNumber(storageTotal)}件中）
                  </span>
                </>
              )}
            </span>
            <Stat label="価格あり" value={formatNumber(coverage.priced)} />
            <Stat
              label="価格なし"
              value={formatNumber(coverage.unpriced)}
              tone="muted"
            />
            <Stat
              label="価格カバレッジ"
              value={coverageRate === null ? "—" : `${coverageRate}%`}
            />
            <span
              className="hidden h-3 w-px bg-background-200 sm:block"
              aria-hidden="true"
            ></span>
            {coverage.source === "items" ? (
              <>
                <Stat
                  label="作家あり"
                  value={formatNumber(coverage.authorKnown)}
                />
                <Stat
                  label="作家なし"
                  value={formatNumber(coverage.authorMissing)}
                  tone="muted"
                />
              </>
            ) : (
              <Stat label="作家" value={`${coverage.authorList.length}名`} />
            )}
          </>
        ) : (
          <span className="text-[11px] leading-relaxed text-foreground-500">
            参考価格・作家情報の集計値がまだ返っていません（実行中または完了後に表示されます）。
          </span>
        )}

        <button
          type="button"
          onClick={() => setIsDetailOpen((v) => !v)}
          aria-expanded={isDetailOpen}
          className="ml-auto inline-flex cursor-pointer items-center gap-0.5 whitespace-nowrap text-[11px] font-medium text-foreground-500 transition-colors hover:text-foreground-900"
        >
          詳細
          <i
            className={`${
              isDetailOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"
            } flex h-3.5 w-3.5 items-center justify-center text-[13px]`}
            aria-hidden="true"
          ></i>
        </button>
      </div>

      {isDetailOpen && (
        <div className="space-y-2.5 border-t border-background-200 px-3.5 py-2.5">
          <dl className="grid gap-1.5 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-[11px] font-medium leading-none text-foreground-700">
                生成する情報の範囲
              </dt>
              <dd className="mt-1 text-[11px] leading-relaxed text-foreground-500">
                画像からカード名・カード番号・イラストレーターを読み取り、短い説明文を生成します。読み取れない項目は空欄のままです。
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-medium leading-none text-foreground-700">
                進捗率と価格カバレッジの違い
              </dt>
              <dd className="mt-1 text-[11px] leading-relaxed text-foreground-500">
                「実行状況」の進捗率はジョブがどこまで処理したか、「整備状況」の価格カバレッジは処理済みのうち参考価格が入った割合です。別の指標のため一致しません。
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-medium leading-none text-foreground-700">
                参考価格の扱い
              </dt>
              <dd className="mt-1 text-[11px] leading-relaxed text-foreground-500">
                参考価格は「参考」の目安で、確定価格ではありません。ライト版の候補価格が無い場合は商品の販売価格を表示し、どちらも無い場合は推測せず「—」と表示します。
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-medium leading-none text-foreground-700">
                実行対象・条件
              </dt>
              <dd className="mt-1 text-[11px] leading-relaxed text-foreground-500">
                対象はチェックした商品のみ（未選択では実行できません）。対象IDの判定・実行条件は従来と同じで、一覧の絞り込みとは連動しません。商品の価格は変更しません。
              </dd>
            </div>
          </dl>

          <p className="text-[11px] leading-relaxed text-foreground-400">
            表示している状態・件数は、この画面から開始したかどうかに関係なく、サーバーが返す現在の実行状態に追随します。
          </p>

          {coverage && coverage.authorList.length > 0 && (
            <div className="border-t border-background-200 pt-2">
              <p className="text-[11px] leading-none text-foreground-500">
                作家別件数（
                {coverage.source === "worker" ? "API集計値" : "直近の結果"}）
                <span className="ml-1 text-foreground-400">
                  {coverage.authorList.length}名
                </span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {coverage.authorList.slice(0, 12).map((author) => (
                  <span
                    key={author.illustrator}
                    className="inline-flex h-[22px] max-w-full items-center gap-1 whitespace-nowrap rounded-md border border-background-200 bg-background-50 px-2 text-[11px] leading-none text-foreground-700"
                  >
                    <span className="max-w-[140px] truncate">
                      {author.illustrator}
                    </span>
                    <span className="admin-numeric tabular-nums text-foreground-500">
                      {author.count}
                    </span>
                  </span>
                ))}
                {coverage.authorList.length > 12 && (
                  <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-md border border-background-200 bg-background-50 px-2 text-[11px] leading-none text-foreground-400">
                    ほか {coverage.authorList.length - 12} 名
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}