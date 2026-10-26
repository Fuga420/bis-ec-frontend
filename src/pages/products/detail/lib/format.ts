// 商品詳細画面で共通利用する価格表示の整形
export function formatPrice(value: number | null | undefined): string {
  if (!value || value <= 0) return "価格未設定";
  return `¥${value.toLocaleString("ja-JP")}`;
}

// 金額（円）の整形。未取得（null / undefined）は「—」で表示を保留する
export function formatYen(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `¥${Number(value).toLocaleString("ja-JP")}`;
}

// 値が空かどうか（空文字・未設定は「—」表示にする）
export function hasText(value: string | null | undefined): boolean {
  return Boolean(value && value.trim());
}