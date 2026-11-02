import { useState } from "react";
import { formatYen } from "@/pages/products/detail/lib/format";
import SectionHeading from "./SectionHeading";
import DetailDisclosure from "./DetailDisclosure";

interface LedgerOverviewProps {
  loading: boolean;
  hasLinks: boolean;
  // 金額として表示できる値があるか（紐付けはあるが金額が未取得の場合は false）
  hasCostAmount?: boolean;

  itemTotal: number;
  hasItemBreakdown: boolean;
  feeTotal: number;
  hasFeeBreakdown: boolean;
  taxTotal: number;
  hasTaxBreakdown: boolean;
  itemTaxTotal: number;
  feeTaxTotal: number;
  costTotal: number;

  otherTotal: number;
  unknownBreakdownTotal: number;
  hasUnknownBreakdown: boolean;

  canShowProfit: boolean;
  profit: number;
  profitRate: number;
}

/** 粗利率の細いバー（プラスは緑、マイナスは赤）＋目標粗利率の目安線 */
function RateBar({
  percent,
  positive,
  target,
}: {
  percent: number;
  positive: boolean;
  target: number;
}) {
  const width = Math.max(0, Math.min(100, Math.abs(percent)));
  return (
    <div className="mt-1.5">
      <div
        className="relative h-1 w-full overflow-hidden rounded-full bg-background-200"
        aria-hidden="true"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            positive ? "bg-primary-500" : "bg-red-500"
          }`}
          style={{ width: `${width}%` }}
        />
        {/* 目標粗利率の目安線（この線より右にあれば目標達成） */}
        <span
          className="absolute top-0 h-full w-px bg-foreground-400/70"
          style={{ left: `${Math.min(100, Math.max(0, target))}%` }}
        />
      </div>
      <p className="mt-1 truncate text-right text-[9px] leading-none text-foreground-400">
        目標 {target}%
      </p>
    </div>
  );
}

/** 上段の主要指標1つ分（ラベルは左、数値は右揃えで比較しやすく） */
function PrimaryMetric({
  label,
  value,
  sub,
  valueClass,
  bar,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  bar?: { percent: number; positive: boolean; target: number } | null;
}) {
  return (
    <div className="min-w-0 px-3.5 py-3">
      <dt className="truncate text-[11px] leading-tight text-foreground-500">
        {label}
      </dt>
      <dd
        className={`mt-1 truncate text-right text-[19px] font-semibold leading-tight tabular-nums ${
          valueClass ?? "text-foreground-950"
        }`}
        title={value}
      >
        {value}
      </dd>
      {bar && <RateBar percent={bar.percent} positive={bar.positive} target={bar.target} />}
      {sub && (
        <dd className="mt-1 truncate text-right text-[10px] leading-tight tabular-nums text-foreground-400">
          {sub}
        </dd>
      )}
    </div>
  );
}

/** 下段の内訳1行分（主要指標より控えめな文字サイズ） */
function BreakdownRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <dt className="truncate text-[11px] leading-tight text-foreground-500">
          {label}
        </dt>
        <dd
          className="shrink-0 text-[12px] leading-tight tabular-nums text-foreground-800"
          title={value}
        >
          {value}
        </dd>
      </div>
      {sub && (
        <p className="mt-0.5 truncate text-right text-[10px] leading-tight tabular-nums text-foreground-400">
          {sub}
        </p>
      )}
    </div>
  );
}

/**
 * 仕入れ概要: 主要指標（仕入原価・想定粗利・想定粗利率）を上段に、
 * その計算根拠となる内訳（商品代金・落札手数料・税額）を下段に分けて表示する。
 *
 * - 0円・空の内訳は表に出さず、「詳細・技術情報」の折りたたみへ送る
 * - 想定粗利はプラスなら緑、マイナスなら赤。粗利率には細いバーを添える
 * 金額計算は呼び出し元が持つ値をそのまま表示するだけ（丸め・加工はしない）。
 */
export default function LedgerOverview({
  loading,
  hasLinks,
  hasCostAmount = true,
  itemTotal,
  hasItemBreakdown,
  feeTotal,
  hasFeeBreakdown,
  taxTotal,
  hasTaxBreakdown,
  itemTaxTotal,
  feeTaxTotal,
  costTotal,
  otherTotal,
  unknownBreakdownTotal,
  hasUnknownBreakdown,
  canShowProfit,
  profit,
  profitRate,
}: LedgerOverviewProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  // 目標粗利率（バーの目安線）。数値の意味づけとして常に同じ値を使う。
  const TARGET_PROFIT_RATE = 30;

  // 紐付けが無い（または読み込み中）ときは「¥0」と断定せず「—」で表示する
  const show = hasLinks && !loading;
  const dash = (value: string) => (show ? value : "—");

  const profitPositive = profit >= 0;
  const showProfitValue = show && canShowProfit;

  // 表に出す内訳（値が0の行は出さない）
  const visibleBreakdown: Array<{ label: string; value: string }> = [];
  if (show && hasItemBreakdown && itemTotal !== 0) {
    visibleBreakdown.push({ label: "商品代金", value: formatYen(itemTotal) });
  }
  if (show && hasFeeBreakdown && feeTotal !== 0) {
    visibleBreakdown.push({ label: "落札手数料", value: formatYen(feeTotal) });
  }
  if (show && hasTaxBreakdown && taxTotal !== 0) {
    visibleBreakdown.push({ label: "税額", value: formatYen(taxTotal) });
  }
  if (show && otherTotal > 0) {
    visibleBreakdown.push({ label: "送料・その他", value: formatYen(otherTotal) });
  }

  return (
    <section className="ui-card rounded-lg p-4 md:p-5">
      <SectionHeading
        eyebrow="Purchase"
        title="仕入れ概要"
        icon="ri-pie-chart-2-line"
        right={
          <>
            {loading && (
              <span className="inline-flex items-center gap-1 text-[11px] text-foreground-400">
                <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
                読み込み中
              </span>
            )}
            <span className="inline-flex h-[20px] items-center whitespace-nowrap rounded-md bg-background-100 px-2 text-[10px] font-medium leading-none text-foreground-600">
              概算
            </span>
          </>
        }
      />

      {/* 上段: 主要指標（3カラム / 狭い画面は折り返し） */}
      <dl className="mt-3 grid grid-cols-1 divide-y divide-background-200 rounded-lg border border-background-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <PrimaryMetric
          label="仕入原価（概算）"
          value={show && hasCostAmount ? formatYen(costTotal) : "—"}
        />
        <PrimaryMetric
          label="想定粗利"
          value={dash(showProfitValue ? formatYen(profit) : "—")}
          valueClass={
            showProfitValue
              ? profitPositive
                ? "text-primary-700"
                : "text-red-600"
              : "text-foreground-950"
          }
        />
        <PrimaryMetric
          label="想定粗利率"
          value={dash(showProfitValue ? `${profitRate.toFixed(1)}%` : "—")}
          valueClass={
            showProfitValue
              ? profitPositive
                ? "text-primary-700"
                : "text-red-600"
              : "text-foreground-950"
          }
          bar={
            showProfitValue
              ? {
                  percent: profitRate,
                  positive: profitPositive,
                  target: TARGET_PROFIT_RATE,
                }
              : null
          }
          sub={showProfitValue ? "販売予定価格比" : undefined}
        />
      </dl>

      {/* 中段: 主要指標の内訳（0円・空の行は出さない） */}
      {show && visibleBreakdown.length > 0 && (
        <div className="mt-3 border-t border-background-200 pt-3">
          <p className="text-[10px] font-medium tracking-wide text-foreground-400">
            内訳
          </p>
          <dl
            className={`mt-1.5 grid grid-cols-1 gap-x-6 gap-y-2 ${
              visibleBreakdown.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"
            }`}
          >
            {visibleBreakdown.map((row) => (
              <BreakdownRow
                key={row.label}
                label={row.label}
                value={row.value}
              />
            ))}
          </dl>
        </div>
      )}

      {/* 状態の案内（紐付けなし / 価格未設定） */}
      {(!show || !canShowProfit) && (
        <div className="mt-2 text-[11px] leading-relaxed text-foreground-500">
          {!show && !loading && (
            <p>紐付いた書類がないため、金額はまだ集計されていません。</p>
          )}
          {show && !canShowProfit && (
            <p>販売予定価格が未設定のため、想定粗利・想定粗利率は算出していません。</p>
          )}
        </div>
      )}

      {/* めったに見ない情報（税額の注記・0円の内訳・空の内訳）は折りたたむ */}
      {show && (
        <DetailDisclosure
          open={detailOpen}
          onToggle={() => setDetailOpen((open) => !open)}
          label="詳細・技術情報"
          hint="Breakdown"
          className="mt-2"
        >
          <div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {hasItemBreakdown && (
                <BreakdownRow label="商品代金" value={formatYen(itemTotal)} />
              )}
              {hasFeeBreakdown && (
                <BreakdownRow label="落札手数料" value={formatYen(feeTotal)} />
              )}
              {hasTaxBreakdown && (
                <BreakdownRow
                  label="税額"
                  value={formatYen(taxTotal)}
                  sub={`商品税 ${formatYen(itemTaxTotal)} / 手数料税 ${formatYen(feeTaxTotal)}`}
                />
              )}
              {otherTotal > 0 && (
                <BreakdownRow label="送料・その他" value={formatYen(otherTotal)} />
              )}
              {hasUnknownBreakdown && (
                <BreakdownRow
                  label="内訳未取得"
                  value={formatYen(unknownBreakdownTotal)}
                />
              )}
            </dl>

            {!hasItemBreakdown &&
              !hasFeeBreakdown &&
              !hasTaxBreakdown &&
              otherTotal <= 0 &&
              !hasUnknownBreakdown && (
                <p className="text-[11px] text-foreground-400">
                  追加で表示できる内訳はありません。
                </p>
              )}

            <div className="mt-2 flex flex-col gap-1 text-[11px] leading-relaxed text-foreground-400">
              {otherTotal > 0 && (
                <p className="tabular-nums">
                  送料・その他経費を仕入原価に含めています。
                </p>
              )}
              {hasUnknownBreakdown && (
                <p className="tabular-nums text-amber-800">
                  内訳（商品代金・落札手数料）が未取得の明細が{" "}
                  {formatYen(unknownBreakdownTotal)} あります。この金額は商品代金には含めず、仕入原価にのみ算入しています。
                </p>
              )}
              <p>
                税額の確認が取れていない明細がある場合、金額は税込・税抜の厳密な配分を行わない概算です。
              </p>
            </div>
          </div>
        </DetailDisclosure>
      )}
    </section>
  );
}