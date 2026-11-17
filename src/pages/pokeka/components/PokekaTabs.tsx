import {
  POKEKA_GRADE_TABS,
  type PokekaGradeKey,
} from "@/pages/pokeka/lib/gradeTabs";

interface PokekaTabsProps {
  value: PokekaGradeKey;
  onChange: (next: PokekaGradeKey) => void;
}

/**
 * ポケカページの上段タブ（グレードなし／グレードあり）。
 * 高さ40px・文字14px・下線のみで選択状態を示すメインナビゲーション。
 * グレードなしの中の世代別区分（すべて／旧裏／現行）は StorageSubTabs が担当し、
 * こちらより小さく・面で選ぶセグメント型にして階層を分ける。
 */
export default function PokekaTabs({ value, onChange }: PokekaTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="ポケカのグレード分類"
      className="flex w-full min-w-0 items-center gap-0.5 overflow-x-auto border-b border-background-200"
    >
      {POKEKA_GRADE_TABS.map((tab) => {
        const selected = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={`-mb-px h-10 shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-3.5 text-[14px] transition-colors ${
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