export type ProductDetailTabKey = "sales" | "purchase" | "external";

interface ProductDetailTabsProps {
  activeTab: ProductDetailTabKey;
  onChange: (tab: ProductDetailTabKey) => void;
}

const TABS: Array<{
  key: ProductDetailTabKey;
  label: string;
  icon: string;
  hint: string;
}> = [
  {
    key: "sales",
    label: "販売管理",
    icon: "ri-store-3-line",
    hint: "公開・在庫・レコード",
  },
  {
    key: "purchase",
    label: "仕入・書類",
    icon: "ri-file-text-line",
    hint: "仕入内訳・書類",
  },
  {
    key: "external",
    label: "翻訳・外部連携",
    icon: "ri-translate-2",
    hint: "英語・Square",
  },
];

/** 商品詳細の情報を切り替えるローカルタブ（URLは変えず、画面内の表示だけ切り替える） */
export default function ProductDetailTabs({
  activeTab,
  onChange,
}: ProductDetailTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="商品詳細の情報切り替え"
      className="flex w-full flex-wrap items-center gap-1 rounded-[10px] border border-background-200 bg-white p-1"
    >
      {TABS.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={`inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
              active
                ? "bg-primary-500 text-background-50 shadow-sm"
                : "text-foreground-600 hover:bg-background-100"
            }`}
          >
            <i
              className={`${tab.icon} w-4 h-4 flex items-center justify-center shrink-0`}
            ></i>
            {tab.label}
            <span
              className={`hidden text-[11px] font-normal lg:inline ${
                active ? "text-background-50/70" : "text-foreground-400"
              }`}
            >
              {tab.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}