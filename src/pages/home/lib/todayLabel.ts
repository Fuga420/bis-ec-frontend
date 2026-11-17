/**
 * ホームに出す日付ラベル（例: 2026年11月17日（火））。
 *
 * 日付と曜日は「同じ1つの日時値」を Intl.DateTimeFormat に渡して同時に取り出す。
 * 曜日を固定表や別計算（月・日の取り違え）で作らないため、日付と曜日がずれない。
 * タイムゾーンは Asia/Tokyo 固定（ブラウザの地域設定に依存しない）。
 */
const JST_DATE_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

/** ブラウザが Intl / Asia/Tokyo を扱えない場合の控え（UTC+9 固定計算） */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function formatFallback(now: Date): string {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const weekday = weekdays[jst.getUTCDay()] ?? "";
  return `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日（${weekday}）`;
}

/**
 * 指定日時（既定は現在）を日本時間の「YYYY年M月D日（曜）」に整形する。
 * 日付・曜日が取得できない場合は空文字を返し、画面側では表示しない。
 */
export function formatTodayLabel(now: Date = new Date()): string {
  const source = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();

  try {
    const parts = JST_DATE_FORMATTER.formatToParts(source);
    const pick = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "";

    const year = pick("year");
    const month = pick("month");
    const day = pick("day");
    // ja-JP の weekday は「火」。環境により「火曜日」になる場合だけ曜日を落とす。
    const weekday = pick("weekday").replace(/曜日$/, "");

    if (!year || !month || !day || !weekday) return "";
    return `${year}年${month}月${day}日（${weekday}）`;
  } catch {
    return formatFallback(source);
  }
}