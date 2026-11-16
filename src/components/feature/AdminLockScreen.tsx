import { useId, useState, type FormEvent } from "react";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import { adminThemeClass } from "@/lib/adminTheme";

interface AdminLockScreenProps {
  /** ロック画面に出す案内（401で戻されたときなど） */
  notice?: string;
  /** 入力されたパスワードを保持してロック解除する */
  onSubmit: (password: string) => void;
}

/**
 * 管理画面のロック画面（パスワード入力）。
 *
 * - ここではパスワードの正しさを判定しない。入力値をそのまま渡し、
 *   正誤はAPI（mode=admin の読み取り）の401で判定する。
 * - 入力値はコードに持たない。表示・送信も入力された1回分だけ。
 */
export default function AdminLockScreen({
  notice,
  onSubmit,
}: AdminLockScreenProps) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const passwordId = useId();
  const errorId = useId();
  const { isTestMode } = useOperatingMode();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const value = password;
    if (!value.trim()) {
      setError("パスワードを入力してください。");
      return;
    }
    setError("");
    setSubmitting(true);
    // 判定はしない。保持して、以降のAPIリクエストに自動で付ける（既存仕様）。
    onSubmit(value);
  };

  const message = error || notice || "";

  return (
    <div
      className={`admin-font admin-lock products-theme ${adminThemeClass(
        isTestMode
      )} min-h-[100dvh] bg-background-50`}
    >
      <div className="flex min-h-[100dvh] w-full flex-col lg:flex-row">
        {/* 左：ブランド表示のみ（デスクトップ） */}
        <aside className="admin-lock-brand relative hidden lg:flex lg:w-[47%] lg:shrink-0 lg:flex-col lg:justify-between lg:px-14 lg:py-14 xl:px-16 xl:py-16">
          <div>
            <span className="products-header-brand admin-lock-logo block">
              BIS
            </span>
            <p className="admin-eyebrow mt-4 text-[11px] admin-lock-brand-muted">
              Collectibles Catalogue
            </p>
            <span
              aria-hidden="true"
              className="admin-lock-brand-rule mt-6 block h-px w-10"
            ></span>
          </div>

          <div className="max-w-sm">
            <p className="admin-display text-[19px] font-semibold leading-tight tracking-[-0.01em]">
              商品管理
            </p>
            <p className="admin-lock-brand-muted mt-2 text-[13px] leading-relaxed">
              スタッフ専用の管理システム
            </p>
          </div>
        </aside>

        {/* 右：認証フォーム */}
        <main className="flex w-full flex-1 items-center justify-center px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
          <div className="w-full max-w-[400px]">
            {/* モバイルではブランドだけを上部に出す */}
            <div className="mb-10 lg:hidden">
              <span className="products-header-brand admin-lock-logo-small block text-foreground-950">
                BIS
              </span>
              <p className="admin-eyebrow mt-2 text-[10px] text-foreground-400">
                Collectibles Catalogue
              </p>
            </div>

            <h1 className="admin-display text-[22px] font-semibold leading-tight tracking-[-0.01em] text-foreground-950">
              管理画面にログイン
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-foreground-500">
              パスワードを入力してください。
            </p>

            <form className="mt-8" onSubmit={handleSubmit} noValidate>
              <label
                htmlFor={passwordId}
                className="block text-[12px] font-medium text-foreground-700"
              >
                パスワード
              </label>

              <div className="relative mt-2">
                <input
                  id={passwordId}
                  name="admin_password"
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  autoFocus
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error) setError("");
                  }}
                  aria-invalid={Boolean(message)}
                  aria-describedby={message ? errorId : undefined}
                  placeholder=""
                  className="admin-lock-field h-12 w-full rounded-lg border py-2 pl-3.5 pr-12 text-[15px] text-foreground-900 transition-colors placeholder:text-foreground-400"
                />
                <button
                  type="button"
                  onClick={() => setVisible((prev) => !prev)}
                  aria-label={visible ? "パスワードを隠す" : "パスワードを表示"}
                  title={visible ? "パスワードを隠す" : "パスワードを表示"}
                  className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-foreground-400 transition-colors hover:bg-background-100 hover:text-foreground-700"
                >
                  <i
                    aria-hidden="true"
                    className={`${
                      visible ? "ri-eye-off-line" : "ri-eye-line"
                    } w-4 h-4 flex items-center justify-center`}
                  ></i>
                </button>
              </div>

              <p
                id={errorId}
                role="alert"
                aria-live="polite"
                className={`text-[12px] leading-relaxed text-red-700 ${
                  message ? "mt-2" : "hidden"
                }`}
              >
                {message}
              </p>

              <button
                type="submit"
                disabled={submitting || password.trim() === ""}
                className="admin-lock-submit mt-5 h-12 w-full cursor-pointer whitespace-nowrap rounded-lg px-5 text-[15px] font-semibold leading-none"
              >
                {submitting ? "確認中" : "ログイン"}
              </button>
            </form>

            <p className="mt-6 text-[11px] leading-relaxed text-foreground-400">
              認証できない場合は管理者へお問い合わせください。
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}