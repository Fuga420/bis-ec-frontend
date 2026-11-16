import { useCallback, useEffect, useState } from "react";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import {
  DriveBulkImportApiError,
  createDriveBulkImportDryRun,
  createDriveBulkImportRun,
  fetchDriveBulkImportProfiles,
  fetchDriveBulkImportRun,
} from "@/pages/drive-bulk-import/lib/driveBulkImportApi";
import type {
  DriveBulkImportProfile,
  DriveBulkImportRequest,
  DriveBulkImportRun,
} from "@/pages/drive-bulk-import/types";

const POLL_INTERVAL_MS = 5000;
const DEFAULT_PROFILE_ID = "pokeca_raw";

type ProfilesState = "loading" | "success" | "error";

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  return fallback;
}

/**
 * Drive一括取込画面の状態管理。
 *
 * - 条件（プロファイル・フォルダ上書き・アーカイブ扱い・絞り込み）は画面側で保持する。
 * - 実行環境（テスト／本番）は既存の OperatingModeProvider に連動させ、独自の切替は持たない。
 * - 5秒間隔で実行状態を取得し、終了（succeeded / failed）でポーリングを止める。
 * - 条件を変更したら、前回のドライラン結果は無効として破棄する（古い結果で実行させない）。
 */
export function useDriveBulkImport() {
  const { isTestMode } = useOperatingMode();

  const [profiles, setProfiles] = useState<DriveBulkImportProfile[]>([]);
  const [profilesState, setProfilesState] = useState<ProfilesState>("loading");
  const [profilesError, setProfilesError] = useState<string | null>(null);

  const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID);
  const [folderId, setFolderId] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [targetFilter, setTargetFilter] = useState("");

  const [dryRun, setDryRun] = useState<DriveBulkImportRun | null>(null);
  const [isDryRunStarting, setIsDryRunStarting] = useState(false);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [dryRunPollError, setDryRunPollError] = useState<string | null>(null);

  const [run, setRun] = useState<DriveBulkImportRun | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runPollError, setRunPollError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const loadProfiles = useCallback(async () => {
    setProfilesState("loading");
    setProfilesError(null);
    try {
      const list = await fetchDriveBulkImportProfiles();
      setProfiles(list);
      setProfilesState("success");
      setProfileId((prev) => {
        if (prev && list.some((profile) => profile.profileId === prev)) return prev;
        if (list.some((profile) => profile.profileId === DEFAULT_PROFILE_ID)) {
          return DEFAULT_PROFILE_ID;
        }
        return list[0]?.profileId ?? prev;
      });
    } catch (error) {
      setProfilesState("error");
      setProfilesError(
        toMessage(error, "プロファイル一覧を取得できませんでした。")
      );
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const isRunActive = run?.status === "running";
  const isDryRunActive = dryRun?.status === "running";
  const isBusy = isDryRunStarting || isStarting;

  // 条件を変えたら、前回のドライラン結果は使わない（実行ボタンを再度無効化する）。
  const resetDryRun = useCallback(() => {
    setDryRun(null);
    setDryRunError(null);
    setDryRunPollError(null);
  }, []);

  const changeProfileId = useCallback(
    (next: string) => {
      setProfileId(next);
      resetDryRun();
    },
    [resetDryRun]
  );

  const changeFolderId = useCallback(
    (next: string) => {
      setFolderId(next);
      resetDryRun();
    },
    [resetDryRun]
  );

  const changeIncludeArchived = useCallback(
    (next: boolean) => {
      setIncludeArchived(next);
      resetDryRun();
    },
    [resetDryRun]
  );

  const changeTargetFilter = useCallback(
    (next: string) => {
      setTargetFilter(next);
      resetDryRun();
    },
    [resetDryRun]
  );

  // テスト／本番を切り替えたら、別環境の実行結果は表示しない。
  useEffect(() => {
    resetDryRun();
    setRun(null);
    setRunError(null);
    setRunPollError(null);
  }, [isTestMode, resetDryRun]);

  // ドライランの進捗ポーリング（実行中のみ・約5秒間隔）
  useEffect(() => {
    if (!dryRun || dryRun.status !== "running") return undefined;
    const runId = dryRun.runId;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const next = await fetchDriveBulkImportRun(runId);
        if (cancelled) return;
        setDryRun(next);
        setDryRunPollError(null);
      } catch (error) {
        if (cancelled) return;
        setDryRunPollError(
          toMessage(
            error,
            "ドライランの進捗を取得できませんでした。表示は最後に取得できた状態です。"
          )
        );
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [dryRun]);

  // 本実行の進捗ポーリング（実行中のみ・約5秒間隔）
  useEffect(() => {
    if (!run || run.status !== "running") return undefined;
    const runId = run.runId;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const next = await fetchDriveBulkImportRun(runId);
        if (cancelled) return;
        setRun(next);
        setRunPollError(null);
      } catch (error) {
        if (cancelled) return;
        setRunPollError(
          toMessage(
            error,
            "実行状況を取得できませんでした。表示は最後に取得できた状態です。"
          )
        );
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [run]);

  // 実行状態だけを手動で再取得する（画面全体の再読み込みは行わない）。
  const refreshRun = useCallback(async () => {
    if (!run) return;
    try {
      const next = await fetchDriveBulkImportRun(run.runId);
      setRun(next);
      setRunPollError(null);
    } catch (error) {
      setRunPollError(
        toMessage(error, "実行状況を取得できませんでした。")
      );
    }
  }, [run]);

  const buildRequest = useCallback((): DriveBulkImportRequest => {
    const trimmedFolder = folderId.trim();
    const trimmedFilter = targetFilter.trim();
    return {
      profileId: profileId.trim(),
      folderId: trimmedFolder || undefined,
      isTest: isTestMode,
      includeArchived,
      subfolder: trimmedFilter || undefined,
    };
  }, [profileId, folderId, includeArchived, targetFilter, isTestMode]);

  const startDryRun = useCallback(async () => {
    if (isBusy || isRunActive || isDryRunActive) return;
    const request = buildRequest();
    if (!request.profileId) {
      setDryRunError("プロファイルを選択してください。");
      return;
    }
    setDryRun(null);
    setDryRunError(null);
    setDryRunPollError(null);
    setIsDryRunStarting(true);
    try {
      const created = await createDriveBulkImportDryRun(request);
      setDryRun(created);
    } catch (error) {
      setDryRunError(toMessage(error, "ドライランを開始できませんでした。"));
    } finally {
      setIsDryRunStarting(false);
    }
  }, [buildRequest, isBusy, isRunActive, isDryRunActive]);

  const dryRunSucceeded = dryRun?.status === "succeeded";
  const canRun = dryRunSucceeded && !isBusy && !isRunActive;

  const openConfirm = useCallback(() => {
    if (!canRun) return;
    setRunError(null);
    setIsConfirmOpen(true);
  }, [canRun]);

  const closeConfirm = useCallback(() => {
    if (isStarting) return;
    setIsConfirmOpen(false);
  }, [isStarting]);

  const startRun = useCallback(async () => {
    if (!canRun) return;
    const request = buildRequest();
    setRunError(null);
    setRunPollError(null);
    setIsStarting(true);
    try {
      const created = await createDriveBulkImportRun(request);
      setRun(created);
      setIsConfirmOpen(false);
    } catch (error) {
      const isConflict =
        error instanceof DriveBulkImportApiError &&
        (error.status === 409 || error.code === "already_running");
      setRunError(
        isConflict
          ? "既に実行中です。実行中のジョブが終わるまでお待ちください。"
          : toMessage(error, "実行を開始できませんでした。")
      );
      setIsConfirmOpen(false);
    } finally {
      setIsStarting(false);
    }
  }, [buildRequest, canRun]);

  return {
    isTestMode,
    profiles,
    profilesState,
    profilesError,
    reloadProfiles: loadProfiles,
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
  };
}