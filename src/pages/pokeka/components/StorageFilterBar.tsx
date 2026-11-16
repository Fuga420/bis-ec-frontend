export type PriceFilterValue = "all" | "priced" | "unpriced";

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
  disabled?: boolean;
  onClear: () => void;
}

// 高さは全項目36pxで統一する。
const CONTROL_HEIGHT = "h-9";

const SELECT_CLASS = `${CONTROL_HEIGHT} w-full min-w-0 rounded-lg border border-background-300 bg-white px-2.5 text-xs text-foreground-900 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto`;

const LABEL_CLASS =
  "shrink-0 whitespace-nowrap text-[11px] leading-none text-foreground-500";

const PRICE_OPTIONS: Array<{ value: PriceFilterValue; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "priced", label: "価格あり" },
  { value: "unpriced", label: "価格なし" },
];

/**
 * ストレージタブの検索・絞り込み。
 *
 * 検索は取得済みの旧裏ストレージ商品（タブ内の全件）を対象にした画面側の絞り込みで、
 * 商品名と商品IDに一致するものを表示する。新しい検索APIは呼ばない。
 * 箱番は storage_location の1階層目、作家と参考価格はライト版AIの商品別情報がある
 * 場合のみ有効。いずれも表示対象の絞り込みだけで、商品データは更新しない。
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
    <div className="mb-2 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full min-w-0 sm:w-[240px] lg:w-[300px]">
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
            className={`${CONTROL_HEIGHT} w-full rounded-lg border border-background-300 bg-white pl-8 pr-8 text-xs text-foreground-900 transition-colors placeholder:text-foreground-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-60`}
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

        <div className="flex min-w-0 items-center gap-1.5">
          <label htmlFor="pokeka-box-filter" className={LABEL_CLASS}>
            箱番
          </label>
          <select
            id="pokeka-box-filter"
            value={boxValue}
            disabled={disabled || boxOptions.length === 0}
            onChange={(e) => onBoxChange(e.target.value)}
            className={`${SELECT_CLASS} sm:w-[128px]`}
          >
            <option value="">すべて</option>
            {boxOptions.map((box) => (
              <option key={box} value={box}>
                {box}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          <label htmlFor="pokeka-author-filter" className={LABEL_CLASS}>
            作家
          </label>
          <select
            id="pokeka-author-filter"
            value={authorValue}
            disabled={authorDisabled}
            onChange={(e) => onAuthorChange(e.target.value)}
            className={`${SELECT_CLASS} sm:w-[140px]`}
          >
            <option value="">すべて</option>
            {authorOptions.map((author) => (
              <option key={author} value={author}>
                {author}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          <label htmlFor="pokeka-price-filter" className={LABEL_CLASS}>
            参考価格
          </label>
          <select
            id="pokeka-price-filter"
            value={priceValue}
            disabled={priceDisabled}
            onChange={(e) => onPriceChange(e.target.value as PriceFilterValue)}
            className={`${SELECT_CLASS} sm:w-[112px]`}
          >
            {PRICE_OPTIONS.map((option) => (
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
            className={`${CONTROL_HEIGHT} ml-auto inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border border-background-300 bg-white px-2.5 text-[12px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <i
              className="ri-close-line flex h-3.5 w-3.5 items-center justify-center text-[13px]"
              aria-hidden="true"
            ></i>
            条件をクリア
          </button>
        )}
      </div>

      {(authorOptions.length === 0 || !priceFilterAvailable) && (
        <p className="text-[11px] leading-relaxed text-foreground-400">
          {authorOptions.length === 0 && priceFilterAvailable
            ? "作家情報は未取得です。ライト版AIの実行結果があると選べます。"
            : authorOptions.length === 0 && !priceFilterAvailable
              ? "作家・参考価格は未取得です。ライト版AIの実行結果があると、絞り込みと一覧の表示に反映されます。"
              : "参考価格は、ライト版AIの候補価格を優先し、無い場合は商品の販売価格で判定します。どちらも未設定の商品は「価格なし」に含まれます。"}
        </p>
      )}
    </div>
  );
}