import { useRef, type KeyboardEvent } from "react";

export type ProductDetailTabKey = "sales" | "purchase" | "integration";

interface ProductDetailTabsProps {
  activeTab: ProductDetailTabKey;
  onChange: (tab: ProductDetailTabKey) => void;
}

const TABS: Array<{ key: ProductDetailTabKey; label: string }> = [
  { key: "sales", label: "販売管理" },
  { key: "purchase", label: "来歴・仕入" },
  { key: "integration", label: "翻訳・外部連携" },
];

/**
 * 商品詳細の下段を切り替えるローカルタブ（URLは変えず、画面内の表示だけ切り替える）。
 * 図録体裁に合わせ、カードや塗りのタブは使わず、細罫線の上の文字タブにする。
 * 選択中だけ深緑の太字＋下線で示す（ステータス切替と同じ語彙）。
 * キーボード操作: ←→ で移動、Home/End で先頭・末尾へ移動（roving tabindex）。
 */
export default function ProductDetailTabs({
  activeTab,
  onChange,
}: ProductDetailTabsProps) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const moveTo = (index: number) => {
    const normalized = (index + TABS.length) % TABS.length;
    onChange(TABS[normalized].key);
    buttonsRef.current[normalized]?.focus();
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveTo(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveTo(index - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(TABS.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div className="w-full max-w-full overflow-x-auto">
      <div
        role="tablist"
        aria-label="商品詳細の情報切り替え"
        className="flex w-max min-w-full items-center gap-x-7 border-b border-[var(--cat-rule)]"
      >
        {TABS.map((tab, index) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                buttonsRef.current[index] = el;
              }}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(tab.key)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`-mb-px cursor-pointer whitespace-nowrap border-b bg-transparent px-0 pb-2.5 pt-1 text-[12px] tracking-[0.16em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-green)] ${
                active
                  ? "border-[var(--cat-green)] font-semibold text-[var(--cat-green)]"
                  : "border-transparent text-[var(--cat-ink-soft)] hover:text-[var(--cat-ink)]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}