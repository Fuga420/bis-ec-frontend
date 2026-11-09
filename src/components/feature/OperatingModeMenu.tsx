import { useEffect, useId, useRef, useState } from "react";
import {
  useOperatingMode,
  type OperatingMode,
} from "@/context/OperatingModeProvider";

const OPTIONS: {
  value: OperatingMode;
  label: string;
  description: string;
}[] = [
  {
    value: "normal",
    label: "通常モード",
    description: "実商品のみを表示・対象にします",
  },
  {
    value: "test",
    label: "テストモード",
    description: "テスト商品のみを表示・対象にします",
  },
];

/**
 * 商品管理ヘッダー右端の「環境切り替え」メニュー。
 *
 * - 常時目立たせず、設定アイコンから通常モード／テストモードを切り替える。
 * - 切り替えは既存の OperatingModeProvider（setMode）をそのまま呼び出すだけで、
 *   モードの判定・保存ロジックは新たに持たない。
 */
export default function OperatingModeMenu() {
  const { mode, setMode, isSwitchLocked } = useOperatingMode();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // 開いている間だけ、外側クリックと Esc キーで閉じる。
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const container = containerRef.current;
      if (!container) return;
      if (container.contains(event.target as Node)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = (next: OperatingMode) => {
    if (isSwitchLocked) return;
    setMode(next);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="環境切り替え"
        title="環境切り替え"
        onClick={() => setOpen((prev) => !prev)}
        className={`product-header-icon-btn${open ? " is-open" : ""}`}
      >
        <i
          className="ri-settings-2-line"
          aria-hidden="true"
        ></i>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="表示環境"
          className="absolute right-0 top-full z-40 mt-1.5 w-[228px] max-w-[calc(100vw-2rem)] rounded-lg border border-background-200 bg-white py-1.5"
        >
          <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold leading-none tracking-[0.08em] text-foreground-400">
            表示環境
          </p>
          {OPTIONS.map((option) => {
            const selected = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                disabled={isSwitchLocked}
                onClick={() => handleSelect(option.value)}
                className={`flex w-full cursor-pointer items-center gap-2 whitespace-nowrap px-3 py-2 text-left transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected
                    ? "font-semibold text-foreground-950"
                    : "font-medium text-foreground-700"
                }`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[13px] leading-tight">
                    {option.label}
                  </span>
                  <span className="mt-0.5 text-[11px] font-normal leading-tight text-foreground-400">
                    {option.description}
                  </span>
                </span>
                {selected && (
                  <i
                    className={`ri-check-line h-4 w-4 shrink-0 text-[15px] flex items-center justify-center ${
                      option.value === "test"
                        ? "text-amber-700"
                        : "text-primary-600"
                    }`}
                    aria-hidden="true"
                  ></i>
                )}
              </button>
            );
          })}
          {isSwitchLocked && (
            <p className="border-t border-background-200 px-3 pt-1.5 pb-1 text-[11px] leading-relaxed text-foreground-400">
              処理実行中はモードを切り替えられません
            </p>
          )}
        </div>
      )}
    </div>
  );
}