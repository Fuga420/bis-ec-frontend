interface PokecaRawStorageToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

// 商品一覧の「旧裏ストレージを隠す」トグル。
// 保管場所（storage_location）が「旧裏ストレージ/」で始まる商品を一覧から隠す。
// 既定はON。件数表示や並び替えと同じ高さに揃え、操作群の中で浮かない見た目にする。
export default function PokecaRawStorageToggle({
  checked,
  onChange,
  disabled = false,
}: PokecaRawStorageToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="旧裏ストレージの商品を一覧で隠す"
      title={
        checked
          ? "保管場所が「旧裏ストレージ/」の商品を一覧から隠しています"
          : "旧裏ストレージの商品も一覧に表示しています"
      }
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`inline-flex h-9 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "border-background-300 bg-white text-foreground-900 hover:bg-background-100"
          : "border-background-300 bg-white text-foreground-500 hover:bg-background-100 hover:text-foreground-900"
      }`}
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-primary-500" : "bg-background-300"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
            checked ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        ></span>
      </span>
      <span>旧裏ストレージを隠す</span>
    </button>
  );
}