import { useRef, type KeyboardEvent } from "react";

export type ProductDetailTabKey = "sales" | "purchase" | "integration";

interface ProductDetailTabsProps {
  activeTab: ProductDetailTabKey;
  onChange: (tab: ProductDetailTabKey) => void;
}

const TABS: Array<{ key: ProductDetailTabKey; label: string }> = [
  { key: "sales", label: "販売管理" },
  { key: "purchase", label: "仕入・書類" },
  { key: "integration", label: "外部連携" },
];

/**
 * 商品詳細の下段を切り替えるローカルタブ（URLは変えず、画面内の表示だけ切り替える）。
 * 商品一覧のタブ切り替えと同じ「薄いグレーの溝＋白い選択中タブ」で統一する。
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
        className="inline-flex w-max min-w-0 items-center gap-1 rounded-lg bg-background-100 p-1"
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
              className={`cursor-pointer whitespace-nowrap rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
                active
                  ? "bg-white text-foreground-950"
                  : "text-foreground-600 hover:text-foreground-900"
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