import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AiBatchDisplayItem,
  AiBatchOverallStatus,
  AiBatchProgressResponse,
  AiBatchRunSummary,
  AiBatchScheduleDetailResponse,
  AiBatchTarget,
} from "@/pages/products/types";
import {
  PRODUCTS_READ_API_URL,
  markDraftProductSyncedInSession,
  syncProductToReadDb,
} from "@/config/productsApi";
import { AiRelayError } from "@/pages/register/lib/aiProduct";
import {
  AI_BATCH_MAX_CONSECUTIVE_POLL_FAILURES,
  AI_BATCH_POLL_INTERVAL_MS,
  AI_BATCH_STATE_MAX_AGE_MS,
  AI_SCHEDULE_IDLE_POLL_INTERVAL_MS,
  DEFAULT_MIN_COST_MARKUP_RATE,
  MAX_AI_BATCH_SIZE,
  cancelAiBatchSchedule,
  classifyRetryFailure,
  createAiBatchSchedule,
  createAiProductDraftBatch,
  createRequestId,
  getAiBatchSchedule,
  getAiProductDraftBatch,
  isDefinitiveBatchPollError,
  isTerminalBatchStatus,
  listAiBatchRuns,
  recordGasContractViolations,
  retryAiProductDraftBatch,
  toAiBatchDisplayItems,
} from "@/pages/products/lib/aiBatch";

// 即時バッチ送信中の応答未受信リトライ用キー（受付後の正本はサーバー側 Supabase `ai_batch_jobs`）。
const STORAGE_KEY = "ai_batch_state_v1";
// 日時指定予約の応答未受信リトライ用キー（予約作成後の正本はサーバー側 Supabase `ai_batch_schedules`）。
const SCHEDULE_PENDING_REQ_KEY = "ai_schedule_pending_req_v1";
// ユーザーが上部の帯を閉じた run_key（`schedule:...` または `batch:...`）＋状態。
const RUN_DISMISSED_KEY = "ai_batch_run_dismissed_v2";
// 失敗分再実行（retry）の冪等性キーの保存キー。
const RETRY_STORAGE_KEY = "ai_batch_retry_state_v1";

interface StoredBatchItem {
  product_id: string;
  product_name: string;
}

interface StoredBatchState {
  requestId: string;
  batchId: string | null;
  items: StoredBatchItem[];
  minCostMarkupRate: number | null;
  testOnly?: boolean;
  forceRegenerate?: boolean;
  // 保存時刻（エポックミリ秒）。受付から24時間を超えた状態は復元しない。
  savedAt?: number;
}

// 保存状態の読み取り結果。期限切れ（24時間超）で破棄した場合も区別して返す。
interface StoredStateReadResult {
  state: StoredBatchState | null;
  expired: boolean;
}

interface StoredPendingScheduleRequest {
  requestId: string;
  scheduledAtIso: string;
  productIds: string[];
  minCostMarkupRate: number;
  testOnly: boolean;
  forceRegenerate: boolean;
}

function readStoredState(): StoredStateReadResult {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: null, expired: false };
    const parsed = JSON.parse(raw) as Partial<StoredBatchState>;
    if (!parsed || typeof parsed.requestId !== "string" || !parsed.requestId) {
      return { state: null, expired: false };
    }
    // 保存時刻が記録されている場合だけ期限を判定する（古い形式は従来どおり復元する）。
    const savedAt =
      typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt)
        ? parsed.savedAt
        : null;
    if (savedAt != null && Date.now() - savedAt > AI_BATCH_STATE_MAX_AGE_MS) {
      clearStoredState();
      clearRetryRequestId();
      return { state: null, expired: true };
    }
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const normalized = items
      .filter(
        (i): i is StoredBatchItem => !!i && typeof i.product_id === "string"
      )
      .map((i) => ({
        product_id: i.product_id,
        product_name: i.product_name ?? "",
      }));
    return {
      state: {
        requestId: parsed.requestId,
        batchId:
          typeof parsed.batchId === "string" && parsed.batchId
            ? parsed.batchId
            : null,
        items: normalized,
        minCostMarkupRate:
          typeof parsed.minCostMarkupRate === "number" &&
          Number.isFinite(parsed.minCostMarkupRate)
            ? parsed.minCostMarkupRate
            : null,
        testOnly: parsed.testOnly === true,
        forceRegenerate: parsed.forceRegenerate === true,
        savedAt: savedAt ?? undefined,
      },
      expired: false,
    };
  } catch {
    return { state: null, expired: false };
  }
}

function writeStoredState(state: StoredBatchState): void {
  try {
    // 保存のたびに保存時刻を更新する（受付時刻の近似値）。
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, savedAt: Date.now() })
    );
  } catch {
    // 保存できなくても処理は継続する
  }
}

function clearStoredState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function readPendingScheduleReq(): StoredPendingScheduleRequest | null {
  try {
    const raw = window.localStorage.getItem(SCHEDULE_PENDING_REQ_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPendingScheduleRequest>;
    if (
      !parsed ||
      typeof parsed.requestId !== "string" ||
      !parsed.requestId ||
      typeof parsed.scheduledAtIso !== "string" ||
      !Array.isArray(parsed.productIds)
    ) {
      return null;
    }
    return {
      requestId: parsed.requestId,
      scheduledAtIso: parsed.scheduledAtIso,
      productIds: parsed.productIds.filter(
        (x): x is string => typeof x === "string"
      ),
      minCostMarkupRate:
        typeof parsed.minCostMarkupRate === "number"
          ? parsed.minCostMarkupRate
          : DEFAULT_MIN_COST_MARKUP_RATE,
      testOnly: parsed.testOnly === true,
      forceRegenerate: parsed.forceRegenerate === true,
    };
  } catch {
    return null;
  }
}

function writePendingScheduleReq(state: StoredPendingScheduleRequest): void {
  try {
    window.localStorage.setItem(
      SCHEDULE_PENDING_REQ_KEY,
      JSON.stringify(state)
    );
  } catch {
    // ignore
  }
}

function clearPendingScheduleReq(): void {
  try {
    window.localStorage.removeItem(SCHEDULE_PENDING_REQ_KEY);
  } catch {
    // ignore
  }
}

function readDismissedRunMap(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(RUN_DISMISSED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function markRunBannerDismissed(runKey: string, status: string): void {
  try {
    const map = readDismissedRunMap();
    map[runKey] = status;
    window.localStorage.setItem(RUN_DISMISSED_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function isRunBannerDismissed(run: AiBatchRunSummary): boolean {
  const map = readDismissedRunMap();
  return map[run.run_key] === run.overall_status;
}

interface StoredRetryState {
  batchId: string;
  requestId: string;
}

function readRetryRequestId(batchId: string): string | null {
  try {
    const raw = window.localStorage.getItem(RETRY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRetryState>;
    if (
      parsed &&
      typeof parsed.batchId === "string" &&
      typeof parsed.requestId === "string" &&
      parsed.batchId === batchId &&
      parsed.requestId
    ) {
      return parsed.requestId;
    }
    return null;
  } catch {
    return null;
  }
}

function writeRetryRequestId(batchId: string, requestId: string): void {
  try {
    window.localStorage.setItem(
      RETRY_STORAGE_KEY,
      JSON.stringify({ batchId, requestId })
    );
  } catch {
    // ignore
  }
}

function clearRetryRequestId(): void {
  try {
    window.localStorage.removeItem(RETRY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function sameProductIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * サーバーから取得した統合ジョブ一覧（即時実行＋予約）から、上部バーへ自動復元する1件を選ぶ。
 * どのデバイス（localStorage が空の別端末・別ブラウザ）でも同じ優先順位で進捗・結果を表示する。
 */
function pickAutoRestoreRun(
  list: AiBatchRunSummary[]
): AiBatchRunSummary | null {
  if (list.length === 0) return null;

  // 1. 現在処理中・受付待ち・開始処理中のジョブ（即時・予約の両方）を最優先
  const running = list.find(
    (r) =>
      r.overall_status === "processing" ||
      r.overall_status === "queued" ||
      r.overall_status === "starting" ||
      r.overall_status === "dispatch_retry"
  );
  if (running && !isRunBannerDismissed(running)) return running;

  // 2. 開始待ちの予約（最も開始予定が近いもの）
  const scheduledList = list
    .filter((r) => r.overall_status === "scheduled" && !isRunBannerDismissed(r))
    .sort((a, b) =>
      String(a.scheduled_at ?? "").localeCompare(String(b.scheduled_at ?? ""))
    );
  if (scheduledList.length > 0) return scheduledList[0];

  // 3. 最新の完了・一部失敗・失敗（即時・予約の両方。まだ閉じていない場合は結果を表示）
  const latestTerminal = list.find(
    (r) =>
      (r.overall_status === "completed" ||
        r.overall_status === "partially_failed" ||
        r.overall_status === "failed") &&
      !isRunBannerDismissed(r)
  );
  return latestTerminal ?? null;
}

export function useAiBatchGeneration(isTestMode = false) {
  const [items, setItems] = useState<AiBatchDisplayItem[] | null>(null);
  const [batchStatus, setBatchStatus] = useState<AiBatchOverallStatus | null>(
    null
  );
  const [batchId, setBatchId] = useState<string | null>(null);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [canCancelSchedule, setCanCancelSchedule] = useState(false);
  const [dispatchErrorMessage, setDispatchErrorMessage] = useState("");
  const [runs, setRuns] = useState<AiBatchRunSummary[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [pollError, setPollError] = useState("");
  const [pollToken, setPollToken] = useState(0);
  // 進捗を一定回数取得できず、状態を断定できない状態（ポーリングは継続する）。
  const [isTrackingUnknown, setIsTrackingUnknown] = useState(false);
  // items の件数がサーバーの実データに基づくか。復元直後の初回取得までは false。
  const [countsConfirmed, setCountsConfirmed] = useState(true);
  // 追跡を終了した理由を一度だけ控えめに知らせるためのメッセージ。
  const [noticeMessage, setNoticeMessage] = useState("");

  const nameMapRef = useRef<Record<string, string>>({});
  const itemsRef = useRef<AiBatchDisplayItem[] | null>(null);
  const contractViolationSeenRef = useRef<Set<string>>(new Set());
  const syncedBatchCompletedRef = useRef<Set<string>>(new Set());
  // 進捗取得の連続失敗回数（成功でリセットする）。
  const pollFailureRef = useRef(0);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const clearError = useCallback(() => {
    setErrorMessage("");
  }, []);

  const clearNoticeMessage = useCallback(() => {
    setNoticeMessage("");
  }, []);

  const markCompletedItemsSynced = useCallback(
    (displayItems: AiBatchDisplayItem[]) => {
      displayItems.forEach((item) => {
        if (
          item.status === "completed" &&
          !item.error_code &&
          !syncedBatchCompletedRef.current.has(item.product_id)
        ) {
          syncedBatchCompletedRef.current.add(item.product_id);
          if (PRODUCTS_READ_API_URL) {
            markDraftProductSyncedInSession(item.product_id);
          } else {
            void syncProductToReadDb(item.product_id);
          }
        }
      });
    },
    []
  );

  const applyScheduleDetailToState = useCallback(
    (detail: AiBatchScheduleDetailResponse) => {
      pollFailureRef.current = 0;
      setIsTrackingUnknown(false);
      setCountsConfirmed(true);
      setScheduleId(detail.schedule_id);
      setScheduledAt(detail.scheduled_at || null);
      setCreatedAt(detail.created_at || null);
      setCanCancelSchedule(Boolean(detail.can_cancel));
      setBatchId(detail.batch_id || null);
      setBatchStatus(detail.overall_status ?? "scheduled");
      setDispatchErrorMessage(detail.dispatch_error_message ?? "");

      const displayItems = toAiBatchDisplayItems(
        detail.items,
        itemsRef.current,
        nameMapRef.current
      );
      recordGasContractViolations(
        displayItems,
        contractViolationSeenRef.current
      );
      setItems(displayItems);
      markCompletedItemsSynced(displayItems);
    },
    [markCompletedItemsSynced]
  );

  const applyImmediateProgressToState = useCallback(
    (data: AiBatchProgressResponse) => {
      pollFailureRef.current = 0;
      setIsTrackingUnknown(false);
      setCountsConfirmed(true);
      const resolvedBatchId = String(data.batch_id ?? "");
      setScheduleId(null);
      setScheduledAt(null);
      setCreatedAt(data.created_at ?? null);
      setCanCancelSchedule(false);
      setDispatchErrorMessage("");
      if (resolvedBatchId) {
        setBatchId(resolvedBatchId);
      }
      setBatchStatus(data.status ?? null);

      const displayItems = toAiBatchDisplayItems(
        data.items,
        itemsRef.current,
        nameMapRef.current
      );
      recordGasContractViolations(
        displayItems,
        contractViolationSeenRef.current
      );
      setItems(displayItems);
      markCompletedItemsSynced(displayItems);

      if (isTerminalBatchStatus(data.status)) {
        clearStoredState();
      }
    },
    [markCompletedItemsSynced]
  );

  // サーバー側（Supabase）に保存されている即時実行＋予約の統合一覧を取得する（全デバイス共通）
  const refreshRuns = useCallback(
    async (modeOverride?: boolean): Promise<AiBatchRunSummary[]> => {
      const targetMode = modeOverride ?? isTestMode;
      try {
        const res = await listAiBatchRuns({
          testOnly: targetMode,
          limit: 20,
        });
        const list = Array.isArray(res.runs) ? res.runs : [];
        setRuns(list);
        return list;
      } catch {
        return [];
      }
    },
    [isTestMode]
  );

  const loadRunDetail = useCallback(
    async (run: AiBatchRunSummary, targetMode: boolean) => {
      if (run.run_type === "scheduled" && run.schedule_id) {
        const detail = await getAiBatchSchedule(run.schedule_id, targetMode);
        applyScheduleDetailToState(detail);
        return;
      }
      if (run.batch_id) {
        const detail = await getAiProductDraftBatch(run.batch_id, targetMode);
        applyImmediateProgressToState(detail);
      }
    },
    [applyScheduleDetailToState, applyImmediateProgressToState]
  );

  // 初回読込および通常／テストモード切替時に、未確定の送信再試行またはサーバー統合一覧から状態を復元する。
  // 別PC・スマートフォン（localStorage が空のブラウザ）でも即時実行・予約の両方を復元できる。
  useEffect(() => {
    let cancelled = false;

    setErrorMessage("");
    setPollError("");
    setDispatchErrorMessage("");
    pollFailureRef.current = 0;
    setIsTrackingUnknown(false);

    const restore = async () => {
      const { state: stored, expired } = readStoredState();
      if (expired) {
        setNoticeMessage(
          "前回のAI生成バッチの情報が古いため、進捗表示を終了しました。"
        );
      }

      // 1. 通信切断等で batch_id 受領前に中断していた即時リクエストがある場合は同じ request_id で再送
      if (
        stored &&
        !stored.batchId &&
        Boolean(stored.testOnly) === Boolean(isTestMode) &&
        stored.items.length > 0
      ) {
        setCountsConfirmed(false);
        const map: Record<string, string> = {};
        stored.items.forEach((i) => {
          map[i.product_id] = i.product_name;
        });
        nameMapRef.current = map;
        const productIds = stored.items.map((i) => i.product_id);
        setIsSubmitting(true);
        try {
          const res = await createAiProductDraftBatch({
            requestId: stored.requestId,
            productIds,
            minCostMarkupRate:
              stored.minCostMarkupRate ?? DEFAULT_MIN_COST_MARKUP_RATE,
            testOnly: stored.testOnly === true,
            forceRegenerate: stored.forceRegenerate === true,
          });
          clearStoredState();
          if (!cancelled && res.batch_id) {
            const detail = await getAiProductDraftBatch(
              String(res.batch_id),
              isTestMode
            );
            if (!cancelled) {
              applyImmediateProgressToState(detail);
              setPollToken((t) => t + 1);
            }
          }
        } catch (err) {
          if (classifyRetryFailure(err) === "definitive_rejection") {
            clearStoredState();
          }
          if (!cancelled) {
            setErrorMessage(
              err instanceof Error && err.message
                ? err.message
                : "一括AI生成の受付確認に失敗しました。"
            );
          }
        } finally {
          if (!cancelled) setIsSubmitting(false);
        }
        void refreshRuns(isTestMode);
        return;
      }

      // モード切替時は前のモードの表示をリセットしてからサーバー統合一覧を取得
      setItems(null);
      setBatchStatus(null);
      setBatchId(null);
      setScheduleId(null);
      setScheduledAt(null);
      setCreatedAt(null);
      setCanCancelSchedule(false);
      setCountsConfirmed(true);

      const list = await refreshRuns(isTestMode);
      if (cancelled) return;

      const targetRun = pickAutoRestoreRun(list);
      if (!targetRun) return;

      try {
        await loadRunDetail(targetRun, isTestMode);
        if (!cancelled) {
          setPollToken((t) => t + 1);
        }
      } catch {
        // 一覧サマリーのみ保持
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [
    isTestMode,
    refreshRuns,
    loadRunDetail,
    applyImmediateProgressToState,
  ]);

  // 別デバイスで新たに即時実行・予約が開始された場合にも、タブ復帰時・待機中の定期確認で一覧と進捗を同期する
  useEffect(() => {
    let cancelled = false;

    const syncFromOtherDevices = async () => {
      const list = await refreshRuns(isTestMode);
      if (cancelled) return;
      if (!itemsRef.current) {
        const activeCandidate = list.find(
          (r) => r.is_active && !isRunBannerDismissed(r)
        );
        if (activeCandidate) {
          try {
            await loadRunDetail(activeCandidate, isTestMode);
            if (!cancelled) setPollToken((t) => t + 1);
          } catch {
            // ignore
          }
        }
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncFromOtherDevices();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    const interval = window.setInterval(
      () => void syncFromOtherDevices(),
      AI_SCHEDULE_IDLE_POLL_INTERVAL_MS
    );

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(interval);
    };
  }, [isTestMode, refreshRuns, loadRunDetail]);

  const activeRunKey = scheduleId
    ? `schedule:${scheduleId}`
    : batchId
      ? `batch:${batchId}`
      : null;

  const dismiss = useCallback(() => {
    if (activeRunKey && batchStatus) {
      markRunBannerDismissed(activeRunKey, batchStatus);
    }
    clearStoredState();
    clearRetryRequestId();
    nameMapRef.current = {};
    itemsRef.current = null;
    contractViolationSeenRef.current = new Set();
    syncedBatchCompletedRef.current = new Set();
    pollFailureRef.current = 0;
    setIsTrackingUnknown(false);
    setCountsConfirmed(true);
    setItems(null);
    setBatchStatus(null);
    setBatchId(null);
    setScheduleId(null);
    setScheduledAt(null);
    setCreatedAt(null);
    setCanCancelSchedule(false);
    setDispatchErrorMessage("");
    setErrorMessage("");
    setPollError("");
  }, [activeRunKey, batchStatus]);

  // 進捗取得ポーリング:
  // - scheduleId がある場合: GET /ai-batch-schedules/:scheduleId を取得（予約待ちは15秒間隔、開始後・処理中は5秒間隔）
  // - 即時バッチ（scheduleId なし & batchId あり）の場合: GET /ai-batches/:batchId を5秒間隔で取得
  useEffect(() => {
    if (!scheduleId && !batchId) return;
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        if (scheduleId) {
          const detail = await getAiBatchSchedule(scheduleId, isTestMode);
          if (cancelled) return;
          setPollError("");
          applyScheduleDetailToState(detail);
          if (isTerminalBatchStatus(detail.overall_status)) {
            void refreshRuns(isTestMode);
            return;
          }
          const nextDelay =
            detail.overall_status === "scheduled"
              ? AI_SCHEDULE_IDLE_POLL_INTERVAL_MS
              : AI_BATCH_POLL_INTERVAL_MS;
          timer = window.setTimeout(tick, nextDelay);
          return;
        }

        if (batchId) {
          const data = await getAiProductDraftBatch(batchId, isTestMode);
          if (cancelled) return;
          setPollError("");
          applyImmediateProgressToState(data);
          if (isTerminalBatchStatus(data.status)) {
            void refreshRuns(isTestMode);
            return;
          }
          timer = window.setTimeout(tick, AI_BATCH_POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        // 確定エラー（バッチや予約が存在しない・取得権限がない等）は追跡を終了する。
        if (isDefinitiveBatchPollError(err)) {
          dismiss();
          setNoticeMessage(
            "前回のAI生成バッチの記録が見つからなかったため、進捗表示を終了しました。"
          );
          return;
        }
        // 一時的なエラー（通信断・タイムアウト・HTTP 5xx 等）はポーリングを継続する。
        pollFailureRef.current += 1;
        if (
          pollFailureRef.current >= AI_BATCH_MAX_CONSECUTIVE_POLL_FAILURES
        ) {
          setIsTrackingUnknown(true);
        }
        setPollError(
          err instanceof Error && err.message
            ? err.message
            : "進捗の取得に失敗しました。"
        );
        timer = window.setTimeout(tick, AI_BATCH_POLL_INTERVAL_MS);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [
    scheduleId,
    batchId,
    isTestMode,
    pollToken,
    applyScheduleDetailToState,
    applyImmediateProgressToState,
    refreshRuns,
    dismiss,
  ]);

  // 即時実行の受付（重複商品で409拒否された場合は false を返し、確認ダイアログ内で重複IDを表示する）
  const start = useCallback(
    async (
      targets: AiBatchTarget[],
      minCostMarkupRate: number = DEFAULT_MIN_COST_MARKUP_RATE,
      options?: { testOnly?: boolean; forceRegenerate?: boolean }
    ): Promise<boolean> => {
      if (isSubmitting || targets.length === 0) return false;
      if (targets.length > MAX_AI_BATCH_SIZE) {
        setErrorMessage(
          `一度に受付できるのは最大${MAX_AI_BATCH_SIZE}件です。`
        );
        return false;
      }
      setErrorMessage("");
      setPollError("");

      const productIds = targets.map((t) => t.product_id);
      const map: Record<string, string> = {};
      targets.forEach((t) => {
        map[t.product_id] = t.product_name || "（商品名なし）";
      });

      const testOnly = options?.testOnly === true;
      const forceRegenerate = options?.forceRegenerate === true;

      const { state: stored } = readStoredState();
      const reuseRequestId =
        stored != null &&
        stored.batchId == null &&
        Boolean(stored.testOnly) === testOnly &&
        Boolean(stored.forceRegenerate) === forceRegenerate &&
        sameProductIds(
          stored.items.map((i) => i.product_id),
          productIds
        );
      const requestId =
        reuseRequestId && stored ? stored.requestId : createRequestId();

      writeStoredState({
        requestId,
        batchId: null,
        items: productIds.map((id) => ({
          product_id: id,
          product_name: map[id] ?? "",
        })),
        minCostMarkupRate,
        testOnly,
        forceRegenerate,
      });

      setIsSubmitting(true);
      try {
        const res = await createAiProductDraftBatch({
          requestId,
          productIds,
          minCostMarkupRate,
          testOnly,
          forceRegenerate,
        });
        const newBatchId = String(res.batch_id);
        clearStoredState();
        clearRetryRequestId();
        nameMapRef.current = map;

        setCountsConfirmed(true);
        pollFailureRef.current = 0;
        setIsTrackingUnknown(false);
        setNoticeMessage("");
        setScheduleId(null);
        setScheduledAt(null);
        setCreatedAt(res.created_at ?? new Date().toISOString());
        setCanCancelSchedule(false);
        setDispatchErrorMessage("");
        setItems(
          productIds.map((id) => ({
            product_id: id,
            product_name: map[id],
            status: "pending",
            retry_count: 0,
            error_code: null,
            error_message: null,
          }))
        );
        setBatchStatus(res.status ?? "queued");
        setBatchId(newBatchId);
        setPollToken((t) => t + 1);
        void refreshRuns(testOnly);
        return true;
      } catch (err) {
        if (classifyRetryFailure(err) === "definitive_rejection") {
          clearStoredState();
        }
        setErrorMessage(
          err instanceof Error && err.message
            ? err.message
            : "一括AI生成の受付に失敗しました。"
        );
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, refreshRuns]
  );

  // 日時を指定して予約する（選択済み商品IDを固定してサーバーへ保存）
  const schedule = useCallback(
    async (
      targets: AiBatchTarget[],
      scheduledAtIso: string,
      minCostMarkupRate: number = DEFAULT_MIN_COST_MARKUP_RATE,
      options?: { testOnly?: boolean; forceRegenerate?: boolean }
    ): Promise<boolean> => {
      if (isSubmitting || targets.length === 0) return false;
      if (targets.length > MAX_AI_BATCH_SIZE) {
        setErrorMessage(
          `一度に予約できるのは最大${MAX_AI_BATCH_SIZE}件です。`
        );
        return false;
      }
      setErrorMessage("");
      setPollError("");

      const productIds = targets.map((t) => t.product_id);
      const map: Record<string, string> = {};
      targets.forEach((t) => {
        map[t.product_id] = t.product_name || "（商品名なし）";
      });

      const testOnly = options?.testOnly === true;
      const forceRegenerate = options?.forceRegenerate === true;
      const pendingReq = readPendingScheduleReq();
      const reuseReq =
        pendingReq != null &&
        pendingReq.scheduledAtIso === scheduledAtIso &&
        pendingReq.testOnly === testOnly &&
        pendingReq.forceRegenerate === forceRegenerate &&
        sameProductIds(pendingReq.productIds, productIds);
      const requestId =
        reuseReq && pendingReq
          ? pendingReq.requestId
          : createRequestId("REQ_SCHED");

      writePendingScheduleReq({
        requestId,
        scheduledAtIso,
        productIds,
        minCostMarkupRate,
        testOnly,
        forceRegenerate,
      });

      setIsSubmitting(true);
      try {
        const detail = await createAiBatchSchedule({
          requestId,
          scheduledAtIso,
          productIds,
          productNames: map,
          minCostMarkupRate,
          testOnly,
          forceRegenerate,
        });
        clearPendingScheduleReq();
        clearStoredState();
        clearRetryRequestId();
        nameMapRef.current = map;
        setNoticeMessage("");
        applyScheduleDetailToState(detail);
        setPollToken((t) => t + 1);
        void refreshRuns(testOnly);
        return true;
      } catch (err) {
        if (classifyRetryFailure(err) === "definitive_rejection") {
          clearPendingScheduleReq();
        }
        setErrorMessage(
          err instanceof Error && err.message
            ? err.message
            : "AI一括生成の予約に失敗しました。"
        );
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, applyScheduleDetailToState, refreshRuns]
  );

  // 開始前の予約を取り消す
  const cancelSchedule = useCallback(
    async (targetScheduleId?: string) => {
      const idToCancel = targetScheduleId ?? scheduleId;
      if (!idToCancel || isCancelling) return;
      setErrorMessage("");
      setIsCancelling(true);
      try {
        const detail = await cancelAiBatchSchedule(idToCancel, isTestMode);
        applyScheduleDetailToState(detail);
        void refreshRuns(isTestMode);
      } catch (err) {
        setErrorMessage(
          err instanceof Error && err.message
            ? err.message
            : "予約の取り消しに失敗しました。"
        );
        setPollToken((t) => t + 1);
      } finally {
        setIsCancelling(false);
      }
    },
    [
      scheduleId,
      isCancelling,
      isTestMode,
      applyScheduleDetailToState,
      refreshRuns,
    ]
  );

  // サーバーに保存されている任意の即時実行または予約（`schedule:<id>` / `batch:<id>`）を選択して表示する
  const selectRun = useCallback(
    async (runKey: string) => {
      if (!runKey) return;
      setErrorMessage("");
      setPollError("");
      try {
        if (runKey.startsWith("schedule:")) {
          const sid = runKey.slice("schedule:".length);
          const detail = await getAiBatchSchedule(sid, isTestMode);
          clearStoredState();
          applyScheduleDetailToState(detail);
          setPollToken((t) => t + 1);
          return;
        }
        const bid = runKey.startsWith("batch:")
          ? runKey.slice("batch:".length)
          : runKey;
        const detail = await getAiProductDraftBatch(bid, isTestMode);
        clearStoredState();
        applyImmediateProgressToState(detail);
        setPollToken((t) => t + 1);
      } catch (err) {
        setErrorMessage(
          err instanceof Error && err.message
            ? err.message
            : "実行結果・予約詳細の取得に失敗しました。"
        );
      }
    },
    [isTestMode, applyScheduleDetailToState, applyImmediateProgressToState]
  );

  const retryFailed = useCallback(async () => {
    if (!batchId || isSubmitting) return;
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      const requestId =
        readRetryRequestId(batchId) ?? createRequestId("REQ_RETRY");
      writeRetryRequestId(batchId, requestId);

      await retryAiProductDraftBatch({ batchId, requestId });

      clearRetryRequestId();
      setPollToken((t) => t + 1);
      void refreshRuns(isTestMode);
    } catch (err) {
      if (classifyRetryFailure(err) === "definitive_rejection") {
        clearRetryRequestId();
      }
      if (err instanceof AiRelayError && err.code === "NO_FAILED_ITEMS") {
        setErrorMessage("再実行の対象（失敗した商品）がありません。");
        setPollToken((t) => t + 1);
      } else {
        setErrorMessage(
          err instanceof Error && err.message
            ? err.message
            : "失敗分の再実行に失敗しました。"
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [batchId, isSubmitting, refreshRuns, isTestMode]);

  const hasActiveBatch = items !== null;
  const isPolling =
    (Boolean(scheduleId) || Boolean(batchId)) &&
    !isTerminalBatchStatus(batchStatus);
  // サーバー側で重複商品IDの受付を止めるため、バックグラウンド実行中に別商品の選択・操作をロックしない
  const isBusy = isSubmitting || isCancelling;

  return {
    items,
    batchStatus,
    batchId,
    scheduleId,
    activeRunKey,
    scheduledAt,
    createdAt,
    canCancelSchedule,
    dispatchErrorMessage,
    runs,
    isSubmitting,
    isCancelling,
    isPolling,
    isBusy,
    isTrackingUnknown,
    countsConfirmed,
    noticeMessage,
    hasActiveBatch,
    errorMessage,
    pollError,
    clearError,
    clearNoticeMessage,
    start,
    schedule,
    cancelSchedule,
    selectRun,
    refreshRuns,
    retryFailed,
    dismiss,
  };
}
