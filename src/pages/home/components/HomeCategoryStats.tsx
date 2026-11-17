import { Link } from "react-router-dom";
import type {
  HomeCategoryCount,
  HomeDataState,
} from "@/pages/home/hooks/useHomeSummary";
import { formatHomeCount } from "@/pages/home/lib/homeData";

interface HomeCategoryStatsProps {
  state: HomeDataState;
  categories: HomeCategoryCount[];
  onReload: () => void;
}

/**
 * カテゴリ別商品。各カテゴリの一覧ページと同じ条件で数えた件数を、
 * カテゴリ名からの導線つきで並べる。
 * 取得できなかったカテゴリは 0 件ではなく「—」で示す（推測値は出さない）。
 */
export default function HomeCategoryStats({
  state,
  categories,
  onReload,
}: HomeCategoryStatsProps) {
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
    <ul className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
      {categories.map((category) => (
        <li key={category.key} className="min-w-0">
          <Link
            to={category.to}
            className="-mx-1 flex cursor-pointer flex-col rounded-md px-1 py-1 transition-colors hover:bg-background-50"
          >
            <span className="truncate text-[12px] font-medium leading-none text-foreground-500">
              {category.label}
            </span>
            <span
              className="mt-2 flex min-w-0 items-baseline gap-1"
              title={
                category.count === null
                  ? "件数を取得できませんでした"
                  : undefined
              }
            >
              <span className="admin-numeric text-[22px] font-semibold leading-none text-foreground-950">
                {category.count === null
                  ? "—"
                  : formatHomeCount(category.count)}
              </span>
              {category.count !== null && (
                <span className="text-[12px] leading-none text-foreground-400">
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