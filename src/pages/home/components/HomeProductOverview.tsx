import { Link } from "react-router-dom";
import type {
  HomeDataState,
  HomeProductSummary,
} from "@/pages/home/hooks/useHomeSummary";

interface HomeProductOverviewProps {
  state: HomeDataState;
  products: HomeProductSummary;
  onReload: () => void;
}

const STATS: Array<{
  key: "total" | "draft" | "published";
  label: string;
}> = [
  { key: "total", label: "商品" },
  { key: "draft", label: "下書き" },
  { key: "published", label: "公開中" },
];

function formatCount(value: number): string {
  return value.toLocaleString("ja-JP");
}

/**
 * 商品概要。商品・下書き・公開中を横並びの数値だけで示し、
 * 旧裏ストレージは集計対象が異なるため、合算せず補助行として分けて表示する。
 * 集計方法は既存の商品一覧APIのままで、値を補完しない。
 */
export default function HomeProductOverview({
  state,
  products,
  onReload,
}: HomeProductOverviewProps) {
  if (state === "loading") {
    return <p className="text-[12px] text-foreground-500">取得中</p>;
  }

  if (state === "error") {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-foreground-500">取得できませんでした</p>
        <button
          type="button"
          onClick={onReload}
          className="shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-medium text-foreground-600 transition-colors hover:bg-background-100 hover:text-foreground-900"
        >
          再読み込み
        </button>
      </div>
    );
  }

  const hasRawStorage =
    products.rawStorage !== null && products.rawStorage > 0;

  return (
    <>
      <div className="grid grid-cols-3 divide-x divide-background-200">
        {STATS.map((stat, index) => {
          const value = products[stat.key];
          return (
            <Link
              key={stat.key}
              to="/products"
              className={`group flex cursor-pointer flex-col transition-colors hover:bg-background-50 ${
                index === 0 ? "pr-3" : "px-3"
              }`}
            >
              <span className="text-[12px] font-medium leading-none text-foreground-500">
                {stat.label}
              </span>
              <span className="admin-numeric mt-2 text-[22px] font-semibold leading-none text-foreground-950 md:text-[26px]">
                {value === null ? "—" : formatCount(value)}
              </span>
            </Link>
          );
        })}
      </div>

      {hasRawStorage && (
        <Link
          to="/pokeka"
          className="mt-4 flex cursor-pointer items-baseline justify-between gap-3 border-t border-background-200 pt-3 transition-colors hover:text-foreground-900"
        >
          <span className="text-[12px] text-foreground-500">旧裏ストレージ</span>
          <span className="flex items-baseline gap-2">
            <span className="text-[12px] text-foreground-400">
              商品一覧の集計外
            </span>
            <span className="admin-numeric text-[13px] font-semibold text-foreground-700">
              {formatCount(products.rawStorage ?? 0)}
            </span>
          </span>
        </Link>
      )}
    </>
  );
}