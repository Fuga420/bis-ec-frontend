import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ADMIN_NAV_GROUPS, isAdminNavItemActive } from "./adminNav";

/**
 * ナビゲーションの項目一覧（サイドバーとドロワーで共通利用する）。
 * テキストのみで構成し、選択中だけ左側の細いラインと淡い背景で示す。
 */
function AdminNavList({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();

  return (
    <nav aria-label="管理画面のナビゲーション" className="flex flex-col">
      {ADMIN_NAV_GROUPS.map((group, groupIndex) => (
        <div key={group.id} className={groupIndex === 0 ? "" : "mt-5"}>
          <p className="px-2 pb-1.5 text-[10.5px] font-semibold leading-none tracking-[0.1em] text-foreground-400">
            {group.label}
          </p>
          <ul>
            {group.items.map((item) => {
              if (!item.to) {
                // 未実装カテゴリ: 遷移させず、控えめに「準備中」とだけ示す
                return (
                  <li key={item.label}>
                    <span
                      aria-disabled="true"
                      className="flex h-9 cursor-default select-none items-center justify-between gap-2 border-l-2 border-transparent pl-2 pr-2.5 text-[13px] font-medium text-foreground-400"
                    >
                      <span className="truncate">{item.label}</span>
                      <span className="shrink-0 text-[10px] font-normal leading-none text-foreground-400/80">
                        準備中
                      </span>
                    </span>
                  </li>
                );
              }

              const active = isAdminNavItemActive(item, pathname);
              return (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-9 cursor-pointer items-center border-l-2 pl-2 pr-2.5 text-[13px] transition-colors ${
                      active
                        ? "border-foreground-900 bg-background-100 font-semibold text-foreground-950"
                        : "border-transparent font-medium text-foreground-600 hover:bg-background-100/70 hover:text-foreground-950"
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

interface AdminSidebarProps {
  onToggleCollapse: () => void;
}

/**
 * デスクトップ用のコンパクトなサイドナビゲーション（幅216px）。
 * 背景色は付けず、ページ背景に馴染ませる（右側の細い罫線のみ）。
 * ページの縦スクロールに対しては sticky で位置を維持する。
 */
export function AdminSidebar({ onToggleCollapse }: AdminSidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[216px] shrink-0 flex-col border-r border-background-200 bg-transparent lg:flex">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-4">
        <AdminNavList />
      </div>
      <div className="shrink-0 border-t border-background-200 px-2 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="サイドナビゲーションを折りたたむ"
          className="flex h-8 w-full cursor-pointer items-center gap-1.5 rounded-md px-2 text-left text-[11.5px] font-medium text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-800"
        >
          <i
            aria-hidden="true"
            className="ri-arrow-left-s-line flex h-3.5 w-3.5 items-center justify-center text-[14px]"
          ></i>
          折りたたむ
        </button>
      </div>
    </aside>
  );
}

interface AdminNavDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 折りたたみ時・タブレット／スマートフォン用のナビゲーション。
 * サイドバーを閉じていても、ここから主要なナビゲーションへアクセスできる。
 */
export function AdminNavDrawer({ open, onClose }: AdminNavDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="ナビゲーションを閉じる"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/30"
      ></button>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="管理画面のメニュー"
        className="absolute left-0 top-0 flex h-full w-[248px] max-w-[85vw] flex-col border-r border-background-200 bg-white"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-background-200 px-3 py-2.5">
          <span className="text-[11px] font-semibold leading-none tracking-[0.1em] text-foreground-400">
            MENU
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-900"
          >
            <i aria-hidden="true" className="ri-close-line text-[16px]"></i>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
          <AdminNavList onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}

/**
 * 折りたたみ状態からナビゲーションを開くためのボタン用ラッパー。
 * （ヘッダー側で表示制御するため、実体は AdminHeader が描画する）
 */
export default AdminSidebar;