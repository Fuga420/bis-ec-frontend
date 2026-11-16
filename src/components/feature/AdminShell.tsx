import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import { adminThemeClass } from "@/lib/adminTheme";
import AdminHeader, {
  type AdminHeaderAiHistory,
  type AdminHeaderBackLink,
  type AdminHeaderBreadcrumb,
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
  /** 現在地より上の階層（2階層以上のパンくず）。指定時は backLink より優先する */
  breadcrumbs?: AdminHeaderBreadcrumb[];
  /**
   * サイドナビで選択中として扱うパス。
   * /products/:id のように複数の入口を持つ画面で、実際の遷移元を優先するために使う。
   */
  activeNavTo?: string;
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
  breadcrumbs,
  activeNavTo,
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
        breadcrumbs={breadcrumbs}
        extras={headerExtras}
        aiHistory={aiHistory}
        navCollapsed={collapsed}
        onOpenNav={() => setNavOpen(true)}
      />

      <div className="flex w-full items-start">
        {!collapsed && (
          <AdminSidebar
            onToggleCollapse={toggleCollapsed}
            activeNavTo={activeNavTo}
          />
        )}
        <main className={`min-w-0 flex-1 ${mainClassName}`}>{children}</main>
      </div>

      <AdminNavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        activeNavTo={activeNavTo}
      />
    </div>
  );
}