import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  buildAddProductReturn,
  buildAddProductReturnState,
} from "@/lib/addProductReturn";
import {
  getAddProductOptions,
  type AddProductOption,
} from "./addProductOptions";

/**
 * ヘッダー右側の「商品を追加」メニュー。
 *
 * 以前ヘッダーに並んでいた個別ボタンを1つの入口に統合する。
 * 項目はパス（カテゴリ）に応じて getAddProductOptions が返し、
 * 遷移先は既存画面（/register, /import など）のまま。新しい登録フローは作らない。
 *
 * - 外側クリック・Escape で閉じる
 * - ↑↓ / Home / End で項目移動、Enter で決定（各項目はリンク）
 * - 画面端ではみ出さないよう max-width を画面幅に制限する
 */
export default function AddProductMenu() {
  const { pathname, search } = useLocation();
  const options = getAddProductOptions(pathname);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const menuId = useId();

  // パスが変わったら閉じる（遷移後に開いたままにならないようにする）
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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

  // 開いた直後は最初の項目へフォーカスを移す（キーボードだけでも操作できるように）
  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
  }, [open]);

  const focusItem = (index: number) => {
    const items = itemRefs.current.filter(
      (item): item is HTMLAnchorElement => item !== null
    );
    if (items.length === 0) return;
    const next = (index + items.length) % items.length;
    items[next]?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current.filter(
      (item): item is HTMLAnchorElement => item !== null
    );
    if (items.length === 0) return;
    const currentIndex = items.findIndex((item) => item === document.activeElement);

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(currentIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem(currentIndex <= 0 ? items.length - 1 : currentIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        focusItem(items.length - 1);
        break;
      case "Tab":
        // Tab はメニューを閉じて自然な順序で抜ける
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const renderItem = (option: AddProductOption, index: number) => (
    <Link
      key={option.key}
      to={option.to}
      // 一覧の検索・絞り込み・ページ番号は戻り先URLとして既存のクエリをそのまま渡す。
      state={buildAddProductReturnState(
        buildAddProductReturn(pathname, search)
      )}
      role="menuitem"
      ref={(el) => {
        itemRefs.current[index] = el;
      }}
      onClick={() => setOpen(false)}
      className={`flex w-full cursor-pointer flex-col gap-0.5 px-3 py-2.5 outline-none transition-colors hover:bg-background-100 focus-visible:bg-background-100 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-foreground-300 ${
        index > 0 ? "border-t border-background-200" : ""
      }`}
    >
      <span className="text-[13px] font-semibold leading-tight text-foreground-950">
        {option.label}
      </span>
      <span className="text-[11px] font-normal leading-snug text-foreground-500">
        {option.description}
      </span>
    </Link>
  );

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className={`product-header-cta${open ? " is-open" : ""}`}
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
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full z-40 mt-1.5 max-h-[calc(100vh-5rem)] w-[272px] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-lg border border-background-200 bg-white py-1.5"
        >
          {options.map(renderItem)}
        </div>
      )}
    </div>
  );
}