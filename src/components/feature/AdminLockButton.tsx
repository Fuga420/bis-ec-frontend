import { useEffect, useId, useRef, useState } from "react";
import { useAdminAuth } from "@/context/AdminAuthProvider";

/**
 * 管理画面ヘッダー右端の「ログアウト」ボタン。
 * 押すと確認パネルを開き、確定したときだけ保持（localStorage）を削除してロック画面へ戻す。
 * 誤タップで作業中にロックされないよう、1クリックでは消さない。
 */
export default function AdminLockButton() {
  const { lock } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

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

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="ログアウト"
        title="ログアウト"
        onClick={() => setOpen((prev) => !prev)}
        className={`product-header-icon-btn${open ? " is-open" : ""}`}
      >
        <i className="ri-logout-box-r-line" aria-hidden="true"></i>
      </button>

      {open && (
        <div
          id={menuId}
          role="dialog"
          aria-label="ログアウトの確認"
          className="absolute right-0 top-full z-40 mt-1.5 w-[264px] max-w-[calc(100vw-2rem)] rounded-lg border border-background-200 bg-white p-3.5"
        >
          <p className="text-[13px] font-semibold leading-tight text-foreground-950">
            ログアウトしますか？
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-foreground-500">
            このブラウザに保持しているパスワードを削除し、ロック画面に戻します。
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
              className="h-8 cursor-pointer whitespace-nowrap rounded-md border border-background-300 bg-background-50 px-3 text-[12px] font-medium text-foreground-700 transition-colors hover:bg-background-100"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                lock();
              }}
              className="h-8 cursor-pointer whitespace-nowrap rounded-md bg-foreground-950 px-3 text-[12px] font-semibold text-background-50 transition-opacity hover:opacity-90"
            >
              ログアウト
            </button>
          </div>
        </div>
      )}
    </div>
  );
}