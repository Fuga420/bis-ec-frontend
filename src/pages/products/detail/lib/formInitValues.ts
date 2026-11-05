/**
 * 商品編集フォームの初期値づくり（表示専用の正規化）。
 *
 * GAS / 商品詳細API は同じ項目を
 *   - 数値（28, 11500）
 *   - 表記付きの文字列（"28cm", "28.0 cm", "¥11,500", "１１，５００"）
 * のどちらでも返しうる。画面の詳細表示はそのまま文字列化して表示できるが、
 * 編集フォームは select の選択肢との完全一致が必要なため、数値として正規化して照合する。
 */

/** 全角数字・全角カンマを半角に寄せる（表記ゆれ対策） */
function toHalfWidth(value: string): string {
  return value
    .replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    )
    .replace(/[．]/g, ".")
    .replace(/[，、]/g, ",");
}

/** 値に含まれる最初の数値を取り出す。数値が無ければ null */
export function parseNumericValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === "boolean") return null;
  const text = toHalfWidth(String(raw))
    .replace(/[¥￥,\s]/g, "")
    .trim();
  if (!text) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
}

/** 文字列項目の初期値（前後の空白だけ落とし、値はそのまま保つ） */
export function toTextValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number") return String(raw);
  return "";
}

/** 発売年などの年表記。数値で来ても文字列で来ても同じ表示にする */
export function toYearValue(raw: unknown): string {
  const num = parseNumericValue(raw);
  if (num !== null) return String(Math.trunc(num));
  return toTextValue(raw);
}

/** 金額入力欄の初期値。0・未設定はこれまでどおり空欄にする */
export function toPriceInputValue(raw: unknown): string {
  const num = parseNumericValue(raw);
  if (num === null || num <= 0) return "";
  return Number.isInteger(num) ? String(num) : String(num);
}

/**
 * スニーカーのサイズを選択肢（"28.0" など）に合わせる。
 * "28cm" / "28.0 cm" / 28 / "28" はいずれも 28.0 として一致させる。
 */
export function normalizeSneakerSizeValue(
  raw: unknown,
  options: readonly string[]
): string {
  const text = toTextValue(raw);
  if (!text) return "";
  if (options.includes(text)) return text;

  const num = parseNumericValue(raw);
  if (num === null) return text;
  const matched = options.find((option) => {
    const optionNum = parseNumericValue(option);
    return optionNum !== null && Math.abs(optionNum - num) < 0.001;
  });
  return matched ?? String(num);
}

/**
 * 箱の有無を選択肢（"あり" / "なし"）に合わせる。
 * "箱あり" "有" "◯" などの表記ゆれを吸収する。
 */
export function normalizeBoxValue(
  raw: unknown,
  options: readonly string[]
): string {
  const text = toTextValue(raw);
  if (!text) return "";
  if (options.includes(text)) return text;
  if (/なし|無|no/i.test(text)) return "なし";
  if (/あり|有|yes/i.test(text)) return "あり";
  return text;
}

/**
 * 付属品（"タグ, 購入時の領収書"）を配列にする。
 * カンマのあとに空白が無い保存値でも分割できるようにする。
 */
export function splitAccessoriesValue(
  raw: unknown,
  options: readonly string[]
): string[] {
  const text = toTextValue(raw);
  if (!text) return [];
  const parts = text
    .split(/[,、]/)
    .map((part) => part.trim())
    .filter(Boolean);
  // 選択肢に一致する表記があれば選択肢側の表記に寄せる（表記ゆれ対策）
  return parts.map((part) => {
    const matched = options.find(
      (option) => option === part || option.replace(/\s/g, "") === part.replace(/\s/g, "")
    );
    return matched ?? part;
  });
}

/** 状態（"新品・未使用" などのラベル、または id）を選択肢の値に合わせる */
export function normalizeConditionValue(
  raw: unknown,
  conditions: readonly { id: string; label: string }[]
): string {
  const text = toTextValue(raw);
  if (!text) return "";
  const byId = conditions.find((c) => c.id === text);
  if (byId) return byId.id;
  const byLabel = conditions.find((c) => c.label === text);
  if (byLabel) return byLabel.id;
  return text;
}