import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * デスクトップ用サイドナビの開閉状態。
 *
 * 各ページのレイアウト（AdminShell）ごとに持つと、ページ遷移のたびに
 * レイアウトが作り直されて状態が初期化されるため、ルーティングより上の
 * この Provider で 1 つだけ保持する。
 * 保存先はブラウザ内（localStorage）のみで、バックエンドには送らない。
 */
const NAV_EXPANDED_STORAGE_KEY = "bis.admin.nav_expanded.v1";

function readNavExpanded(): boolean {
  try {
    // 保存値がある場合だけ復元する（無ければ既存の初期状態＝折りたたみ）
    return window.localStorage.getItem(NAV_EXPANDED_STORAGE_KEY) === "1";
  } catch {
    // ストレージ不可時は初期状態で開始する（開閉操作自体は使える）
    return false;
  }
}

function writeNavExpanded(expanded: boolean): void {
  try {
    window.localStorage.setItem(
      NAV_EXPANDED_STORAGE_KEY,
      expanded ? "1" : "0"
    );
  } catch {
    // 保存できなくても、その場の開閉操作は継続する
  }
}

interface AdminNavContextValue {
  /** サイドナビが展開中か */
  expanded: boolean;
  /** 利用者の操作で開閉を切り替える（切り替えた状態を保存する） */
  toggleExpanded: () => void;
}

const AdminNavContext = createContext<AdminNavContextValue | null>(null);

export function AdminNavProvider({ children }: { children: ReactNode }) {
  // 初期化時に同期的に保存値を読むため、復元前のちらつきは起きない
  const [expanded, setExpanded] = useState<boolean>(readNavExpanded);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      writeNavExpanded(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ expanded, toggleExpanded }),
    [expanded, toggleExpanded]
  );

  return (
    <AdminNavContext.Provider value={value}>{children}</AdminNavContext.Provider>
  );
}

export function useAdminNav(): AdminNavContextValue {
  const context = useContext(AdminNavContext);
  if (!context) {
    throw new Error("useAdminNav は AdminNavProvider の中で使用してください");
  }
  return context;
}