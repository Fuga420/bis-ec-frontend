import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearAdminPassword,
  isAdminUnlocked,
  saveAdminPassword,
  subscribeAdminAuthChanged,
  subscribeAdminUnauthorized,
} from "@/lib/adminAuth";

interface AdminAuthContextValue {
  /** ロック解除済み（有効なパスワード保持がある）か */
  isUnlocked: boolean;
  /** ロック画面に出す案内（401で戻されたときなど） */
  notice: string;
  /** 入力されたパスワードを保持してロック解除する（判定はAPIに任せる） */
  unlock: (password: string) => void;
  /** 保持を削除してロック画面に戻す（ログアウト） */
  lock: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

/**
 * 管理画面共通のロック状態。
 *
 * - 開いたときに有効な保持がなければロック画面を表示する。
 * - パスワードの正しさは判定しない。入力値を保持し、APIが401を返したらロックへ戻す。
 * - 保持（localStorage・無期限）とログアウトは lib/adminAuth に集約している。
 */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isUnlockedState, setIsUnlockedState] = useState<boolean>(() =>
    isAdminUnlocked()
  );
  const [notice, setNotice] = useState("");

  const unlock = useCallback((password: string) => {
    saveAdminPassword(password);
    setNotice("");
    setIsUnlockedState(true);
  }, []);

  const lock = useCallback(() => {
    clearAdminPassword();
    setNotice("");
    setIsUnlockedState(false);
  }, []);

  // 401（パスワード不一致・変更）を受けたらロック画面へ戻す。
  useEffect(
    () =>
      subscribeAdminUnauthorized(() => {
        setIsUnlockedState(false);
        setNotice("認証できませんでした。パスワードをご確認ください。");
      }),
    []
  );

  // 別タブでのログアウト・ログインにも追随する。
  useEffect(
    () =>
      subscribeAdminAuthChanged(() => {
        const next = isAdminUnlocked();
        setIsUnlockedState((prev) => (prev === next ? prev : next));
        if (!next) setNotice("");
      }),
    []
  );

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      isUnlocked: isUnlockedState,
      notice,
      unlock,
      lock,
    }),
    [isUnlockedState, notice, unlock, lock]
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return ctx;
}