import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import { useAiBatch } from "@/pages/products/context/AiBatchProvider";
import {
  ADMIN_NAV_CATEGORIES,
  ADMIN_NAV_PRIMARY,
  ADMIN_NAV_SETTINGS,
  isAdminNavItemActive,
  isAdminNavSubItemActive,
  type AdminNavCountKey,
  type AdminNavItem,
  type AdminNavSubItem,
} from "./adminNav";
import { useSidebarCounts, type SidebarCounts } from "./useSidebarCounts";

/** 折りたたみ時の幅（64px）／展開時の幅（248px） */
const SIDEBAR_WIDTH_EXPANDED = "w-[248px]";
const SIDEBAR_WIDTH_COLLAPSED = "w-16";

const ROW_ACTIVE =
  "bg-white font-semibold text-[#111111] shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-[#E5E5E5]";
const ROW_IDLE = "font-medium text-[#525252] hover:bg-[#EBEBED]";

function formatCount(value: number): string {
  return value.toLocaleString("ja-JP");
}

/** 件数の取得元から値を取り出す（未取得は null のまま返し、数値を出さない） */
function readCount(
  counts: SidebarCounts | null,
  key: AdminNavCountKey | undefined
): number | null {
  if (!counts || !key) return null;
  if (key === "products") return counts.products;
  return counts.categories[key] ?? null;
}

function readPendingBadge(counts: SidebarCounts | null): number | null {
  if (!counts) return null;
  return counts.documentsPending;
}

/** アイコン（16px・線アイコン・モノクロ） */
function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  return (
    <i
      aria-hidden="true"
      className={`${icon} flex h-4 w-4 shrink-0 items-center justify-center text-[16px] ${
        active ? "text-[#111111]" : "text-[#737373]"
      }`}
    ></i>
  );
}

/** グループ見出し（MENU / カテゴリ） */
function GroupHeading({ children, first }: { children: string; first?: boolean }) {
  return (
    <p
      className={`px-3 text-[11px] font-medium uppercase leading-none tracking-[0.08em] text-[#A3A3A3] ${
        first ? "mt-2" : "mt-5"
      } mb-2`}
    >
      {children}
    </p>
  );
}

/** 通常のナビ行（1行＝1リンク） */
function SidebarRow({
  item,
  active,
  expanded,
  counts,
  onNavigate,
}: {
  item: AdminNavItem;
  active: boolean;
  expanded: boolean;
  counts: SidebarCounts | null;
  onNavigate?: () => void;
}) {
  const count = readCount(counts, item.countKey);
  const badge = readPendingBadge(counts);

  if (!item.to) {
    return (
      <li>
        <span
          aria-disabled="true"
          className={`flex h-10 cursor-default select-none items-center rounded-[10px] text-[14px] ${
            expanded ? "gap-2.5 px-3" : "justify-center"
          } text-[#A3A3A3]`}
        >
          {item.icon && <NavIcon icon={item.icon} active={false} />}
          {expanded && (
            <>
              <span className="min-w-0 flex-1 truncate whitespace-nowrap">
                {item.label}
              </span>
              <span className="shrink-0 text-[10px] font-normal leading-none">
                準備中
              </span>
            </>
          )}
        </span>
      </li>
    );
  }

  return (
    <li>
      <Link
        to={item.to}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        aria-label={expanded ? undefined : item.label}
        title={expanded ? undefined : item.label}
        className={`flex h-10 cursor-pointer items-center rounded-[10px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A3A3A3]/60 ${
          expanded ? "gap-2.5 px-3" : "justify-center"
        } ${active ? ROW_ACTIVE : ROW_IDLE}`}
      >
        {item.icon && <NavIcon icon={item.icon} active={active} />}
        {expanded && (
          <>
            <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[14px]">
              {item.label}
            </span>
            {item.badgeKey && badge !== null && badge > 0 && (
              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#111111] px-1.5 text-[11px] font-medium leading-none text-white">
                {formatCount(badge)}
              </span>
            )}
            {count !== null && (
              <span className="shrink-0 text-[12px] font-normal tabular-nums text-[#737373]">
                {formatCount(count)}
              </span>
            )}
          </>
        )}
      </Link>
    </li>
  );
}

/** サブ項目の行（選択中だけ一段下げて展開する） */
function SidebarSubRow({
  subItem,
  active,
  counts,
  onNavigate,
}: {
  subItem: AdminNavSubItem;
  active: boolean;
  counts: SidebarCounts | null;
  onNavigate?: () => void;
}) {
  const count = readCount(counts, subItem.countKey);
  return (
    <li>
      <Link
        to={subItem.to}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex h-[34px] cursor-pointer items-center gap-2 rounded-[10px] pl-[38px] pr-3 text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A3A3A3]/60 ${
          active ? ROW_ACTIVE : ROW_IDLE
        }`}
      >
        <span className="min-w-0 flex-1 truncate whitespace-nowrap">
          {subItem.label}
        </span>
        {count !== null && (
          <span className="shrink-0 text-[12px] font-normal tabular-nums text-[#737373]">
            {formatCount(count)}
          </span>
        )}
      </Link>
    </li>
  );
}

/** ナビ本体（MENU／カテゴリ。選択中のカテゴリの下にだけサブ項目を出す） */
function SidebarNav({
  expanded,
  counts,
  activeNavTo,
  onNavigate,
}: {
  expanded: boolean;
  counts: SidebarCounts | null;
  activeNavTo?: string;
  onNavigate?: () => void;
}) {
  const { pathname, search } = useLocation();
  // トップ（/）も商品一覧（/products）と同じ画面のため、同じ選択状態にする
  const currentPath = pathname === "/" ? "/products" : pathname;
  const searchParams = new URLSearchParams(search);

  return (
    <>
      <GroupHeading first>MENU</GroupHeading>
      <nav aria-label="管理画面のナビゲーション">
        <ul className="flex flex-col gap-0.5">
          {ADMIN_NAV_PRIMARY.map((item) => (
            <SidebarRow
              key={item.label}
              item={item}
              active={isAdminNavItemActive(item, currentPath, activeNavTo)}
              expanded={expanded}
              counts={counts}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      </nav>

      <GroupHeading>カテゴリ</GroupHeading>
      <nav aria-label="カテゴリ別の商品一覧">
        <ul className="flex flex-col gap-0.5">
          {ADMIN_NAV_CATEGORIES.map((item) => {
            const active = isAdminNavItemActive(item, currentPath, activeNavTo);
            const showSubItems =
              expanded && active && Boolean(item.subItems?.length);
            return (
              <li key={item.label}>
                <ul className="flex flex-col gap-0.5">
                  <SidebarRow
                    item={item}
                    active={active}
                    expanded={expanded}
                    counts={counts}
                    onNavigate={onNavigate}
                  />
                  {showSubItems && (
                    <li>
                      <ul className="flex flex-col gap-0.5">
                        {(item.subItems ?? []).map((subItem) => (
                          <SidebarSubRow
                            key={subItem.label}
                            subItem={subItem}
                            active={isAdminNavSubItemActive(
                              subItem,
                              pathname,
                              searchParams
                            )}
                            counts={counts}
                            onNavigate={onNavigate}
                          />
                        ))}
                      </ul>
                    </li>
                  )}
                </ul>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/** 状態ドット（8px）。色はアンバー／緑／グレーの3種だけ */
function StatusDot({ tone }: { tone: "amber" | "green" | "gray" }) {
  const color =
    tone === "amber" ? "#F59E0B" : tone === "green" ? "#22C55E" : "#A3A3A3";
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    ></span>
  );
}

const CARD_CLASS = "rounded-xl border border-[#E5E5E5] bg-white p-3";
const CARD_HEADING_CLASS =
  "text-[11px] font-medium uppercase leading-none tracking-[0.08em] text-[#A3A3A3]";

/**
 * 底部固定カード（作業状況／環境・設定）。
 * 件数はホームの「作業状況」と同じ既存データを使い、取得できない場合は数値を出さない。
 */
function SidebarStatusCards({
  counts,
  onNavigate,
}: {
  counts: SidebarCounts | null;
  onNavigate?: () => void;
}) {
  const { isTestMode } = useOperatingMode();
  const aiBatch = useAiBatch();

  const activeRun = aiBatch.runs.find((run) => run.is_active) ?? null;
  const currentStatus =
    activeRun?.overall_status ??
    (aiBatch.hasActiveBatch ? aiBatch.batchStatus : null);
  const isAiRunning = currentStatus !== null;

  let aiCount: number | null = null;
  if (isAiRunning) {
    if (activeRun) {
      aiCount = activeRun.eligible_count ?? null;
    } else if (aiBatch.hasActiveBatch && aiBatch.countsConfirmed && aiBatch.items) {
      aiCount = aiBatch.items.length;
    }
  }

  const pending = counts?.documentsPending ?? null;

  return (
    <>
      <div className={CARD_CLASS}>
        <p className={CARD_HEADING_CLASS}>作業状況</p>
        <div className="mt-1.5 flex flex-col">
          <Link
            to="/documents"
            onClick={onNavigate}
            className="-mx-1 flex h-7 cursor-pointer items-center gap-2 rounded-md px-1 text-[13px] transition-colors hover:bg-[#F4F4F5]"
          >
            <StatusDot tone="amber" />
            <span className="min-w-0 flex-1 truncate text-[#525252]">
              仕入照合
            </span>
            <span className="shrink-0 tabular-nums text-[#111111]">
              {pending === null ? "—" : formatCount(pending)}
            </span>
          </Link>
          <div className="flex h-7 items-center gap-2 text-[13px]">
            <StatusDot tone={isAiRunning ? "green" : "gray"} />
            <span className="shrink-0 text-[#525252]">AI生成</span>
            <span className="min-w-0 flex-1 truncate whitespace-nowrap text-right text-[12px] text-[#737373]">
              {isAiRunning
                ? aiCount === null
                  ? "実行中"
                  : `${formatCount(aiCount)} 件`
                : "実行中の処理なし"}
            </span>
          </div>
        </div>
      </div>

      <div className={CARD_CLASS}>
        <p className={CARD_HEADING_CLASS}>環境・設定</p>
        <div className="mt-1.5 flex flex-col">
          <div className="flex h-7 items-center justify-between gap-2 text-[13px]">
            <span className="shrink-0 text-[#525252]">環境</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate whitespace-nowrap font-medium text-[#111111]">
                {isTestMode ? "テストモード" : "通常モード"}
              </span>
              {isTestMode && (
                <span
                  aria-label="テスト環境"
                  className="inline-flex h-[20px] shrink-0 select-none items-center rounded border border-amber-300/70 bg-amber-50 px-1.5 text-[11px] font-medium leading-none tracking-[0.06em] text-amber-800"
                >
                  TEST
                </span>
              )}
            </span>
          </div>
          <Link
            to={ADMIN_NAV_SETTINGS.to as string}
            onClick={onNavigate}
            className="-mx-1 mt-0.5 flex h-7 cursor-pointer items-center gap-2 rounded-md px-1 text-[13px] text-[#525252] transition-colors hover:bg-[#F4F4F5] hover:text-[#111111]"
          >
            <NavIcon icon={ADMIN_NAV_SETTINGS.icon as string} active={false} />
            <span className="min-w-0 flex-1 truncate whitespace-nowrap">
              {ADMIN_NAV_SETTINGS.label}
            </span>
          </Link>
        </div>
      </div>
    </>
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
 * - 展開時 248px／折りたたみ時 64px
 * - 上部の開閉コントロールで切り替える（状態は AdminNavProvider が保持）
 * - 高さは表示領域いっぱいに固定し、ナビ部分だけがスクロールする
 *   （底部の「作業状況」「環境・設定」カードは常に下端に固定）
 * - サイドバーは通常のレイアウト内に置くため、本文の上に重ならない
 * - タッチ端末では表示せず、ヘッダーのメニューからドロワーで開く
 */
export function AdminSidebar({
  expanded,
  onToggle,
  activeNavTo,
}: AdminSidebarProps) {
  const { isTestMode } = useOperatingMode();
  const counts = useSidebarCounts(isTestMode);
  const toggleButtonRef = useRef<HTMLButtonElement | null>(null);

  /**
   * ナビ本体を描画してよいか。
   * - 閉じるとき: 文字が残らないよう、即座に false（＝描画しない）
   * - 開くとき: 幅のアニメーション（150ms）が終わった後に true
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
      className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-[#E4E4E7] bg-[#F4F4F5] motion-safe:transition-[width] motion-safe:duration-150 motion-safe:ease-out lg:flex ${
        expanded ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED
      }`}
    >
      <div className="flex h-full min-h-0 flex-col px-3 pb-3 pt-4">
        {/* 開閉コントロール（展開時は右寄せ、折りたたみ時は中央） */}
        <div
          className={`flex h-8 shrink-0 items-center ${
            expanded ? "justify-end" : "justify-center"
          }`}
        >
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
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-[#737373] transition-colors hover:bg-[#EBEBED] hover:text-[#111111] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A3A3A3]/60"
          >
            <i
              aria-hidden="true"
              className={`${
                expanded
                  ? "ri-arrow-left-double-line"
                  : "ri-arrow-right-double-line"
              } flex h-4 w-4 items-center justify-center text-[16px]`}
            ></i>
          </button>
        </div>

        {/* ナビ本体: 閉じている間は描画しない（見切れ文字・フォーカス残りを防ぐ） */}
        {navVisible ? (
          <div
            id="admin-sidebar-nav"
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="-mr-1 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 pb-1">
              <SidebarNav
                expanded={expanded}
                counts={counts}
                activeNavTo={activeNavTo}
              />
            </div>

            <div className="mt-3 flex shrink-0 flex-col gap-2.5">
              {expanded ? (
                <SidebarStatusCards counts={counts} />
              ) : (
                <Link
                  to={ADMIN_NAV_SETTINGS.to as string}
                  aria-label={ADMIN_NAV_SETTINGS.label}
                  title={ADMIN_NAV_SETTINGS.label}
                  className="flex h-10 cursor-pointer items-center justify-center rounded-[10px] text-[#525252] transition-colors hover:bg-[#EBEBED] hover:text-[#111111] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A3A3A3]/60"
                >
                  <NavIcon
                    icon={ADMIN_NAV_SETTINGS.icon as string}
                    active={false}
                  />
                </Link>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

interface AdminNavDrawerProps {
  open: boolean;
  onClose: () => void;
  activeNavTo?: string;
}

/**
 * タブレット／スマートフォン用のナビゲーション（ドロワー）。
 * デスクトップ版と同じ行・件数・底部カードを、同じ寸法（248px）で表示する。
 */
export function AdminNavDrawer({
  open,
  onClose,
  activeNavTo,
}: AdminNavDrawerProps) {
  const { isTestMode } = useOperatingMode();
  const counts = useSidebarCounts(isTestMode);
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
        className="absolute left-0 top-0 flex h-full w-[248px] max-w-[85vw] flex-col border-r border-[#E4E4E7] bg-[#F4F4F5]"
      >
        <div className="flex h-12 shrink-0 items-center justify-between px-3">
          <span className="text-[11px] font-medium leading-none tracking-[0.08em] text-[#A3A3A3]">
            MENU
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="ナビゲーションを閉じる"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] text-[#737373] transition-colors hover:bg-[#EBEBED] hover:text-[#111111]"
          >
            <i aria-hidden="true" className="ri-close-line text-[16px]"></i>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-1">
          <SidebarNav
            expanded
            counts={counts}
            activeNavTo={activeNavTo}
            onNavigate={onClose}
          />
        </div>
        <div className="flex shrink-0 flex-col gap-2.5 px-3 pb-3 pt-1">
          <SidebarStatusCards counts={counts} onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}

export default AdminSidebar;