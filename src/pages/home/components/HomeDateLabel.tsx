import { useTodayLabel } from "@/pages/home/hooks/useTodayLabel";

/**
 * ホームの日付。日本時間の今日を「2026年11月17日（火）」の形で控えめに出す。
 * 日付と曜日は同じ日時値から生成するため、曜日だけがずれることはない。
 */
export default function HomeDateLabel() {
  const label = useTodayLabel();
  if (!label) return null;

  return (
    <div className="flex w-full justify-end">
      <p className="text-[12px] leading-none text-foreground-500">{label}</p>
    </div>
  );
}