import ProductSearchField from "@/pages/products/components/ProductSearchField";
import {
  INVENTORY_STATUS_LABELS,
  PUBLISH_STATUS_LABELS,
} from "@/pages/products/types";

interface SneakersFilterBarProps {
  search: string;
  onSearchChange: (next: string) => void;
  publishStatus: string;
  onPublishStatusChange: (next: string) => void;
  inventoryStatus: string;
  onInventoryStatusChange: (next: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

// 表示する選択肢は既存データに実在するステータスだけにする。
// ブランド・サイズ・コンディションは一覧APIに絞り込みパラメータが無いため、
// 操作できるように見えるだけのダミーのセレクトは置かない（ブランドは検索で拾える）。
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
 * Sneakersページの検索・絞り込み。
 *
 * 検索欄を最も広く取り、公開状態・在庫状態は同じ幅の控えめなセレクトにする。
 * 画面幅が狭いときは検索が1段目、セレクトが2段目に並び、片方だけが
 * 不自然に大きくならないようにしている。
 */
export default function SneakersFilterBar({
  search,
  onSearchChange,
  publishStatus,
  onPublishStatusChange,
  inventoryStatus,
  onInventoryStatusChange,
  onClear,
  disabled = false,
}: SneakersFilterBarProps) {
  const hasFilter =
    search.trim() !== "" || publishStatus !== "" || inventoryStatus !== "";
  const selectClass =
    "bis-field w-[calc(50%-0.25rem)] min-w-0 sm:w-[168px] shrink-0";

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {/* 検索欄：最も広い入力欄（商品名・商品ID・ブランドは既存APIの検索対象） */}
      <div className="w-full min-w-0 sm:w-auto sm:min-w-[240px] sm:flex-1 lg:max-w-[480px]">
        <ProductSearchField
          value={search}
          onChange={onSearchChange}
          placeholder="商品名・商品ID・ブランドで検索"
          ariaLabel="スニーカーを検索"
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