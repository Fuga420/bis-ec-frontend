import { useEffect, useState } from "react";
import { formatTodayLabel } from "@/pages/home/lib/todayLabel";

/**
 * 日本時間の今日の日付ラベル。
 *
 * 画面を開いた時点の値で初期化し、1分ごと（とタブ復帰時）に作り直して
 * 日付が変わったときだけ表示を差し替える。固定の日付・曜日は持たない。
 */
export function useTodayLabel(): string {
  const [label, setLabel] = useState(() => formatTodayLabel());

  useEffect(() => {
    const update = () => {
      const next = formatTodayLabel();
      setLabel((prev) => (prev === next ? prev : next));
    };

    update();
    const timer = window.setInterval(update, 60 * 1000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return label;
}