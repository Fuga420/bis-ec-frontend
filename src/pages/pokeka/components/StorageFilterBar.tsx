import type { StorageSortKey } from "@/pages/pokeka/lib/rawStorage";

export type PriceFilterValue = "all" | "priced" | "unpriced";

export type StorageSortValue = StorageSortKey;

interface StorageFilterBarProps {
  searchValue: string;
  onSearchChange: (next: string) => void;
  boxValue: string;
  boxOptions: string[];
  onBoxChange: (next: string) => void;
  authorValue: string;
  authorOptions: string[];
  onAuthorChange: (next: string) => void;
  priceValue: PriceFilterValue;
  onPriceChange: (next: PriceFilterValue) => void;
  /** 参考価格の判定に使える商品別情報があるか（無い場合は価格フィルターを無効化） */
  priceFilterAvailable: boolean;
  sortValue: StorageSortValue;
  onSortChange: (next: StorageSortValue) => void;
  disabled?: boolean;
  onClear: () => void;
}

// 高さは検索・絞り込み・クリアで揃える（36px）。
const CONTROL_HEIGHT = "h-9";

// 入力欄・セレクトの共通見た目。幅は各項目で指定する。
const FIELD_CLASS = `${CONTROL_HEIGHT} min-w-0 rounded-md border border-background-300 bg-white px-2.5 text-xs text-foreground-900 transition-colors focus:border-foreground-500 focus:outline-none focus:ring-2 focus:ring-foreground-200 disabled:cursor-not-allowed disabled:opacity-60`;

const LABEL_CLASS =
  "shrink-0 whitespace-nowrap text-[11px] leading-none text-foreground-500";

const GROUP_CLASS = "flex min-w-0 shrink-0 items-center gap-1.5";

const PRICE_OPTIONS: Array<{ value: PriceFilterValue; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "priced", label: "価格あり" },
  { value: "unpriced", label: "価格なし" },
];

const SORT_OPTIONS: Array<{ value: StorageSortValue; label: string }> = [
  { value: "position", label: "箱番" },
  { value: "price_desc", label: "金額 高い順" },
  { value: "price_asc", label: "金額 安い順" },
  { value: "created_desc", label: "登録 新しい順" },
  { value: "created_asc", label: "登録 古い順" },
];

/**
 * ストレージタブの検索・絞り込み。
 *
 * 検索は取得済みの旧裏ストレージ商品（タブ内の全件）を対象にした画面側の絞り込みで、
 * 商品名と商品IDに一致するものを表示する。新しい検索APIは呼ばない。
 * 箱番は storage_location の1階層目、作家と参考価格はライト版AIの商品別情報がある
 * 場合のみ有効。いずれも表示対象の絞り込みだけで、商品データは更新しない。
 *
 * レイアウトは「検索（可変幅・最優先）＋ 3つの絞り込み（内容に応じた固定幅）」を
 * 1行に並べ、条件クリアだけを右端に控えめに置く。狭い画面では自然に折り返す。
 */
export default function StorageFilterBar({
  searchValue,
  onSearchChange,
  boxValue,
  boxOptions,
  onBoxChange,
  authorValue,
  authorOptions,
  onAuthorChange,
  priceValue,
  onPriceChange,
  priceFilterAvailable,
  sortValue,
  onSortChange,
  disabled = false,
  onClear,
}: StorageFilterBarProps) {
  const authorDisabled = disabled || authorOptions.length === 0;
  const priceDisabled = disabled || !priceFilterAvailable;
  const isFiltered =
    searchValue !== "" ||
    boxValue !== "" ||
    authorValue !== "" ||
    priceValue !== "all";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative w-full min-w-0 sm:w-auto sm:min-w-[220px] sm:flex-1 sm:max-w-[420px]">
          <i
            className="ri-search-line pointer-events-none absolute left-2.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-[14px] text-foreground-400"
            aria-hidden="true"
          ></i>
          <input
            type="text"
            value={searchValue}
            disabled={disabled}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="カード名・商品IDで検索"
            aria-label="カード名・商品IDで検索"
            className={`${FIELD_CLASS} w-full pl-8 pr-8 placeholder:text-foreground-400`}
          />
          {searchValue !== "" && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              disabled={disabled}
              aria-label="検索文字列をクリア"
              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-foreground-400 transition-colors hover:bg-background-200 hover:text-foreground-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i
                className="ri-close-line flex h-3.5 w-3.5 items-center justify-center text-[13px]"
                aria-hidden="true"
              ></i>
            </button>
          )}
        </div>

        <div className={GROUP_CLASS}>
          <label htmlFor="pokeka-box-filter" className={LABEL_CLASS}>
            箱番
          </label>
          <select
            id="pokeka-box-filter"
            value={boxValue}
            disabled={disabled || boxOptions.length === 0}
            onChange={(e) => onBoxChange(e.target.value)}
            className={`${FIELD_CLASS} w-[92px] cursor-pointer`}
          >
            <option value="">すべて</option>
            {boxOptions.map((box) => (
              <option key={box} value={box}>
                {box}
              </option>
            ))}
          </select>
        </div>

        <div className={GROUP_CLASS}>
          <label htmlFor="pokeka-author-filter" className={LABEL_CLASS}>
            作家
          </label>
          <select
            id="pokeka-author-filter"
            value={authorValue}
            disabled={authorDisabled}
            onChange={(e) => onAuthorChange(e.target.value)}
            className={`${FIELD_CLASS} w-[136px] cursor-pointer`}
          >
            <option value="">すべて</option>
            {authorOptions.map((author) => (
              <option key={author} value={author}>
                {author}
              </option>
            ))}
          </select>
        </div>

        <div className={GROUP_CLASS}>
          <label htmlFor="pokeka-price-filter" className={LABEL_CLASS}>
            参考価格
          </label>
          <select
            id="pokeka-price-filter"
            value={priceValue}
            disabled={priceDisabled}
            onChange={(e) => onPriceChange(e.target.value as PriceFilterValue)}
            className={`${FIELD_CLASS} w-[100px] cursor-pointer`}
          >
            {PRICE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={GROUP_CLASS}>
          <label htmlFor="pokeka-sort" className={LABEL_CLASS}>
            並び順
          </label>
          <select
            id="pokeka-sort"
            value={sortValue}
            disabled={disabled}
            onChange={(e) => onSortChange(e.target.value as StorageSortValue)}
            className={`${FIELD_CLASS} w-[132px] cursor-pointer`}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {isFiltered && (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className={`${CONTROL_HEIGHT} ml-auto inline-flex cursor-pointer items-center whitespace-nowrap rounded-md px-2 text-[12px] font-medium text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-900 disabled:cursor-not-allowed disabled:opacity-50`}
          >
            条件をクリア
          </button>
        )}
      </div>
    </div>
  );
}