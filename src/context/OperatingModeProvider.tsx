import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type OperatingMode = "normal" | "test";

const OPERATING_MODE_STORAGE_KEY = "bis.admin.operating_mode.v1";

function readInitialOperatingMode(): OperatingMode {
  try {
    const raw = window.sessionStorage.getItem(OPERATING_MODE_STORAGE_KEY);
    return raw === "test" ? "test" : "normal";
  } catch {
    return "normal";
  }
}

function writeOperatingMode(mode: OperatingMode): void {
  try {
    if (mode === "test") {
      window.sessionStorage.setItem(OPERATING_MODE_STORAGE_KEY, "test");
    } else {
      window.sessionStorage.removeItem(OPERATING_MODE_STORAGE_KEY);
    }
  } catch {
    // ストレージ不可時もメモリ上のモード切替自体は継続する
  }
}

interface OperatingModeContextValue {
  mode: OperatingMode;
  isTestMode: boolean;
  setMode: (next: OperatingMode) => void;
  isSwitchLocked: boolean;
  acquireLock: () => () => void;
}

const OperatingModeContext = createContext<OperatingModeContextValue | null>(
  null
);

/**
 * 管理画面共通の「通常モード／テストモード」状態を保持するプロバイダ。
 *
 * - 初期値は常に「通常モード（normal）」とする（新規タブ・新規セッションでテストモードを持ち越さない）。
 * - 同一タブ内で商品一覧・画像取込・商品登録・商品詳細を移動しても状態を維持する。
 */
export function OperatingModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<OperatingMode>(readInitialOperatingMode);
  const [lockCount, setLockCount] = useState(0);

  const acquireLock = useCallback(() => {
    setLockCount((prev) => prev + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setLockCount((prev) => Math.max(0, prev - 1));
    };
  }, []);

  const setMode = useCallback(
    (next: OperatingMode) => {
      if (lockCount > 0) return;
      setModeState(next);
      writeOperatingMode(next);
    },
    [lockCount]
  );

  const value = useMemo<OperatingModeContextValue>(
    () => ({
      mode,
      isTestMode: mode === "test",
      setMode,
      isSwitchLocked: lockCount > 0,
      acquireLock,
    }),
    [mode, setMode, lockCount, acquireLock]
  );

  return (
    <OperatingModeContext.Provider value={value}>
      {children}
    </OperatingModeContext.Provider>
  );
}

export function useOperatingMode() {
  const ctx = useContext(OperatingModeContext);
  if (!ctx) {
    throw new Error(
      "useOperatingMode must be used within OperatingModeProvider"
    );
  }
  return ctx;
}

/**
 * 送信中・取込中・一括処理中にモード切替を一時ロックするフック。
 */
export function useOperatingModeLock(locked: boolean): void {
  const { acquireLock } = useOperatingMode();
  useEffect(() => {
    if (!locked) return;
    return acquireLock();
  }, [locked, acquireLock]);
}
