import { useOperatingMode } from "@/context/OperatingModeProvider";

/**
 * 管理画面共通の「通常モード／テストモード」表示・切替バー。
 *
 * - 商品一覧・画像取込・商品登録・商品詳細のすべてで同じ位置に1つだけ表示する。
 * - 現在のモードを常時明示し、テストモード中は実商品と混同しないよう控えめな警告トーンで区別する。
 */
export default function AdminOperatingModeBar() {
  const { mode, isTestMode, setMode, isSwitchLocked } = useOperatingMode();

  return (
    <div
      role="region"
      aria-label="管理画面の動作モード"
      className={`admin-font products-theme border-b transition-colors ${
        isTestMode
          ? "border-amber-200 bg-amber-50"
          : "border-background-200 bg-background-50"
      }`}
    >
      <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-1.5 md:px-6 lg:px-8">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          {isTestMode ? (
            <>
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                <i className="ri-flask-line w-3.5 h-3.5 flex items-center justify-center text-amber-700"></i>
                テストモード
              </span>
              <span className="text-amber-900">
                テスト商品のみ表示・対象にします（登録・画像取込は自動でテスト商品として保存／本番公開は無効）
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-foreground-800">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-600"></span>
                通常モード
              </span>
              <span className="text-foreground-500">
                実商品のみ表示・対象にします
              </span>
            </>
          )}
        </div>

        <div
          role="group"
          aria-label="通常モード／テストモード切替"
          title={
            isSwitchLocked ? "処理実行中はモードを切り替えられません" : undefined
          }
          className={`inline-flex shrink-0 items-center gap-0.5 rounded-lg p-0.5 ${
            isTestMode
              ? "border border-amber-200 bg-amber-100/70"
              : "border border-background-200 bg-background-100"
          }`}
        >
          <button
            type="button"
            data-testid="operating-mode-normal"
            aria-pressed={mode === "normal"}
            disabled={isSwitchLocked}
            onClick={() => setMode("normal")}
            className={`cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              mode === "normal"
                ? "bg-white font-semibold text-foreground-950"
                : isTestMode
                  ? "font-medium text-amber-900/80 hover:text-amber-950"
                  : "font-medium text-foreground-600 hover:text-foreground-900"
            }`}
          >
            通常モード
          </button>
          <button
            type="button"
            data-testid="operating-mode-test"
            aria-pressed={mode === "test"}
            disabled={isSwitchLocked}
            onClick={() => setMode("test")}
            className={`inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              mode === "test"
                ? "bg-white font-semibold text-amber-950"
                : "font-medium text-foreground-600 hover:text-foreground-900"
            }`}
          >
            <i className="ri-flask-line w-3 h-3 flex items-center justify-center"></i>
            テストモード
          </button>
        </div>
      </div>
    </div>
  );
}
