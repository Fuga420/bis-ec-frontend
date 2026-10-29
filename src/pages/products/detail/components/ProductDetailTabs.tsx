import { useRef, type KeyboardEvent } from "react";

export type ProductDetailTabKey = "sales" | "purchase" | "external";

interface ProductDetailTabsProps {
  activeTab: ProductDetailTabKey;
  onChange: (tab: ProductDetailTabKey) => void;
}

const TABS: Array<{
  key: ProductDetailTabKey;
  label: string;
  icon: string;
}> = [
  {
    key: "sales",
    label: "販売管理",
    icon: "ri-store-3-line",
  },
  {
    key: "purchase",
    label: "仕入・書類",
    icon: "ri-file-text-line",
  },
  {
    key: "external",
    label: "翻訳・外部連携",
    icon: "ri-translate-2",
  },
];

/**
 * 商品詳細の情報を切り替えるローカルタブ（URLは変えず、画面内の表示だけ切り替える）。
 * 補足説明は持たず、ラベルとアイコンのみのコンパクトな表示にする。
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
    <div
      role="tablist"
      aria-label="商品詳細の情報切り替え"
      className="inline-flex w-fit max-w-full items-center gap-1 rounded-lg border border-background-200 bg-white p-1"
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
            className={`inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
              active
                ? "bg-primary-600 text-background-50"
                : "text-foreground-600 hover:bg-background-100 hover:text-foreground-900"
            }`}
          >
            <i
              className={`${tab.icon} w-4 h-4 flex items-center justify-center shrink-0`}
              aria-hidden="true"
            ></i>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}