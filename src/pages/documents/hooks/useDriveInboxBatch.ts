import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDriveInboxBatchResult } from "@/pages/documents/lib/driveInboxBatchApi";
import {
  countDriveInboxStatuses,
  isDriveInboxBatchRunning,
  resolveDriveInboxProgress,
  type DriveInboxBatch,
  type DriveInboxLoadState,
  type DriveInboxStatusCounts,
} from "@/pages/documents/lib/driveInboxBatch";

export interface DriveInboxBatchView {
  state: DriveInboxLoadState;
  batch: DriveInboxBatch | null;
  // 取得できていない場合は null（件数を0として表示しないため）
  counts: DriveInboxStatusCounts | null;
  running: boolean;
  progressPercent: number | null;
  message: string;
  isRefreshing: boolean;
  refresh: () => void;
}

/**
 * Inbox一括取込の状態管理。
 *
 * - マウント時（画面を開き直したとき）と再取得時に、必ず結果取得をやり直す。
 * - ブラウザ内に進捗や結果を保持しない（localStorage も使わない）。
 * - API未確認の間は state="unavailable" となり、件数は null のまま。
 */
export function useDriveInboxBatch(): DriveInboxBatchView {
  const [state, setState] = useState<DriveInboxLoadState>("loading");
  const [batch, setBatch] = useState<DriveInboxBatch | null>(null);
  const [message, setMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setMessage("");

    fetchDriveInboxBatchResult()
      .then((result) => {
        if (cancelled) return;
        if (!result.available) {
          setBatch(null);
          setMessage(result.reason);
          setState("unavailable");
          return;
        }
        setBatch(result.batch);
        setMessage("");
        setState("success");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBatch(null);
        setMessage(
          error instanceof Error && error.message
            ? error.message
            : "取込結果を取得できませんでした。"
        );
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const refresh = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const counts = useMemo(() => {
    if (!batch) return null;
    // 結果照会が返す summary の内訳を優先し、無い項目だけファイル別結果から数える。
    return countDriveInboxStatuses(batch.files, batch.summary ?? null);
  }, [batch]);

  const running = isDriveInboxBatchRunning(batch);
  const progressPercent = resolveDriveInboxProgress(batch);

  return {
    state,
    batch,
    counts,
    running,
    progressPercent,
    message,
    isRefreshing: state === "loading",
    refresh,
  };
}