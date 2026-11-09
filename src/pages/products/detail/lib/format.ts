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

/**
 * 表示専用の改行整形。
 * 保存されている文字列に「\n」という文字列（バックスラッシュ＋n）が
 * そのまま入っている場合だけ、画面上で改行として扱う。
 * 保存データの書き換えは行わない（読み取り時の表示変換のみ）。
 */
export function normalizeDisplayNewlines(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\\r\\n|\\n|\\r/g, "\n");
}