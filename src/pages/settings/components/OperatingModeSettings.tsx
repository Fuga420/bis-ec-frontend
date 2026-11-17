import {
  useOperatingMode,
  type OperatingMode,
} from "@/context/OperatingModeProvider";
import SettingsRow from "./SettingsRow";

const OPTIONS: { value: OperatingMode; label: string }[] = [
  { value: "normal", label: "通常モード" },
  { value: "test", label: "テストモード" },
];

/**
 * 環境（通常モード／テストモード）の設定。
 *
 * 切り替えは既存の OperatingModeProvider の setMode を呼ぶだけで、
 * 保存先（sessionStorage）・一括処理中のロック・テーマ連動は今までどおり。
 * ここでは入口の位置だけを設定ページへ移している。
 */
export default function OperatingModeSettings() {
  const { mode, setMode, isSwitchLocked } = useOperatingMode();

  const handleSelect = (next: OperatingMode) => {
    if (isSwitchLocked || next === mode) return;
    setMode(next);
  };

  return (
    <>
      <SettingsRow
        label="現在の環境"
        control={
          <span className="text-[14px] font-semibold leading-none text-foreground-950">
            {mode === "test" ? "テストモード" : "通常モード"}
          </span>
        }
      />

      <div
        role="radiogroup"
        aria-label="表示環境"
        aria-disabled={isSwitchLocked}
        className="flex flex-col"
      >
        {OPTIONS.map((option) => {
          const selected = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={isSwitchLocked}
              onClick={() => handleSelect(option.value)}
              className={`flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-3 border-l-2 px-2.5 text-left text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? "border-foreground-900 bg-background-50 font-semibold text-foreground-950"
                  : "border-transparent font-medium text-foreground-700 hover:bg-background-50 hover:text-foreground-950"
              }`}
            >
              <span className="whitespace-nowrap">{option.label}</span>
              {selected && (
                <span className="shrink-0 text-[12px] font-normal text-foreground-500">
                  使用中
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isSwitchLocked && (
        <p className="py-2 text-[12px] leading-relaxed text-foreground-500">
          処理実行中はモードを切り替えられません
        </p>
      )}
    </>
  );
}