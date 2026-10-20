import {
  CATEGORY_LABELS,
  PUBLISH_STATUS_LABELS,
  INVENTORY_STATUS_LABELS,
} from "@/pages/products/types";

export interface ProductFilterValue {
  search: string;
  category: string;
  publishStatus: string;
  inventoryStatus: string;
}

interface ProductFilterBarProps {
  value: ProductFilterValue;
  onChange: (next: ProductFilterValue) => void;
  disabled?: boolean;
}

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "すべてのカテゴリ" },
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

// 表示ラベルは日本語ラベル、内部値は生のステータス値。
// 実在するステータスのみを選択肢にする（架空のステータスは作らない）。
const PUBLISH_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "すべての公開状態" },
  ...Object.entries(PUBLISH_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

const INVENTORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "すべての在庫状態" },
  ...Object.entries(INVENTORY_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

// 一覧の取得は全件一括だが、画面での絞り込みは「取得済み全件」を対象にする。
// 件数表示はフィルターエリア直下に1か所だけまとめて表示する。
export default function ProductFilterBar({
  value,
  onChange,
  disabled = false,
}: ProductFilterBarProps) {
  const hasFilter =
    value.search.trim() !== "" ||
    value.category !== "" ||
    value.publishStatus !== "" ||
    value.inventoryStatus !== "";
  const hasSearch = value.search !== "";

  // 各セレクト共通の見た目（高さ・角丸・スタイルを統一）
  const selectClass =
    "h-9 w-full rounded-md border border-background-300 bg-white px-3 text-sm text-foreground-900 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-44";

  return (
    <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
      {/* 検索欄：横幅を広く確保するメイン要素 */}
      <div className="relative min-w-0 w-full lg:min-w-[220px] lg:flex-1">
        <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 flex items-center justify-center text-sm text-foreground-400"></i>
        <input
          type="text"
          value={value.search}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder="商品名・商品ID・ブランドで検索"
          aria-label="商品を検索"
          className="h-9 w-full rounded-md border border-background-300 bg-white py-2 pl-9 pr-9 text-sm text-foreground-900 placeholder:text-foreground-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {hasSearch && (
          <button
            type="button"
            onClick={() => onChange({ ...value, search: "" })}
            disabled={disabled}
            aria-label="検索文字列をクリア"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-foreground-400 transition-colors hover:bg-background-200 hover:text-foreground-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="ri-close-line w-4 h-4 flex items-center justify-center text-sm"></i>
          </button>
        )}
      </div>

      {/* カテゴリ・公開状態・在庫状態のフィルター（同じ高さ・角丸・スタイルで統一） */}
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto">
        <select
          value={value.category}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, category: e.target.value })}
          aria-label="カテゴリで絞り込み"
          className={selectClass}
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={value.publishStatus}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...value, publishStatus: e.target.value })
          }
          aria-label="公開状態で絞り込み"
          className={selectClass}
        >
          {PUBLISH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={value.inventoryStatus}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...value, inventoryStatus: e.target.value })
          }
          aria-label="在庫状態で絞り込み"
          className={selectClass}
        >
          {INVENTORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {hasFilter && (
        <div className="flex items-center justify-end lg:shrink-0">
          <button
            type="button"
            onClick={() =>
              onChange({
                search: "",
                category: "",
                publishStatus: "",
                inventoryStatus: "",
              })
            }
            disabled={disabled}
            aria-label="検索・フィルターの条件をすべてクリア"
            className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium text-foreground-600 transition-colors hover:bg-background-100 hover:text-foreground-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="ri-refresh-line w-3.5 h-3.5 flex items-center justify-center text-sm"></i>
            条件をクリア
          </button>
        </div>
      )}
    </div>
  );
}