import ProductSearchField from "@/pages/products/components/ProductSearchField";
import {
  CATEGORY_LABELS,
  INVENTORY_STATUS_LABELS,
  PUBLISH_STATUS_LABELS,
} from "@/pages/products/types";

interface ChromeHeartsFilterBarProps {
  search: string;
  onSearchChange: (next: string) => void;
  category: string;
  onCategoryChange: (next: string) => void;
  publishStatus: string;
  onPublishStatusChange: (next: string) => void;
  inventoryStatus: string;
  onInventoryStatusChange: (next: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

// 商品種別の選択肢は、既存データに実在するカテゴリ値（CATEGORY_LABELS）だけを使う。
// リング・ネックレスなどの細分類は既存データに存在しないため作成しない。
const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "すべての種別" },
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

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

/**
 * Chrome Heartsページの検索・絞り込み。
 *
 * 検索欄を最も広く取り、種別・公開状態・在庫状態は同じ幅の控えめなセレクトにする。
 * 絞り込みはすべて既存の一覧APIのパラメータで行う（画面側で取得済み分だけを絞らない）。
 */
export default function ChromeHeartsFilterBar({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  publishStatus,
  onPublishStatusChange,
  inventoryStatus,
  onInventoryStatusChange,
  onClear,
  disabled = false,
}: ChromeHeartsFilterBarProps) {
  const hasFilter =
    search.trim() !== "" ||
    category !== "" ||
    publishStatus !== "" ||
    inventoryStatus !== "";
  const selectClass =
    "bis-field w-[calc(50%-0.25rem)] min-w-0 sm:w-[160px] shrink-0";

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {/* 検索欄：商品名・商品ID・ブランドは既存APIの検索対象 */}
      <div className="w-full min-w-0 sm:w-auto sm:min-w-[240px] sm:flex-1 lg:max-w-[480px]">
        <ProductSearchField
          value={search}
          onChange={onSearchChange}
          placeholder="商品名・商品IDで検索"
          ariaLabel="Chrome Heartsの商品を検索"
          disabled={disabled}
        />
      </div>

      <select
        value={category}
        disabled={disabled}
        onChange={(e) => onCategoryChange(e.target.value)}
        aria-label="商品種別で絞り込み"
        className={selectClass}
      >
        {CATEGORY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <select
        value={publishStatus}
        disabled={disabled}
        onChange={(e) => onPublishStatusChange(e.target.value)}
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
        value={inventoryStatus}
        disabled={disabled}
        onChange={(e) => onInventoryStatusChange(e.target.value)}
        aria-label="在庫状態で絞り込み"
        className={selectClass}
      >
        {INVENTORY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {hasFilter && (
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="bis-btn bis-btn-ghost whitespace-nowrap sm:ml-auto"
        >
          条件をクリア
        </button>
      )}
    </div>
  );
}