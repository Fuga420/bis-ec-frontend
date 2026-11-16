import { useMemo, useState } from "react";
import type { AdminProduct } from "@/pages/products/types";
import type { PokecaLightInfoMap } from "@/pages/pokeka/lib/rawStorage";

export interface PokecaLightStatusView {
  label: string;
  tone: "idle" | "running" | "done" | "failed";
  /** 実行中の実進捗（件数が取得できる場合のみ） */
  processed?: number;
  total?: number;
}

interface PokecaLightAiPanelProps {
  /** ストレージタブの商品（旧裏ストレージ全件）。整備状況の対象範囲の判定に使う */
  products: AdminProduct[];
  infoMap: PokecaLightInfoMap;
  selectedCount: number;
  isStarting: boolean;
  status: PokecaLightStatusView;
  onRun: () => void;
  /** 実行結果（商品別）を開く */
  onOpenResult: () => void;
  /**
   * 表示できる実行結果（商品別の明細・失敗内容・対象件数）が本当にあるか。
   * 無い場合は「結果を見る」を無効表示にし、押しても無反応にしない。
   */
  canOpenResult: boolean;
}

function InlineStat({
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
        className={`admin-numeric text-[12px] font-semibold leading-none ${
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
 * 1行目: 名称・短い機能説明・現在の処理状態・実行／結果確認
 * 2行目: 参考価格と作家情報の整備状況（直近の実行で取得できた範囲のみ）
 * 詳細: 長い仕様説明と作家別件数（折りたたみ）
 *
 * 整備状況は、一覧の全件ではなく「ライト版AIの直近の実行結果に含まれる商品」だけを
 * 対象に集計し、その範囲を明記する。ジョブの進捗件数とは別物として扱い、
 * 取得できていない値は推測しない（未取得は集計対象外）。
 */
export default function PokecaLightAiPanel({
  products,
  infoMap,
  selectedCount,
  isStarting,
  status,
  onRun,
  onOpenResult,
  canOpenResult,
}: PokecaLightAiPanelProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const stats = useMemo(() => {
    let priced = 0;
    let unpriced = 0;
    let authorKnown = 0;
    let authorMissing = 0;
    const authors = new Map<string, number>();

    products.forEach((product) => {
      const info = infoMap.get(product.product_id);
      // 実行結果に含まれない商品は「価格なし」ではなく「未取得」なので集計しない
      if (!info) return;
      if (info.candidatePrice !== null && Number.isFinite(info.candidatePrice)) {
        priced += 1;
      } else {
        unpriced += 1;
      }
      if (info.illustrator) {
        authorKnown += 1;
        authors.set(info.illustrator, (authors.get(info.illustrator) ?? 0) + 1);
      } else {
        authorMissing += 1;
      }
    });

    const authorList = Array.from(authors.entries())
      .map(([illustrator, count]) => ({ illustrator, count }))
      .sort(
        (a, b) => b.count - a.count || a.illustrator.localeCompare(b.illustrator)
      );

    return {
      known: priced + unpriced,
      priced,
      unpriced,
      authorKnown,
      authorMissing,
      authorList,
    };
  }, [products, infoMap]);

  const coverage =
    stats.known > 0 ? Math.floor((stats.priced / stats.known) * 100) : null;
  const storageTotal = products.length;
  const isRunning = status.tone === "running";

  const statusToneClass =
    status.tone === "running"
      ? "text-foreground-800"
      : status.tone === "failed"
        ? "text-amber-700"
        : status.tone === "done"
          ? "text-primary-700"
          : "text-foreground-500";

  const progressText =
    isRunning && typeof status.processed === "number" && typeof status.total === "number"
      ? `${status.processed} / ${status.total}件`
      : null;

  return (
    <section className="rounded-lg border border-background-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="admin-title whitespace-nowrap text-[13px] font-semibold text-foreground-950">
            ライト版AI
          </h3>
          <span className="hidden whitespace-nowrap text-[11px] leading-none text-foreground-400 sm:inline">
            カード情報の抽出・参考価格の補助
          </span>
          <span className="text-[11px] leading-none text-foreground-300" aria-hidden="true">
            ·
          </span>
          <span
            className={`flex items-center gap-1 whitespace-nowrap text-[11px] font-medium leading-none ${statusToneClass}`}
          >
            {isRunning && (
              <i
                className="ri-loader-4-line flex h-3 w-3 animate-spin items-center justify-center text-[12px]"
                aria-hidden="true"
              ></i>
            )}
            {status.label}
          </span>
          {progressText && (
            <span className="admin-numeric whitespace-nowrap text-[11px] leading-none text-foreground-500">
              {progressText}
            </span>
          )}
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
            className="inline-flex h-8 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-foreground-900 bg-foreground-950 px-3 text-[12px] font-semibold text-background-50 transition-colors hover:bg-foreground-800 disabled:cursor-not-allowed disabled:opacity-40"
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

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-background-200 px-3.5 py-2">
        {stats.known > 0 ? (
          <>
            <span className="whitespace-nowrap text-[11px] leading-none text-foreground-400">
              ライト版AIの直近の結果{" "}
              <span className="admin-numeric text-foreground-600">
                {stats.known.toLocaleString("ja-JP")}
              </span>
              件
              <span className="text-foreground-300">
                （ストレージ {storageTotal.toLocaleString("ja-JP")}件中）
              </span>
            </span>
            <InlineStat
              label="価格あり"
              value={stats.priced.toLocaleString("ja-JP")}
            />
            <InlineStat
              label="価格なし"
              value={stats.unpriced.toLocaleString("ja-JP")}
            />
            <InlineStat
              label="カバレッジ"
              value={coverage === null ? "—" : `${coverage}%`}
            />
            <span className="hidden h-3 w-px bg-background-200 sm:block" aria-hidden="true"></span>
            <InlineStat
              label="作家あり"
              value={stats.authorKnown.toLocaleString("ja-JP")}
            />
            <InlineStat
              label="作家なし"
              value={stats.authorMissing.toLocaleString("ja-JP")}
              tone="muted"
            />
          </>
        ) : (
          <span className="text-[11px] leading-relaxed text-foreground-500">
            参考価格・作家情報はライト版AIの実行結果からのみ取得できます。直近の結果がないため整備状況は表示していません。
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
                参考価格の扱い
              </dt>
              <dd className="mt-1 text-[11px] leading-relaxed text-foreground-500">
                参考価格は「参考」の目安で、確定価格ではありません。取得できなかった場合は推測せず「—」と表示します。
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-medium leading-none text-foreground-700">
                価格を変更しません
              </dt>
              <dd className="mt-1 text-[11px] leading-relaxed text-foreground-500">
                商品の価格（仕入価格・販売価格）はライト版では変更しません。既存の仕様どおりです。
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-medium leading-none text-foreground-700">
                実行対象・条件
              </dt>
              <dd className="mt-1 text-[11px] leading-relaxed text-foreground-500">
                対象はチェックした商品のみ（未選択では実行できません）。対象IDの判定・実行条件は従来と同じで、一覧の絞り込みとは連動しません。
              </dd>
            </div>
          </dl>

          <p className="text-[11px] leading-relaxed text-foreground-400">
            実行中は処理済み・成功・失敗・スキップを画面上部の進捗に表示します。完了すると一覧を再取得します。
          </p>

          {stats.authorList.length > 0 && (
            <div className="border-t border-background-200 pt-2">
              <p className="text-[11px] leading-none text-foreground-500">
                作家別件数（直近の結果）
                <span className="ml-1 text-foreground-400">
                  {stats.authorList.length}名
                </span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {stats.authorList.slice(0, 12).map((author) => (
                  <span
                    key={author.illustrator}
                    className="inline-flex h-[22px] max-w-full items-center gap-1 whitespace-nowrap rounded-md border border-background-200 bg-background-50 px-2 text-[11px] leading-none text-foreground-700"
                  >
                    <span className="max-w-[140px] truncate">
                      {author.illustrator}
                    </span>
                    <span className="admin-numeric text-foreground-500">
                      {author.count}
                    </span>
                  </span>
                ))}
                {stats.authorList.length > 12 && (
                  <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-md border border-background-200 bg-background-50 px-2 text-[11px] leading-none text-foreground-400">
                    ほか {stats.authorList.length - 12} 名
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