import type { DriveBulkImportProfile } from "@/pages/drive-bulk-import/types";

interface DriveBulkImportConditionFormProps {
  profiles: DriveBulkImportProfile[];
  profilesState: "loading" | "success" | "error";
  profilesError: string | null;
  onReloadProfiles: () => void;
  profileId: string;
  onProfileIdChange: (value: string) => void;
  folderId: string;
  onFolderIdChange: (value: string) => void;
  includeArchived: boolean;
  onIncludeArchivedChange: (value: boolean) => void;
  targetFilter: string;
  onTargetFilterChange: (value: string) => void;
  isTestMode: boolean;
  disabled: boolean;
  isDryRunStarting: boolean;
  onStartDryRun: () => void;
  canRun: boolean;
  isStarting: boolean;
  onStartRun: () => void;
}

const inputClass =
  "h-10 w-full min-w-0 box-border rounded-lg border border-background-300 bg-background-50 px-3 text-[13px] text-foreground-900 placeholder:text-foreground-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50";

const labelClass = "block text-[12px] font-medium leading-none text-foreground-600";

export default function DriveBulkImportConditionForm({
  profiles,
  profilesState,
  profilesError,
  onReloadProfiles,
  profileId,
  onProfileIdChange,
  folderId,
  onFolderIdChange,
  includeArchived,
  onIncludeArchivedChange,
  targetFilter,
  onTargetFilterChange,
  isTestMode,
  disabled,
  isDryRunStarting,
  onStartDryRun,
  canRun,
  isStarting,
  onStartRun,
}: DriveBulkImportConditionFormProps) {
  const selectedProfile = profiles.find(
    (profile) => profile.profileId === profileId
  );

  return (
    <section className="ui-card rounded-lg p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold leading-none text-foreground-950">
          <i className="ri-folder-settings-line flex h-4 w-4 items-center justify-center text-foreground-500"></i>
          取込条件
        </h2>
        <span
          className={`inline-flex h-[22px] select-none items-center whitespace-nowrap rounded-md px-2 text-[11px] font-medium leading-none ${
            isTestMode
              ? "border border-amber-300/70 bg-amber-50 text-amber-800"
              : "bg-secondary-100 text-secondary-900"
          }`}
        >
          {isTestMode ? "テストモード（テストデータ側に登録）" : "本番モード（実データに登録）"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor="drive-import-profile" className={labelClass}>
            プロファイル
          </label>
          {profilesState === "error" ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-background-300 bg-background-50 px-3 py-2">
              <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-foreground-600">
                {profilesError ?? "プロファイル一覧を取得できませんでした。"}
              </p>
              <button
                type="button"
                onClick={onReloadProfiles}
                className="inline-flex h-8 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-background-50 px-2.5 text-[12px] font-medium text-foreground-700 transition-colors hover:bg-background-100"
              >
                <i className="ri-refresh-line flex h-3.5 w-3.5 items-center justify-center"></i>
                再読み込み
              </button>
            </div>
          ) : (
            <select
              id="drive-import-profile"
              value={profileId}
              disabled={disabled || profilesState === "loading"}
              onChange={(event) => onProfileIdChange(event.target.value)}
              className={`mt-2 ${inputClass}`}
            >
              {profilesState === "loading" && (
                <option value={profileId}>読み込み中...</option>
              )}
              {profilesState === "success" && profiles.length === 0 && (
                <option value={profileId}>利用できるプロファイルがありません</option>
              )}
              {profiles.map((profile) => (
                <option key={profile.profileId} value={profile.profileId}>
                  {profile.description}（{profile.profileId}）
                </option>
              ))}
            </select>
          )}
          {selectedProfile && selectedProfile.rootFolderId && (
            <p className="mt-1.5 break-all text-[11px] leading-relaxed text-foreground-400">
              既定フォルダ: {selectedProfile.rootFolderId}
            </p>
          )}
        </div>

        <div className="min-w-0">
          <label htmlFor="drive-import-folder" className={labelClass}>
            フォルダID上書き（任意）
          </label>
          <input
            id="drive-import-folder"
            type="text"
            value={folderId}
            disabled={disabled}
            onChange={(event) => onFolderIdChange(event.target.value)}
            placeholder="空欄ならプロファイルの既定フォルダを使用します"
            autoComplete="off"
            spellCheck={false}
            className={`mt-2 ${inputClass}`}
          />
        </div>

        <div className="min-w-0 md:col-span-2">
          <label htmlFor="drive-import-filter" className={labelClass}>
            対象を絞るフィルタ（任意）
          </label>
          <input
            id="drive-import-filter"
            type="text"
            value={targetFilter}
            disabled={disabled}
            onChange={(event) => onTargetFilterChange(event.target.value)}
            placeholder="例）箱番 A-01（ポケカなど。空欄ならすべてを対象にします）"
            autoComplete="off"
            spellCheck={false}
            className={`mt-2 ${inputClass}`}
          />
        </div>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg border border-background-200 bg-background-50 px-3 py-2.5">
        <input
          type="checkbox"
          checked={includeArchived}
          disabled={disabled}
          onChange={(event) => onIncludeArchivedChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span className="min-w-0">
          <span className="block text-[13px] font-medium leading-tight text-foreground-900">
            アーカイブ済みも登録済みとしてスキップ
          </span>
          <span className="mt-1 block text-[11px] leading-relaxed text-foreground-500">
            オンにすると、アーカイブ済みの商品は再登録されません（既定はオフ）。
          </span>
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-background-200 pt-4">
        <button
          type="button"
          onClick={onStartDryRun}
          disabled={disabled || isDryRunStarting}
          className="inline-flex h-10 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-4 text-[13px] font-semibold text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDryRunStarting ? (
            <>
              <i className="ri-loader-4-line flex h-4 w-4 animate-spin items-center justify-center"></i>
              開始しています...
            </>
          ) : (
            <>
              <i className="ri-search-eye-line flex h-4 w-4 items-center justify-center"></i>
              ドライラン実行
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onStartRun}
          disabled={!canRun || isStarting}
          className="inline-flex h-10 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 text-[13px] font-semibold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isStarting ? (
            <>
              <i className="ri-loader-4-line flex h-4 w-4 animate-spin items-center justify-center"></i>
              開始しています...
            </>
          ) : (
            <>
              <i className="ri-play-line flex h-4 w-4 items-center justify-center"></i>
              実行
            </>
          )}
        </button>

        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-foreground-500">
          {canRun
            ? "ドライランが完了しました。内容を確認してから実行できます。"
            : "実行は、ドライランが成功した後にのみ有効になります。実行中は条件変更・再実行はできません。"}
        </p>
      </div>
    </section>
  );
}