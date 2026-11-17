import ProductSearchField from "@/pages/products/components/ProductSearchField";
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

// 検索欄・セレクトは全画面共通（.bis-field: 高さ40px・角丸8px・枠線1px・文字14px）。
// 幅だけを各項目で指定する。
const FIELD_CLASS = "bis-field";

const LABEL_CLASS =
  "shrink-0 whitespace-nowrap text-[12px] leading-none text-foreground-500";

const GROUP_CLASS = "flex min-w-0 shrink-0 items-center gap-1.5";

const PRICE_OPTIONS: Array<{ value: PriceFilterValue; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "priced", label: "価格あり" },
  { value: "unpriced", label: "価格なし" },
];

// 既定順＝保管場所（箱番・枝番）の順。
// 価格は一覧に出している参考価格で並べ、未取得の商品は昇順・降順どちらでも末尾に置く。
const SORT_OPTIONS: Array<{ value: StorageSortValue; label: string }> = [
  { value: "position", label: "既定順" },
  { value: "name", label: "商品名" },
  { value: "price_desc", label: "参考価格 高い順" },
  { value: "price_asc", label: "参考価格 安い順" },
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
        {/* 検索は最も広い領域を占め、残りは内容に合った固定幅で並べる */}
        <div className="w-full min-w-0 lg:w-auto lg:min-w-[240px] lg:flex-1">
          <ProductSearchField
            value={searchValue}
            onChange={onSearchChange}
            placeholder="カード名・商品IDで検索"
            ariaLabel="カード名・商品IDで検索"
            disabled={disabled}
          />
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
            className={`${FIELD_CLASS} w-[84px] cursor-pointer`}
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
            className={`${FIELD_CLASS} w-[120px] cursor-pointer`}
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
            className={`${FIELD_CLASS} w-[96px] cursor-pointer`}
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
            className="bis-btn bis-btn-sm bis-btn-ghost ml-auto"
          >
            条件をクリア
          </button>
        )}
      </div>
    </div>
  );
}