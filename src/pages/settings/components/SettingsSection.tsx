import type { ReactNode } from "react";

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
}

/**
 * 設定ページの区画。
 * ホームと同じ最小限のカード（ui-card）を使い、影・装飾背景は増やさない。
 * 見出しは 15px / 600、項目は境界線だけで区切る。
 */
export default function SettingsSection({
  title,
  children,
}: SettingsSectionProps) {
  return (
    <section className="ui-card w-full rounded-lg px-4 py-4 md:px-5">
      <h2 className="bis-section-title">{title}</h2>
      <div className="mt-3 divide-y divide-background-200">{children}</div>
    </section>
  );
}