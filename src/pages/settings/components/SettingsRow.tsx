import type { ReactNode } from "react";

interface SettingsRowProps {
  label: string;
  /** 行の右側に置く値・操作 */
  control?: ReactNode;
  children?: ReactNode;
}

/**
 * 設定の1項目。ラベルを左、値や操作を右に横並びで置く。
 * 説明文は付けず、境界線と余白だけで区切る。
 */
export default function SettingsRow({
  label,
  control,
  children,
}: SettingsRowProps) {
  return (
    <div className="flex min-h-[44px] flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <p className="min-w-0 text-[14px] font-medium leading-tight text-foreground-800">
        {label}
      </p>
      {control ? (
        <div className="flex shrink-0 items-center gap-2">{control}</div>
      ) : null}
      {children}
    </div>
  );
}