interface ProductSearchFieldProps {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
  /** クリア操作の読み上げラベル（省略時は既定文言） */
  clearLabel?: string;
}

/**
 * 商品一覧・Pokémon Card・カテゴリ別一覧で共通に使う検索入力欄。
 *
 * 見た目は BIS デザインシステムのフォーム仕様（.bis-field: 高さ40px・角丸8px・
 * 枠線1px・文字14px）に従い、検索欄用の左アイコン余白（.bis-field-search）と
 * クリア操作（.bis-field-clear）を組み合わせるだけの小さな表示部品。
 * 検索条件・デバウンス・API呼び出しなどの処理は各画面側が持ち、ここでは持たない。
 */
export default function ProductSearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  disabled = false,
  clearLabel = "検索文字列をクリア",
}: ProductSearchFieldProps) {
  return (
    <div className="relative w-full min-w-0">
      <i
        className="ri-search-line pointer-events-none absolute left-3 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-[14px] text-foreground-400"
        aria-hidden="true"
      ></i>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="bis-field bis-field-search w-full"
      />
      {value !== "" && (
        <button
          type="button"
          onClick={() => onChange("")}
          disabled={disabled}
          aria-label={clearLabel}
          className="bis-field-clear absolute right-1 top-1/2 -translate-y-1/2"
        >
          <i
            className="ri-close-line flex h-3.5 w-3.5 items-center justify-center text-[13px]"
            aria-hidden="true"
          ></i>
        </button>
      )}
    </div>
  );
}