import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AiBatchDisplayItem,
  AiBatchOverallStatus,
  AiBatchTarget,
} from "@/pages/products/types";
import { AiRelayError } from "@/pages/register/lib/aiProduct";
import {
  AI_BATCH_POLL_INTERVAL_MS,
  DEFAULT_MIN_COST_MARKUP_RATE,
  MAX_AI_BATCH_SIZE,
  classifyRetryFailure,
  createAiProductDraftBatch,
  createRequestId,
  getAiProductDraftBatch,
  isTerminalBatchStatus,
  recordGasContractViolations,
  retryAiProductDraftBatch,
  toAiBatchDisplayItems,
} from "@/pages/products/lib/aiBatch";

// 再読込後も受付・進捗へ復帰するための保存キー。
// 受付送信の「前」に request_id と選択した商品ID一覧を保存し、
// 応答未受信のまま再読込された場合は同じ request_id で再送できるようにする。
const STORAGE_KEY = "ai_batch_state_v1";

interface StoredBatchItem {
  product_id: string;
  product_name: string;
}

interface StoredBatchState {
  // 受付の冪等キー。応答未受信の再読込では同じ request_id で再送する。
  requestId: string;
  // 受付成功後に得られる batch_id。取得後はこのIDで進捗へ復帰する（未取得なら null）。
  batchId: string | null;
  items: StoredBatchItem[];
  // 受付時に送った概算原価への最低上乗せ率（0より大きく5.0以下の小数）。
  // 再送時も同じ条件で送り直す。
  minCostMarkupRate: number | null;
}

function readStoredState(): StoredBatchState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredBatchState>;
    if (!parsed || typeof parsed.requestId !== "string" || !parsed.requestId) {
      return null;
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
    };
  } catch {
    return null;
  }
}

function writeStoredState(state: StoredBatchState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

// 失敗分再実行（retry）の冪等性キーの保存キー。
// 契約 2.3: 同一 request_id の再送は再試行を重複登録せず初回応答を is_reused:true で返す。
// そのため「応答を受け取れなかった再送」では同じ request_id を再利用する。
const RETRY_STORAGE_KEY = "ai_batch_retry_state_v1";

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
    // 保存できなくても処理は継続する
  }
}

function clearRetryRequestId(): void {
  try {
    window.localStorage.removeItem(RETRY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function buildPendingItems(items: StoredBatchItem[]): AiBatchDisplayItem[] {
  return items.map((i) => ({
    product_id: i.product_id,
    product_name: i.product_name || i.product_id,
    status: "pending",
    retry_count: 0,
    error_code: null,
    error_message: null,
  }));
}

// 選択商品IDの並びが一致するかを判定する（同じ受付の再送かどうかの判定に使う）。
function sameProductIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function useAiBatchGeneration() {
  const [items, setItems] = useState<AiBatchDisplayItem[] | null>(null);
  const [batchStatus, setBatchStatus] = useState<AiBatchOverallStatus | null>(
    null
  );
  const [batchId, setBatchId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [pollError, setPollError] = useState("");
  const [pollToken, setPollToken] = useState(0);

  const nameMapRef = useRef<Record<string, string>>({});
  // 直近の表示アイテム（ポーリングの前回値として使う）。
  const itemsRef = useRef<AiBatchDisplayItem[] | null>(null);
  // 契約外応答（completed + error_code）を一度だけ記録するための既出管理。
  const contractViolationSeenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // 受付（create）を送信する共通処理。start と、再読込時の再送の両方から呼ぶ。
  const submitRequest = useCallback(
    async (
      requestId: string,
      productIds: string[],
      nameMap: Record<string, string>,
      minCostMarkupRate: number
    ) => {
      setErrorMessage("");
      setPollError("");
      setIsSubmitting(true);
      try {
        const res = await createAiProductDraftBatch({
          requestId,
          productIds,
          minCostMarkupRate,
        });
        const newBatchId = String(res.batch_id);
        // batch_id 取得後は、そのIDで進捗へ復帰できるよう保存を更新する。
        writeStoredState({
          requestId,
          batchId: newBatchId,
          items: productIds.map((id) => ({
            product_id: id,
            product_name: nameMap[id] ?? "",
          })),
          minCostMarkupRate,
        });
        setBatchStatus(res.status ?? "queued");
        setBatchId(newBatchId);
        setPollToken((t) => t + 1);
      } catch (err) {
        // 応答未受信：保存済み request_id をそのまま残し、
        // 再読込で同じ要求として再送できるようにする（成功扱いにしない）。
        setBatchStatus(null);
        setErrorMessage(
          err instanceof Error && err.message
            ? err.message
            : "一括AI生成の受付に失敗しました。"
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  // 再読込後、保存済みの request_id / batch_id から受付・進捗へ復帰する。
  useEffect(() => {
    const stored = readStoredState();
    if (!stored) return;

    const map: Record<string, string> = {};
    stored.items.forEach((i) => {
      map[i.product_id] = i.product_name;
    });
    nameMapRef.current = map;
    setItems(buildPendingItems(stored.items));

    // batch_id があれば、そのIDで進捗取得へ復帰する。
    if (stored.batchId) {
      setBatchId(stored.batchId);
      return;
    }

    // batch_id 未取得＝受付の応答未受信。同じ request_id・同じ条件で受付を再送する。
    const productIds = stored.items.map((i) => i.product_id);
    if (productIds.length > 0) {
      setBatchStatus("queued");
      void submitRequest(
        stored.requestId,
        productIds,
        map,
        stored.minCostMarkupRate ?? DEFAULT_MIN_COST_MARKUP_RATE
      );
    }
  }, [submitRequest]);

  // 約5秒間隔の進捗取得。完了（終了状態）で停止する。
  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const data = await getAiProductDraftBatch(batchId);
        if (cancelled) return;
        setPollError("");
        setBatchStatus(data.status ?? null);
        const displayItems = toAiBatchDisplayItems(
          data.items,
          itemsRef.current,
          nameMapRef.current
        );
        // 契約外応答（status:"completed" かつ error_code）を記録する。
        // 成功表示はしないが、GAS側は completed のため retry 対象に含まれない可能性がある。
        recordGasContractViolations(
          displayItems,
          contractViolationSeenRef.current
        );
        setItems(displayItems);
        if (isTerminalBatchStatus(data.status)) {
          return; // 完了後は定期取得を停止する
        }
      } catch (err) {
        if (cancelled) return;
        // API取得失敗は処理成功や履歴なしとして扱わない（最後の状態を保持して警告表示）
        setPollError(
          err instanceof Error && err.message
            ? err.message
            : "進捗の取得に失敗しました。"
        );
      }
      if (cancelled) return;
      timer = window.setTimeout(tick, AI_BATCH_POLL_INTERVAL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [batchId, pollToken]);

  const start = useCallback(
    async (
      targets: AiBatchTarget[],
      minCostMarkupRate: number = DEFAULT_MIN_COST_MARKUP_RATE
    ) => {
      if (isSubmitting || targets.length === 0) return;
      if (targets.length > MAX_AI_BATCH_SIZE) {
        setErrorMessage(
          `一度に受付できるのは最大${MAX_AI_BATCH_SIZE}件です。`
        );
        return;
      }
      setErrorMessage("");
      setPollError("");

      const productIds = targets.map((t) => t.product_id);
      const map: Record<string, string> = {};
      targets.forEach((t) => {
        map[t.product_id] = t.product_name || "（商品名なし）";
      });
      nameMapRef.current = map;

      // 受付送信の「前」に request_id と選択商品ID一覧を永続保存する。
      // 同じ選択・未受付の再送では保存済み request_id を再利用する（受付の冪等性）。
      const stored = readStoredState();
      const reuseRequestId =
        stored != null &&
        stored.batchId == null &&
        sameProductIds(
          stored.items.map((i) => i.product_id),
          productIds
        );
      const requestId =
        reuseRequestId && stored ? stored.requestId : createRequestId();

      // 新しい受付に入るので、前のバッチの再実行 request_id は引き継がない。
      clearRetryRequestId();

      writeStoredState({
        requestId,
        batchId: null,
        items: productIds.map((id) => ({
          product_id: id,
          product_name: map[id] ?? "",
        })),
        minCostMarkupRate,
      });

      // 受付直後の初期表示（まだ契約の応答がないため pending で埋める）
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
      setBatchStatus("queued");

      await submitRequest(requestId, productIds, map, minCostMarkupRate);
    },
    [isSubmitting, submitRequest]
  );

  const retryFailed = useCallback(async () => {
    if (!batchId || isSubmitting) return;
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      // 応答を受け取れなかった再送では、保存済みの同じ request_id を再利用する（契約 2.3）。
      // 新しい再試行（応答受信済み）には新しい request_id を使う。
      const requestId =
        readRetryRequestId(batchId) ?? createRequestId("REQ_RETRY");
      // 送信の前に保存し、通信切断後の再送でも同じ request_id を使えるようにする。
      writeRetryRequestId(batchId, requestId);

      await retryAiProductDraftBatch({ batchId, requestId });

      // 応答を受信できた＝再試行を登録済み。次回は新しい request_id を使う。
      clearRetryRequestId();
      setPollToken((t) => t + 1);
    } catch (err) {
      // request_id の破棄可否は「受付されなかったことが確定したか」で判断する（契約 2.3）。
      // 受付されなかったことが確定できるコード（NO_FAILED_ITEMS / BATCH_NOT_FOUND 等）だけ破棄し、
      // 中継タイムアウト・転送失敗・応答解析失敗・HTTP 5xx・未知コードなど
      // GASが受付済みか判断できない場合は同じ request_id を保持して再送する。
      if (classifyRetryFailure(err) === "definitive_rejection") {
        clearRetryRequestId();
      }
      if (err instanceof AiRelayError && err.code === "NO_FAILED_ITEMS") {
        // 失敗商品が無い＝再実行不要。success:false なので成功表示にしない。
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
  }, [batchId, isSubmitting]);

  const dismiss = useCallback(() => {
    clearStoredState();
    clearRetryRequestId();
    nameMapRef.current = {};
    itemsRef.current = null;
    contractViolationSeenRef.current = new Set();
    setItems(null);
    setBatchStatus(null);
    setBatchId(null);
    setErrorMessage("");
    setPollError("");
  }, []);

  const hasActiveBatch = items !== null;
  const isPolling = Boolean(batchId) && !isTerminalBatchStatus(batchStatus);
  const isBusy = isSubmitting || isPolling;

  return {
    items,
    batchStatus,
    batchId,
    isSubmitting,
    isPolling,
    isBusy,
    hasActiveBatch,
    errorMessage,
    pollError,
    start,
    retryFailed,
    dismiss,
  };
}