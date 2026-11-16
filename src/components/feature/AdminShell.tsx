import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import { adminThemeClass } from "@/lib/adminTheme";
import AdminHeader, {
  type AdminHeaderAiHistory,
  type AdminHeaderBackLink,
} from "./AdminHeader";
import { AdminSidebar, AdminNavDrawer } from "./AdminSidebar";

const NAV_COLLAPSED_STORAGE_KEY = "bis.admin.nav_collapsed.v1";

function readNavCollapsed(): boolean {
  try {
    return window.localStorage.getItem(NAV_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeNavCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(
      NAV_COLLAPSED_STORAGE_KEY,
      collapsed ? "1" : "0"
    );
  } catch {
    // ストレージ不可時も、その場の開閉操作自体は継続する
  }
}

interface AdminShellProps {
  /** ヘッダーに出す現在のページ名 */
  pageTitle: string;
  /** 一覧へ戻る導線（詳細・下位画面のみ） */
  backLink?: AdminHeaderBackLink;
  /** 画面固有のテキスト操作（例: ポケカ素地取込） */
  headerExtras?: ReactNode;
  /** AI生成履歴への入口（履歴を持つ画面だけ） */
  aiHistory?: AdminHeaderAiHistory;
  /** 本文領域のクラス（余白・最大幅は画面ごとに保つ） */
  mainClassName?: string;
  /** ルート要素に追加するクラス（商品詳細の .catalogue など） */
  rootClassName?: string;
  children: ReactNode;
}

/**
 * 管理画面の共通レイアウト。
 *
 * 構造（ヘッダー＋サイドナビ＋本文）だけを共通化し、
 * 各画面の内容・データ取得・処理はそのまま維持する。
 *
 * - デスクトップ: 左にコンパクトなサイドナビ（折りたたみ可）
 * - タブレット／スマートフォン: ヘッダーのメニューからドロワー表示
 * - テーマ: 既存の OperatingModeProvider（通常／テスト）に連動
 */
export default function AdminShell({
  pageTitle,
  backLink,
  headerExtras,
  aiHistory,
  mainClassName = "",
  rootClassName = "",
  children,
}: AdminShellProps) {
  const { isTestMode } = useOperatingMode();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(readNavCollapsed);
  const [navOpen, setNavOpen] = useState(false);

  // 画面が変わったらドロワーは閉じる（遷移後に被らないようにする）
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      writeNavCollapsed(next);
      return next;
    });
  };

  return (
    <div
      className={`admin-font products-theme ${adminThemeClass(
        isTestMode
      )} min-h-screen bg-background-50 ${rootClassName}`}
    >
      <AdminHeader
        pageTitle={pageTitle}
        backLink={backLink}
        extras={headerExtras}
        aiHistory={aiHistory}
        navCollapsed={collapsed}
        onOpenNav={() => setNavOpen(true)}
      />

      <div className="flex w-full items-start">
        {!collapsed && <AdminSidebar onToggleCollapse={toggleCollapsed} />}
        <main className={`min-w-0 flex-1 ${mainClassName}`}>{children}</main>
      </div>

      <AdminNavDrawer open={navOpen} onClose={() => setNavOpen(false)} />
    </div>
  );
}