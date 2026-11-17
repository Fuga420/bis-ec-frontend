import { useState } from "react";
import ProductSearchField from "./ProductSearchField";
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

// レイアウト方針:
// - 検索欄を最も広く・最も目立つ位置（先頭）に置く。
// - よく使う条件（カテゴリ・公開状態・在庫状態）は検索欄の右隣に同じ幅で並べる。
// - 使用頻度の低い取込モードは「その他の条件」の中にまとめ、適用中だけ折りたたみボタンに示す。
// - 画面幅が狭いときは1列 → 2列 → 横並びの順に切り替え、1つだけ孤立して2段目へ落ちないようにする。
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
  const hasOtherFilter = value.importMode !== "";
  // 折りたたみ内の条件が適用中の状態で開いたまま始める（適用中の条件を見えなくしない）。
  const [isOtherOpen, setIsOtherOpen] = useState(hasOtherFilter);

  // 各セレクト共通の見た目（.bis-field: 高さ40px・角丸8px・枠線1px・文字14px）。
  const selectClass = "bis-field w-full min-w-0 lg:w-[172px]";

  return (
    <div className="mb-4 w-full">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
        {/* 検索欄：操作群の中で最も広い入力欄。広い画面では最大420pxで頭打ちにする */}
        <div className="min-w-0 w-full sm:col-span-2 lg:w-[340px] xl:w-[420px]">
          <ProductSearchField
            value={value.search}
            onChange={(next) => onChange({ ...value, search: next })}
            placeholder="商品名・商品ID・ブランドで検索"
            ariaLabel="商品を検索"
            disabled={disabled}
          />
        </div>

        {/* よく使う条件（カテゴリ・公開状態・在庫状態） */}
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

        {/* 使用頻度の低い条件は折りたたむ。適用中は見出しで分かるようにする */}
        <button
          type="button"
          onClick={() => setIsOtherOpen((prev) => !prev)}
          disabled={disabled}
          aria-expanded={isOtherOpen}
          aria-controls="product-filter-other"
          className="bis-btn bis-btn-ghost w-full justify-start sm:w-auto"
        >
          {hasOtherFilter ? "その他の条件（適用中）" : "その他の条件"}
        </button>

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
            className="bis-btn bis-btn-ghost w-full justify-start sm:w-auto"
          >
            条件をクリア
          </button>
        )}
      </div>

      {/* その他の条件（取込モード）。絞り込みはAPI側で行うため、選択変更で1ページ目に戻す */}
      {isOtherOpen && (
        <div
          id="product-filter-other"
          className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:items-center"
        >
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
        </div>
      )}
    </div>
  );
}