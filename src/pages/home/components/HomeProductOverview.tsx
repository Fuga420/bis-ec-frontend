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
 * 商品概要。商品・下書き・公開中を横並びの数値だけで示す。
 * 旧裏ストレージも通常の商品として同じ集計に含める（別枠・集計外の表示はしない）。
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

  return (
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
  );
}