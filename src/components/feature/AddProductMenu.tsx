import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";

const ADD_OPTIONS = [
  {
    to: "/register",
    label: "商品を登録",
    description: "画像と商品情報から1点ずつ登録します",
  },
  {
    to: "/import",
    label: "画像だけ取込",
    description: "画像セットから下書きをまとめて取り込みます",
  },
];

/**
 * ヘッダー右側の「商品を追加」メニュー。
 *
 * 以前ヘッダーに並んでいた「新しい商品を登録」と「画像だけ取込」を1つの入口に統合する。
 * 遷移先は既存画面（/register, /import）のままで、新しい登録フローは作らない。
 */
export default function AddProductMenu() {
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
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className={`product-cta product-header-cta${open ? " is-open" : ""}`}
      >
        商品を追加
        <i
          aria-hidden="true"
          className={`ri-arrow-down-s-line transition-transform ${
            open ? "rotate-180" : ""
          }`}
        ></i>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="商品を追加"
          className="absolute right-0 top-full z-40 mt-1.5 w-[272px] max-w-[calc(100vw-2rem)] rounded-lg border border-background-200 bg-white py-1.5"
        >
          {ADD_OPTIONS.map((option) => (
            <Link
              key={option.to}
              to={option.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full cursor-pointer flex-col gap-0.5 px-3 py-2 transition-colors hover:bg-background-100"
            >
              <span className="text-[13px] font-semibold leading-tight text-foreground-950">
                {option.label}
              </span>
              <span className="text-[11px] font-normal leading-snug text-foreground-500">
                {option.description}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}