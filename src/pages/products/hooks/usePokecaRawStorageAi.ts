import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchPokecaLightStatus,
  runPokecaLight,
  type PokecaLightWorkerState,
} from "@/pages/products/lib/pokecaRawStorageAi";

/** 進捗のポーリング間隔（ライト版はバックグラウンド実行のため控えめにする）。 */
export const POKECA_LIGHT_POLL_INTERVAL_MS = 5000;

export type PokecaLightStartResult = "started" | "already_running" | "failed";

interface UsePokecaLightOptions {
  isTestMode: boolean;
  /** 実行が完了（または失敗で終了）したときに商品一覧を再読み込みする */
  onFinished?: () => void;
}

/**
 * ライト版（旧裏ストレージ向け）AI生成の開始と進捗。
 *
 * - 画面を開き直した場合・別デバイスで開いた場合も GET status から進行中ジョブを復元する
 * - worker_state.is_test が現在の画面モードと一致する実行だけを表示する
 * - already_running は「今回の選択が開始された」ことを意味しないため成功表示にしない
 */
export function usePokecaRawStorageAi({
  isTestMode,
  onFinished,
}: UsePokecaLightOptions) {
  const [worker, setWorker] = useState<PokecaLightWorkerState | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [isHidden, setIsHidden] = useState(false);

  const wasRunningRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  const modeRef = useRef(isTestMode);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    modeRef.current = isTestMode;
  }, [isTestMode]);

  const refresh = useCallback(async (): Promise<PokecaLightWorkerState | null> => {
    setIsRefreshing(true);
    try {
      const result = await fetchPokecaLightStatus();
      const state = result.workerState;
      // 現在の画面モードと一致しない実行は表示しない
      if (state && state.isTest !== modeRef.current) {
        setWorker(null);
        return null;
      }
      setWorker(state);
      setErrorMessage("");
      return state;
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? err.message
          : "ライト版の進捗を取得できませんでした。"
      );
      return null;
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // 画面表示時・モード切替時に進行中ジョブを復元する（別デバイスでも同じ表示になる）
  useEffect(() => {
    setWorker(null);
    setErrorMessage("");
    void refresh();
  }, [isTestMode, refresh]);

  // 実行中だけ定期取得する（タブ復帰時も即座に最新化する）
  const isRunning = worker?.status === "running";
  useEffect(() => {
    if (!isRunning) return undefined;
    const timer = window.setInterval(() => {
      void refresh();
    }, POKECA_LIGHT_POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isRunning, refresh]);

  // 実行中→完了に変わったタイミングで商品一覧を再読み込みし、生成された商品名を反映する
  useEffect(() => {
    const running = worker?.status === "running";
    if (wasRunningRef.current && !running && worker) {
      if (worker.status === "completed" || worker.status === "failed") {
        onFinishedRef.current?.();
      }
    }
    wasRunningRef.current = running;
  }, [worker]);

  const start = useCallback(
    async (productIds: string[]): Promise<PokecaLightStartResult> => {
      if (productIds.length === 0) return "failed";
      setIsStarting(true);
      setErrorMessage("");
      setNoticeMessage("");
      try {
        const result = await runPokecaLight({
          productIds,
          isTest: modeRef.current,
        });
        setIsHidden(false);

        if (result.alreadyRunning) {
          // 既存の実行中ジョブを表示するだけ。今回は何も開始していない。
          setNoticeMessage(
            "既にライト版の処理が実行中です。今回の選択は新たに開始していません。実行中のジョブを表示しています。"
          );
          if (result.workerState) setWorker(result.workerState);
          void refresh();
          return "already_running";
        }

        setNoticeMessage(
          "ライト版の処理を開始しました。画面を閉じても処理は継続します。"
        );
        if (result.workerState) setWorker(result.workerState);
        void refresh();
        return "started";
      } catch (err) {
        setErrorMessage(
          err instanceof Error && err.message
            ? err.message
            : "ライト版の開始に失敗しました。"
        );
        return "failed";
      } finally {
        setIsStarting(false);
      }
    },
    [refresh]
  );

  const dismiss = useCallback(() => {
    setIsHidden(true);
    setNoticeMessage("");
  }, []);

  const clearNotice = useCallback(() => {
    setNoticeMessage("");
  }, []);

  return {
    worker,
    isRunning,
    isStarting,
    isRefreshing,
    errorMessage,
    noticeMessage,
    isHidden,
    start,
    refresh,
    dismiss,
    clearNotice,
  };
}