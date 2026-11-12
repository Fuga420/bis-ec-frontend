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
  // 取込モードでの絞り込み（空＝すべての商品）。旧裏ストレージ商品は category が空欄のため、
  // カテゴリではなく取込モード（import_mode）で判定する。
  importMode: string;
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

// 取込モードの絞り込み。旧裏ストレージ（ポケカ素地）取込で登録された商品だけを表示する。
// 空（すべての商品）では import_mode パラメータを送らない＝従来どおり全件。
const IMPORT_MODE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "すべての商品" },
  { value: "pokeca_raw_storage", label: "旧裏ストレージ" },
];

// 一覧の取得は全件一括だが、画面での絞り込みは「取得済み全件」を対象にする。
// 件数表示はフィルターエリア直下に1か所だけまとめて表示する。
//
// レイアウト方針（Edge-to-Edge 化後の上部最適化）:
// - 親コンテナの枠線・背景は持たない（各入力が個別に境界線を持つため、二重の枠を作らない）。
// - 検索欄は最大520pxまでとし、広い画面でも間延びさせない。
// - フィルター3つは160〜190pxの固定幅で、検索欄の右隣に8〜12px間隔でまとめる。
// - 狭い画面では自然に折り返す（横スクロールは発生させない）。
export default function ProductFilterBar({
  value,
  onChange,
  disabled = false,
}: ProductFilterBarProps) {
  const hasFilter =
    value.search.trim() !== "" ||
    value.category !== "" ||
    value.publishStatus !== "" ||
    value.inventoryStatus !== "" ||
    value.importMode !== "";
  const hasSearch = value.search !== "";

  // 各セレクト共通の見た目（高さ40px・角丸・スタイルを統一）。
  const selectClass =
    "h-10 w-full min-w-0 rounded-lg border border-background-300 bg-white px-3 text-sm text-foreground-900 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-[160px] xl:w-[184px]";

  return (
    <div className="mb-5 flex w-full flex-wrap items-center gap-2 md:gap-3">
      {/* 検索欄：操作群の中で最も広い入力欄。ただし上限520pxで頭打ちにする */}
      <div className="relative min-w-0 w-full sm:w-[340px] lg:w-[440px] xl:w-[520px]">
        <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 flex items-center justify-center text-sm text-foreground-400"></i>
        <input
          type="text"
          value={value.search}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder="商品名・商品ID・ブランドで検索"
          aria-label="商品を検索"
          className="h-10 w-full rounded-lg border border-background-300 bg-white py-2 pl-9 pr-9 text-sm text-foreground-900 placeholder:text-foreground-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50"
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

      {/* カテゴリ・公開状態・在庫状態（同じ高さ・角丸・スタイルで統一） */}
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
        onChange={(e) => onChange({ ...value, publishStatus: e.target.value })}
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

      {/* 取込モード（旧裏ストレージ）。絞り込みはAPI側で行うため、選択変更で1ページ目に戻す */}
      <select
        value={value.importMode}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, importMode: e.target.value })}
        aria-label="取込モードで絞り込み"
        className={selectClass}
      >
        {IMPORT_MODE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {/* 条件クリアは操作群の末尾に控えめに置く（横へ押し広げない） */}
      {hasFilter && (
        <button
          type="button"
          onClick={() =>
            onChange({
              search: "",
              category: "",
              publishStatus: "",
              inventoryStatus: "",
              importMode: "",
            })
          }
          disabled={disabled}
          aria-label="検索・フィルターの条件をすべてクリア"
          className="inline-flex h-10 cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <i className="ri-refresh-line w-3.5 h-3.5 flex items-center justify-center text-sm"></i>
          条件をクリア
        </button>
      )}
    </div>
  );
}