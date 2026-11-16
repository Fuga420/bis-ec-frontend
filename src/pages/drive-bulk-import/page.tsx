import { Link } from "react-router-dom";
import OperatingModeMenu from "@/components/feature/OperatingModeMenu";
import { adminThemeClass } from "@/lib/adminTheme";
import DriveBulkImportConditionForm from "@/pages/drive-bulk-import/components/DriveBulkImportConditionForm";
import DriveBulkImportConfirmDialog from "@/pages/drive-bulk-import/components/DriveBulkImportConfirmDialog";
import DriveBulkImportDryRunPanel from "@/pages/drive-bulk-import/components/DriveBulkImportDryRunPanel";
import DriveBulkImportRunPanel from "@/pages/drive-bulk-import/components/DriveBulkImportRunPanel";
import { useDriveBulkImport } from "@/pages/drive-bulk-import/hooks/useDriveBulkImport";

/**
 * Drive一括取込の操作画面。
 *
 * - 既存の「環境切り替え（通常／テスト）」に連動する。独自のモード切替は持たない。
 * - ドライラン → 結果確認 → 実行 → 進捗 → 完了結果、の順で操作する。
 * - 進捗はサーバー上の実行状態を約5秒間隔で取得する（画面を閉じても継続）。
 */
export default function DriveBulkImportPage() {
  const {
    isTestMode,
    profiles,
    profilesState,
    profilesError,
    reloadProfiles,
    profileId,
    changeProfileId,
    folderId,
    changeFolderId,
    includeArchived,
    changeIncludeArchived,
    targetFilter,
    changeTargetFilter,
    dryRun,
    isDryRunStarting,
    dryRunError,
    dryRunPollError,
    startDryRun,
    run,
    isStarting,
    runError,
    runPollError,
    isConfirmOpen,
    refreshRun,
    openConfirm,
    closeConfirm,
    startRun,
    canRun,
    isRunActive,
    isDryRunActive,
    isBusy,
  } = useDriveBulkImport();

  const profileLabel =
    profiles.find((profile) => profile.profileId === profileId)?.description ??
    profileId;

  const targetCount = dryRun?.counts.target ?? null;
  const isConditionDisabled = isBusy || isRunActive || isDryRunActive;

  return (
    <div
      className={`admin-font products-theme ${adminThemeClass(
        isTestMode
      )} min-h-screen bg-background-50`}
    >
      <header className="border-b border-background-200 bg-background-50">
        <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 md:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              to="/products"
              aria-label="BIS 商品一覧へ"
              className="inline-flex shrink-0 items-center whitespace-nowrap"
            >
              <span className="products-header-brand block text-foreground-950">
                BIS
              </span>
            </Link>
            <span
              aria-hidden="true"
              className="h-7 w-px shrink-0 bg-background-300"
            ></span>
            <div className="flex min-w-0 items-baseline gap-2">
              <h1 className="admin-display whitespace-nowrap text-[20px] font-medium leading-none tracking-[-0.01em] text-foreground-600">
                Drive一括取込
              </h1>
              {isTestMode && (
                <span
                  aria-label="テスト環境"
                  className="inline-flex h-[18px] select-none items-center rounded border border-amber-300/70 bg-amber-50 px-1.5 text-[10px] font-medium leading-none tracking-[0.08em] text-amber-800"
                >
                  TEST
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/products" className="product-header-action">
              <i className="ri-list-check-2" aria-hidden="true"></i>
              商品一覧
            </Link>
            <OperatingModeMenu />
          </div>
        </div>
      </header>

      <main className="page-fade w-full px-4 py-4 md:px-6 md:py-5 lg:px-8">
        <div className="mx-auto w-full max-w-[1080px]">
          <p className="text-[12px] leading-relaxed text-foreground-500">
            指定したフォルダの画像をまとめて商品登録します。まずドライランで対象件数を確認し、問題がなければ実行してください。
          </p>

          <DriveBulkImportConditionForm
            profiles={profiles}
            profilesState={profilesState}
            profilesError={profilesError}
            onReloadProfiles={() => void reloadProfiles()}
            profileId={profileId}
            onProfileIdChange={changeProfileId}
            folderId={folderId}
            onFolderIdChange={changeFolderId}
            includeArchived={includeArchived}
            onIncludeArchivedChange={changeIncludeArchived}
            targetFilter={targetFilter}
            onTargetFilterChange={changeTargetFilter}
            isTestMode={isTestMode}
            disabled={isConditionDisabled}
            isDryRunStarting={isDryRunStarting}
            onStartDryRun={() => void startDryRun()}
            canRun={canRun}
            isStarting={isStarting}
            onStartRun={openConfirm}
          />

          <DriveBulkImportDryRunPanel
            dryRun={dryRun}
            isStarting={isDryRunStarting}
            errorMessage={dryRunError}
            pollError={dryRunPollError}
            onRetry={() => void startDryRun()}
          />

          <DriveBulkImportRunPanel
            run={run}
            isStarting={isStarting}
            errorMessage={runError}
            pollError={runPollError}
            onRetry={() => void refreshRun()}
          />
        </div>
      </main>

      <DriveBulkImportConfirmDialog
        open={isConfirmOpen}
        targetCount={targetCount}
        profileLabel={profileLabel}
        isTestMode={isTestMode}
        isStarting={isStarting}
        onCancel={closeConfirm}
        onConfirm={() => void startRun()}
      />
    </div>
  );
}