export type PokekaTabKey = "storage" | "vss" | "psa" | "other";

interface PokekaTab {
  key: PokekaTabKey;
  label: string;
}

// 文字だけのタブ。装飾アイコンは持たない（分類はラベルのみで示す）。
const TABS: PokekaTab[] = [
  { key: "storage", label: "ストレージ" },
  { key: "vss", label: "VSS" },
  { key: "psa", label: "PSA" },
  { key: "other", label: "その他鑑定" },
];

interface PokekaTabsProps {
  value: PokekaTabKey;
  onChange: (next: PokekaTabKey) => void;
}

/**
 * ポケカページの上段タブ（ストレージ／VSS／PSA／その他鑑定）。
 * 高さ36px・文字のみ・下線のみで選択状態を示す。
 * ストレージ内の世代別区分（すべて／旧裏／現行）は StorageSubTabs が担当する。
 */
export default function PokekaTabs({ value, onChange }: PokekaTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="ポケカの分類"
      className="flex w-full min-w-0 items-center gap-0.5 overflow-x-auto border-b border-background-200"
    >
      {TABS.map((tab) => {
        const selected = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={`-mb-px h-9 shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-3 text-[13px] transition-colors ${
              selected
                ? "border-foreground-900 font-semibold text-foreground-950"
                : "border-transparent font-medium text-foreground-500 hover:text-foreground-800"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}