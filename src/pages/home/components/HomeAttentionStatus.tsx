import { Link } from "react-router-dom";
import type {
  HomeAttentionCount,
  HomeDataState,
} from "@/pages/home/hooks/useHomeSummary";
import { formatHomeCount } from "@/pages/home/lib/homeData";

interface HomeAttentionStatusProps {
  state: HomeDataState;
  attention: HomeAttentionCount[];
  onReload: () => void;
}

/**
 * 要確認項目。既存の在庫状態（在庫あり・売却済み）で数えられる件数だけを出す。
 * 0件は「0件」、数えられない項目は「—」と表示し、両者を混同しない。
 */
export default function HomeAttentionStatus({
  state,
  attention,
  onReload,
}: HomeAttentionStatusProps) {
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
    <ul className="divide-y divide-background-200">
      {attention.map((metric) => (
        <li key={metric.key}>
          <Link
            to="/products"
            className="-mx-1 flex cursor-pointer items-center justify-between gap-4 rounded-md px-1 py-2.5 transition-colors hover:bg-background-50"
          >
            <span className="min-w-0 truncate text-[13px] text-foreground-700">
              {metric.label}
            </span>
            <span
              className="flex shrink-0 items-baseline gap-1.5"
              title={
                metric.count === null
                  ? "件数を取得できませんでした"
                  : undefined
              }
            >
              <span className="admin-numeric text-[16px] font-semibold leading-none text-foreground-950">
                {metric.count === null ? "—" : formatHomeCount(metric.count)}
              </span>
              {metric.count !== null && (
                <span className="text-[12px] leading-none text-foreground-500">
                  件
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}