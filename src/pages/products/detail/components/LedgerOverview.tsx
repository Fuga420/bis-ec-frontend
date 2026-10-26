import { formatYen } from "@/pages/products/detail/lib/format";

interface LedgerOverviewProps {
  loading: boolean;
  hasLinks: boolean;

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

type MetricTone = "plain" | "cost" | "profit";

const TONE_STYLES: Record<MetricTone, string> = {
  plain: "border-background-200 bg-background-50",
  cost: "border-primary-200 bg-primary-50",
  profit: "border-accent-200 bg-accent-50",
};

const LABEL_STYLES: Record<MetricTone, string> = {
  plain: "text-foreground-500",
  cost: "text-primary-700",
  profit: "text-accent-900",
};

/** 集計値1つ分の小さなメトリクス */
function Metric({
  label,
  value,
  sub,
  tone = "plain",
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: MetricTone;
  valueClass?: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-lg border px-3 py-2 ${TONE_STYLES[tone]}`}
    >
      <dt className={`text-[11px] leading-tight ${LABEL_STYLES[tone]}`}>
        {label}
      </dt>
      <dd
        className={`mt-0.5 truncate text-[13px] font-bold tabular-nums ${
          valueClass ?? "text-foreground-950"
        }`}
        title={value}
      >
        {value}
      </dd>
      {sub && (
        <dd className="mt-0.5 truncate text-[10px] tabular-nums text-foreground-400">
          {sub}
        </dd>
      )}
    </div>
  );
}

/**
 * 仕入れ概要: 商品代金・落札手数料・税額・仕入原価・想定粗利・利益率を
 * 一覧できるように整列表示する（金額計算は呼び出し元が持つ）。
 */
export default function LedgerOverview({
  loading,
  hasLinks,
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
          <span className="inline-flex h-[20px] items-center whitespace-nowrap rounded-md bg-accent-100 px-2 text-[10px] font-medium leading-none text-accent-900">
            概算
          </span>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric
          label="商品代金"
          value={dash(hasItemBreakdown ? formatYen(itemTotal) : "—")}
        />
        <Metric
          label="落札手数料"
          value={dash(hasFeeBreakdown ? formatYen(feeTotal) : "—")}
        />
        <Metric
          label="税額"
          value={dash(hasTaxBreakdown ? formatYen(taxTotal) : "—")}
          sub={
            show && hasTaxBreakdown
              ? `商品税 ${formatYen(itemTaxTotal)} / 手数料税 ${formatYen(feeTaxTotal)}`
              : undefined
          }
        />
        <Metric
          label="仕入原価（概算）"
          value={show ? formatYen(costTotal) : "—"}
          tone="cost"
          valueClass="text-primary-800"
        />
        <Metric
          label="想定粗利"
          value={dash(canShowProfit ? formatYen(profit) : "—")}
          tone="profit"
          valueClass={show && canShowProfit && profit < 0 ? "text-red-600" : "text-foreground-950"}
        />
        <Metric
          label="利益率"
          value={dash(canShowProfit ? `${profitRate.toFixed(1)}%` : "—")}
          sub={show && canShowProfit ? "販売予定価格比" : undefined}
        />
      </dl>

      {/* 補助情報は概要の下に控えめに置く */}
      <div className="mt-2 flex flex-col gap-1 text-[11px] leading-relaxed text-foreground-400">
        {!show && !loading && (
          <p className="text-foreground-500">
            紐付いた書類がないため、金額はまだ集計されていません。
          </p>
        )}
        {show && !canShowProfit && (
          <p className="text-foreground-500">
            販売予定価格が未設定のため、想定粗利・利益率は算出していません。
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