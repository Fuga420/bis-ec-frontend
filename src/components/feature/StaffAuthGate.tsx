import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  getStaffSession,
  signInStaff,
  signOutStaff,
  subscribeStaffAuth,
} from "@/config/productsAuth";
import {
  PRODUCTS_READ_API_URL,
  type ProductSyncWarningDetail,
} from "@/config/productsApi";

interface StaffAuthGateProps {
  children: ReactNode;
}

export default function StaffAuthGate({ children }: StaffAuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<ProductSyncWarningDetail | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function verifyStaffAuthorization(activeSession: Session | null) {
      if (!activeSession?.access_token) {
        if (!cancelled) {
          setSession(null);
          setAuthorized(false);
          setChecking(false);
        }
        return;
      }

      if (!PRODUCTS_READ_API_URL) {
        if (!cancelled) {
          setSession(activeSession);
          setAuthorized(true);
          setChecking(false);
        }
        return;
      }

      try {
        const res = await fetch(
          `${PRODUCTS_READ_API_URL}/?mode=admin&page=1&page_size=1`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${activeSession.access_token}`,
            },
          }
        );

        if (cancelled) return;

        if (res.status === 403) {
          await signOutStaff();
          setSession(null);
          setAuthorized(false);
          setAuthError(
            "このアカウントには管理画面のスタッフ権限が付与されていません。管理者に連絡してください。"
          );
          setChecking(false);
          return;
        }

        if (res.status === 401) {
          await signOutStaff();
          setSession(null);
          setAuthorized(false);
          setAuthError("セッションの有効期限が切れました。再度ログインしてください。");
          setChecking(false);
          return;
        }

        setSession(activeSession);
        setAuthorized(true);
        setAuthError(null);
        setChecking(false);
      } catch {
        // Cloud Run 一時通信障害時でも有効な Supabase セッションがあれば作業継続を許可する
        if (!cancelled) {
          setSession(activeSession);
          setAuthorized(true);
          setChecking(false);
        }
      }
    }

    getStaffSession().then((initial) => {
      void verifyStaffAuthorization(initial);
    });

    const unsubscribe = subscribeStaffAuth((nextSession) => {
      void verifyStaffAuthorization(nextSession);
    });

    const handleExpired = () => {
      void signOutStaff();
    };
    const handleSyncWarning = (event: Event) => {
      const custom = event as CustomEvent<ProductSyncWarningDetail>;
      if (custom.detail) {
        setSyncWarning(custom.detail);
      }
    };

    window.addEventListener("bis:staff-auth-expired", handleExpired);
    window.addEventListener("bis:product-sync-warning", handleSyncWarning);

    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("bis:staff-auth-expired", handleExpired);
      window.removeEventListener("bis:product-sync-warning", handleSyncWarning);
    };
  }, []);

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setAuthError("メールアドレスとパスワードを入力してください。");
      return;
    }
    setSubmitting(true);
    setAuthError(null);
    try {
      const result = await signInStaff(email, password);
      if (result.error || !result.session) {
        setAuthError("メールアドレスまたはパスワードが正しくありません。");
        return;
      }
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setChecking(true);
    await signOutStaff();
    setSession(null);
    setAuthorized(false);
    setChecking(false);
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-600">認証状態を確認しています...</div>
      </div>
    );
  }

  if (!session || !authorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-slate-900">
              B.I.S 管理画面ログイン
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              商品管理・登録画面を利用するにはスタッフアカウントでログインしてください。
            </p>
          </div>

          {authError && (
            <div
              role="alert"
              className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
            >
              {authError}
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="bis-staff-email"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                メールアドレス
              </label>
              <input
                id="bis-staff-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@example.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="bis-staff-password"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                パスワード
              </label>
              <input
                id="bis-staff-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting ? "ログイン中..." : "ログイン"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-slate-900 text-slate-200 px-4 py-1.5 text-xs flex items-center justify-between gap-3">
        <div className="truncate">
          スタッフ認証済: <span className="font-medium text-white">{session.user.email}</span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="shrink-0 rounded border border-slate-700 px-2.5 py-0.5 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
        >
          ログアウト
        </button>
      </div>

      {syncWarning && (
        <div
          role="status"
          className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-center justify-between gap-4"
        >
          <span>
            正本（Google Sheets）への保存は完了しましたが、高速読取DBへの即時反映で一時エラーが発生しました（商品ID:{" "}
            <strong className="font-mono">{syncWarning.productId}</strong> / {syncWarning.error}
            ）。自動的に正本参照および定期再同期（5分周期）で補完されます。
          </span>
          <button
            type="button"
            onClick={() => setSyncWarning(null)}
            className="shrink-0 text-amber-800 underline hover:text-amber-950 cursor-pointer"
          >
            閉じる
          </button>
        </div>
      )}

      <div className="flex-1">{children}</div>
    </div>
  );
}
