import {
  STORAGE_SCOPES,
  type StorageScopeKey,
} from "@/pages/pokeka/lib/storageScopes";

interface StorageSubTabsProps {
  value: StorageScopeKey;
  onChange: (next: StorageScopeKey) => void;
}

/**
 * ストレージ選択時だけ表示する下段のサブタブ。
 *
 * 上段（下線のみのタブ）と区別するため、枠線付きの小さなセグメント型にし、
 * 高さ28px・文字12px・色付き背景なしで控えめにまとめる。
 * 区分の定義は storageScopes.ts に集約しているため、区分が増えてもここは変更しない。
 */
export default function StorageSubTabs({
  value,
  onChange,
}: StorageSubTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="ストレージの区分"
      className="inline-flex min-w-0 shrink-0 items-center gap-0.5 rounded-md border border-background-200 bg-background-50 p-0.5"
    >
      {STORAGE_SCOPES.map((scope) => {
        const selected = scope.key === value;
        return (
          <button
            key={scope.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(scope.key)}
            className={`h-7 shrink-0 cursor-pointer whitespace-nowrap rounded px-2.5 text-[12px] leading-none transition-colors ${
              selected
                ? "bg-white font-semibold text-foreground-950"
                : "font-medium text-foreground-500 hover:text-foreground-800"
            }`}
          >
            {scope.label}
          </button>
        );
      })}
    </div>
  );
}