import { formatYen } from "@/pages/products/detail/lib/format";

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

/** 上段の主要指標1つ分（ラベルは左、数値は右揃えで比較しやすく） */
function PrimaryMetric({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
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
  // 紐付けが無い（または読み込み中）ときは「¥0」と断定せず「—」で表示する
  const show = hasLinks && !loading;
  const dash = (value: string) => (show ? value : "—");

  return (
    <section className="rounded-[10px] border border-background-200 bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground-950">
          <i className="ri-pie-chart-2-line w-4 h-4 flex items-center justify-center text-primary-600"></i>
          仕入れ概要
        </h2>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="inline-flex items-center gap-1 text-[11px] text-foreground-400">
              <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
              読み込み中
            </span>
          )}
          <span className="inline-flex h-[20px] items-center whitespace-nowrap rounded-md bg-background-100 px-2 text-[10px] font-medium leading-none text-foreground-600">
            概算
          </span>
        </div>
      </div>

      {/* 上段: 主要指標（3カラム / 狭い画面は折り返し） */}
      <dl className="mt-3 grid grid-cols-1 divide-y divide-background-200 rounded-lg border border-background-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <PrimaryMetric
          label="仕入原価（概算）"
          value={show && hasCostAmount ? formatYen(costTotal) : "—"}
        />
        <PrimaryMetric
          label="想定粗利"
          value={dash(canShowProfit ? formatYen(profit) : "—")}
          valueClass={
            show && canShowProfit && profit < 0
              ? "text-red-600"
              : "text-foreground-950"
          }
        />
        <PrimaryMetric
          label="想定粗利率"
          value={dash(canShowProfit ? `${profitRate.toFixed(1)}%` : "—")}
          sub={show && canShowProfit ? "販売予定価格比" : undefined}
        />
      </dl>

      {/* 下段: 主要指標の内訳 */}
      <div className="mt-3 border-t border-background-200 pt-3">
        <p className="text-[10px] font-medium tracking-wide text-foreground-400">
          内訳
        </p>
        <dl className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
          <BreakdownRow
            label="商品代金"
            value={dash(hasItemBreakdown ? formatYen(itemTotal) : "—")}
          />
          <BreakdownRow
            label="落札手数料"
            value={dash(hasFeeBreakdown ? formatYen(feeTotal) : "—")}
          />
          <BreakdownRow
            label="税額"
            value={dash(hasTaxBreakdown ? formatYen(taxTotal) : "—")}
            sub={
              show && hasTaxBreakdown
                ? `商品税 ${formatYen(itemTaxTotal)} / 手数料税 ${formatYen(feeTaxTotal)}`
                : undefined
            }
          />
        </dl>
      </div>

      {/* 補助情報は概要の下に控えめに置く */}
      <div className="mt-2 flex flex-col gap-1 text-[11px] leading-relaxed text-foreground-400">
        {!show && !loading && (
          <p className="text-foreground-500">
            紐付いた書類がないため、金額はまだ集計されていません。
          </p>
        )}
        {show && !canShowProfit && (
          <p className="text-foreground-500">
            販売予定価格が未設定のため、想定粗利・想定粗利率は算出していません。
          </p>
        )}
        {show && otherTotal > 0 && (
          <p className="tabular-nums">
            送料・その他経費 {formatYen(otherTotal)} を仕入原価に含めています。
          </p>
        )}
        {show && hasUnknownBreakdown && (
          <p className="tabular-nums text-amber-800">
            内訳（商品代金・落札手数料）が未取得の明細が{" "}
            {formatYen(unknownBreakdownTotal)} あります。この金額は商品代金には含めず、仕入原価にのみ算入しています。
          </p>
        )}
        {show && (
          <p>
            税額の確認が取れていない明細がある場合、金額は税込・税抜の厳密な配分を行わない概算です。
          </p>
        )}
      </div>
    </section>
  );
}