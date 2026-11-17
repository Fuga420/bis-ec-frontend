import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ADMIN_NAV_CATEGORIES,
  ADMIN_NAV_FOOTER,
  ADMIN_NAV_PRIMARY,
  isAdminNavItemActive,
  type AdminNavItem,
} from "./adminNav";

/** 遷移できる項目の行（選択中は控えめな背景と左ラインだけで示す） */
function AdminNavLinkRow({
  item,
  active,
  onNavigate,
}: {
  item: AdminNavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <li>
      <Link
        to={item.to as string}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex h-9 cursor-pointer items-center border-l-2 pl-2 pr-2.5 text-[13px] transition-colors focus:outline-none focus-visible:bg-background-100 focus-visible:ring-1 focus-visible:ring-foreground-300 ${
          active
            ? "border-foreground-900 bg-background-100 font-semibold text-foreground-950"
            : "border-transparent font-medium text-foreground-600 hover:bg-background-100/70 hover:text-foreground-950"
        }`}
      >
        <span className="whitespace-nowrap">{item.label}</span>
      </Link>
    </li>
  );
}

/** 未実装（準備中）の行。存在しない画面へは移動させない */
function AdminNavPendingRow({ label }: { label: string }) {
  return (
    <li>
      <span
        aria-disabled="true"
        className="flex h-9 cursor-default select-none items-center justify-between gap-2 border-l-2 border-transparent pl-2 pr-2.5 text-[13px] font-medium text-foreground-400"
      >
        <span className="whitespace-nowrap">{label}</span>
        <span className="shrink-0 text-[10px] font-normal leading-none text-foreground-400/80">
          準備中
        </span>
      </span>
    </li>
  );
}

/**
 * ナビゲーションの項目一覧（サイドバーとドロワーで共通利用する）。
 * すべて単一のリンク（または準備中表示）で構成し、行内に別の操作は置かない。
 */
function AdminNavList({
  items,
  onNavigate,
  activeNavTo,
}: {
  items: AdminNavItem[];
  onNavigate?: () => void;
  /** 遷移元が分かっている画面で、そのカテゴリを選択中にする */
  activeNavTo?: string;
}) {
  const { pathname } = useLocation();
  // トップ（/）も商品一覧（/products）と同じ画面のため、同じ選択状態にする
  const currentPath = pathname === "/" ? "/products" : pathname;

  return (
    <ul className="flex flex-col">
      {items.map((item) =>
        item.to ? (
          <AdminNavLinkRow
            key={item.label}
            item={item}
            active={isAdminNavItemActive(item, currentPath, activeNavTo)}
            onNavigate={onNavigate}
          />
        ) : (
          <AdminNavPendingRow key={item.label} label={item.label} />
        )
      )}
    </ul>
  );
}

/** まとまりの見出し（共通・カテゴリ） */
function AdminNavHeading({ children }: { children: string }) {
  return (
    <p className="whitespace-nowrap px-2 pb-1.5 pt-1 text-[10.5px] font-semibold leading-none tracking-[0.12em] text-foreground-400">
      {children}
    </p>
  );
}

interface AdminSidebarProps {
  /** 展開中かどうか（クリックで切り替える。ホバーでは開かない） */
  expanded: boolean;
  onToggle: () => void;
  activeNavTo?: string;
}

/**
 * デスクトップ用のサイドナビゲーション。
 *
 * - 折りたたみ時は幅48pxのレールのみ
 * - 上部の開閉コントロールをクリックすると232pxへ展開する
 * - サイドバーは通常のレイアウト内に置くため、本文の上に重ならない
 *   （展開すると本文の開始位置がその分だけ右へ移る）
 * - タッチ端末では表示せず、ヘッダーのメニューからドロワーで開く
 */
export function AdminSidebar({
  expanded,
  onToggle,
  activeNavTo,
}: AdminSidebarProps) {
  const toggleButtonRef = useRef<HTMLButtonElement | null>(null);

  /**
   * ナビ本体を描画してよいか。
   * - 閉じるとき: 文字が残らないよう、即座に false（＝描画しない）
   * - 開くとき: 幅のアニメーション（150ms）が終わった後に true
   * これにより、幅の狭い領域にテキストが切り取られて残ることはない。
   */
  const [navVisible, setNavVisible] = useState(expanded);

  useEffect(() => {
    if (!expanded) {
      setNavVisible(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setNavVisible(true), 170);
    return () => window.clearTimeout(timer);
  }, [expanded]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || !expanded) return;
    event.stopPropagation();
    onToggle();
    toggleButtonRef.current?.focus();
  };

  return (
    <aside
      aria-label="サイドナビゲーション"
      onKeyDown={handleKeyDown}
      data-expanded={expanded ? "true" : "false"}
      className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-background-200 bg-background-50 motion-safe:transition-[width] motion-safe:duration-150 motion-safe:ease-out lg:flex ${
        expanded ? "w-[232px]" : "w-12"
      }`}
    >
      {/* 開閉コントロール（サイドバー上部に固定） */}
      <div className="flex h-11 shrink-0 items-center justify-center px-1.5">
        <button
          ref={toggleButtonRef}
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls="admin-sidebar-nav"
          aria-label={
            expanded
              ? "サイドナビゲーションを折りたたむ"
              : "サイドナビゲーションを展開"
          }
          title={expanded ? "折りたたむ" : "ナビゲーションを展開"}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground-300"
        >
          <i
            aria-hidden="true"
            className={`${
              expanded ? "ri-arrow-left-s-line" : "ri-arrow-right-s-line"
            } flex h-4 w-4 items-center justify-center text-[16px]`}
          ></i>
        </button>
      </div>

      {/* ナビ本体: 閉じている間は描画しない（見切れ文字・フォーカス残りを防ぐ） */}
      {navVisible ? (
        <div
          id="admin-sidebar-nav"
          className="flex min-h-0 flex-1 flex-col w-[232px]"
        >
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2 pt-1">
            <AdminNavHeading>MENU</AdminNavHeading>
            <nav aria-label="管理画面のナビゲーション">
              <AdminNavList
                items={ADMIN_NAV_PRIMARY}
                activeNavTo={activeNavTo}
              />
            </nav>

            <div className="mt-4">
              <AdminNavHeading>カテゴリ</AdminNavHeading>
              <nav aria-label="カテゴリ別の商品一覧">
                <AdminNavList
                  items={ADMIN_NAV_CATEGORIES}
                  activeNavTo={activeNavTo}
                />
              </nav>
            </div>
          </div>
          {/* 設定は最下部に固定する */}
          <div className="shrink-0 border-t border-background-200 px-1.5 py-2">
            <nav aria-label="設定">
              <AdminNavList
                items={ADMIN_NAV_FOOTER}
                activeNavTo={activeNavTo}
              />
            </nav>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

interface AdminNavDrawerProps {
  open: boolean;
  onClose: () => void;
  activeNavTo?: string;
}

/**
 * タブレット／スマートフォン用のナビゲーション。
 * ホバーでは開かず、ヘッダーのメニュー操作からのドロワー表示のみ使う。
 */
export function AdminNavDrawer({
  open,
  onClose,
  activeNavTo,
}: AdminNavDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    // 開いた直後は閉じる操作にフォーカスを移す
    closeButtonRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        tabIndex={-1}
        aria-label="ナビゲーションを閉じる"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/30"
      ></button>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="管理画面のメニュー"
        className="absolute left-0 top-0 flex h-full w-[248px] max-w-[85vw] flex-col border-r border-background-200 bg-background-50"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-background-200 px-3 py-2.5">
          <span className="text-[11px] font-semibold leading-none tracking-[0.1em] text-foreground-400">
            MENU
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="ナビゲーションを閉じる"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-900"
          >
            <i aria-hidden="true" className="ri-close-line text-[16px]"></i>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
          <nav aria-label="管理画面のナビゲーション">
            <AdminNavList
              items={ADMIN_NAV_PRIMARY}
              onNavigate={onClose}
              activeNavTo={activeNavTo}
            />
          </nav>
          <div className="mt-4">
            <AdminNavHeading>カテゴリ</AdminNavHeading>
            <nav aria-label="カテゴリ別の商品一覧">
              <AdminNavList
                items={ADMIN_NAV_CATEGORIES}
                onNavigate={onClose}
                activeNavTo={activeNavTo}
              />
            </nav>
          </div>
        </div>
        <div className="shrink-0 border-t border-background-200 px-2 py-3">
          <nav aria-label="設定">
            <AdminNavList
              items={ADMIN_NAV_FOOTER}
              onNavigate={onClose}
              activeNavTo={activeNavTo}
            />
          </nav>
        </div>
      </div>
    </div>
  );
}

export default AdminSidebar;