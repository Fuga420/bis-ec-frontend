import ProductSearchField from "@/pages/products/components/ProductSearchField";
import {
  INVENTORY_STATUS_LABELS,
  PUBLISH_STATUS_LABELS,
} from "@/pages/products/types";

interface ApparelFilterBarProps {
  search: string;
  onSearchChange: (next: string) => void;
  publishStatus: string;
  onPublishStatusChange: (next: string) => void;
  inventoryStatus: string;
  onInventoryStatusChange: (next: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

// 公開状態・在庫状態は既存データに実在する値だけを選択肢にする。
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
 * Apparelページの検索・絞り込み。
 *
 * 商品種別はこのページでは固定（アパレル）のため選択肢にしない。
 * ブランド・サイズ・カラーは既存の一覧APIに絞り込みパラメータが無く、
 * 一覧の応答からも候補を確定できないため、実装していない
 * （動作しないフィルターやダミーの選択肢は置かない）。
 */
export default function ApparelFilterBar({
  search,
  onSearchChange,
  publishStatus,
  onPublishStatusChange,
  inventoryStatus,
  onInventoryStatusChange,
  onClear,
  disabled = false,
}: ApparelFilterBarProps) {
  const hasFilter =
    search.trim() !== "" || publishStatus !== "" || inventoryStatus !== "";
  const selectClass =
    "bis-field w-[calc(50%-0.25rem)] min-w-0 sm:w-[168px] shrink-0";

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {/* 検索欄：商品名・商品ID・ブランドは既存APIの検索対象 */}
      <div className="w-full min-w-0 sm:w-auto sm:min-w-[240px] sm:flex-1 lg:max-w-[480px]">
        <ProductSearchField
          value={search}
          onChange={onSearchChange}
          placeholder="商品名・商品IDで検索"
          ariaLabel="Apparelの商品を検索"
          disabled={disabled}
        />
      </div>

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