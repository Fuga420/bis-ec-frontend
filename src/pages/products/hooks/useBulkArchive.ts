import { useCallback, useMemo, useRef, useState } from "react";
import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
import type {
  AdminProductDetailResponse,
  RecordStatusUpdateResponse,
} from "@/pages/products/types";

// 一括アーカイブの商品別結果ステータス。
// - success: アーカイブを確認できた（API成功、または通信エラー後の再取得で archived を確認）
// - failed:  アーカイブされていないことを確認できた（確定失敗・再試行対象）
// - skipped: 選択時点ですでにアーカイブ済み（APIを呼ばない）
// - unknown: 通信エラー等で結果を確認できず、archived かどうかも判定できない
//            （「受付結果不明・要確認」。成功・確定失敗のどちらにも決めつけない）
export type BulkArchiveStatus = "success" | "failed" | "skipped" | "unknown";

export interface BulkArchiveResultItem {
  product_id: string;
  product_name: string;
  status: BulkArchiveStatus;
  reason?: string;
}

export interface BulkArchiveCounts {
  success: number;
  failed: number;
  skipped: number;
  unknown: number;
}

// アーカイブ対象。一覧の AdminProduct からも、再試行時の結果からも渡せる軽量な型。
export interface BulkArchiveTarget {
  product_id: string;
  product_name?: string;
  record_status?: string;
}

// 単品アーカイブ呼び出しの結果区分。
// uncertain は「送信したが結果を判定できない（通信断・タイムアウト・応答解析失敗）」を表す。
type ArchiveOutcome =
  | { kind: "success" }
  | { kind: "failed"; reason: string }
  | { kind: "uncertain" };

async function requestArchive(productId: string): Promise<ArchiveOutcome> {
  try {
    // 既存の単品アーカイブと同じ action を1件ずつ呼ぶ（新しいAPI・一括APIは使わない）。
    // これにより Square 連携済み商品の Square 側アーカイブ等は GAS 側で既存どおり実行される。
    const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "update_record_status",
        product_id: productId,
        record_status: "archived",
      }),
    });
    let data: RecordStatusUpdateResponse | null = null;
    try {
      data = (await response.json()) as RecordStatusUpdateResponse;
    } catch {
      data = null;
    }
    // バックエンドが成功を明示した場合のみ成功とする。
    if (response.ok && data && data.success === true) {
      return { kind: "success" };
    }
    // success:false はバックエンドが受付を拒否した「確定失敗」。理由を保持して表示する。
    if (data && data.success === false) {
      const message = (data.message ?? data.error ?? "").toString().trim();
      const code = (data.error_code ?? "").toString().trim();
      if (message && code) return { kind: "failed", reason: `${message}（コード: ${code}）` };
      if (message) return { kind: "failed", reason: message };
      if (code) return { kind: "failed", reason: `アーカイブに失敗しました（コード: ${code}）` };
      return { kind: "failed", reason: "アーカイブに失敗しました" };
    }
    // 応答は返ったが成功・失敗を判定できない → 状態不明（要確認）
    return { kind: "uncertain" };
  } catch {
    // 通信断・タイムアウト等 → 状態不明（要確認）
    return { kind: "uncertain" };
  }
}

// 既存の単品取得API（GET ?mode=admin&product_id=...）で現在の record_status を再取得する。
// 商品詳細画面と同じエンドポイントを使い、新しいAPIは追加しない。
async function fetchCurrentRecordStatus(
  productId: string
): Promise<"archived" | "active" | "unknown"> {
  try {
    const url = `${GOOGLE_SHEETS_WEBHOOK_URL}?mode=admin&product_id=${encodeURIComponent(
      productId
    )}`;
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) return "unknown";
    const data = (await response.json()) as AdminProductDetailResponse;
    if (!data || data.success !== true || !data.product) return "unknown";
    const status = (data.product.record_status ?? "").toString().trim();
    if (status === "archived") return "archived";
    if (status === "active") return "active";
    return "unknown";
  } catch {
    return "unknown";
  }
}

// 結果不明（uncertain）の商品について、現在の状態を再取得して分類し直す。
// - archived を確認 → success（成功として扱う）
// - active を確認   → failed（未アーカイブを確認。スタッフの操作で再試行できる）
// - 確認できない    → unknown（受付結果不明・要確認。成功・確定失敗のどちらにも決めつけない）
async function resolveUnknown(
  productId: string
): Promise<{ status: BulkArchiveStatus; reason: string }> {
  const verified = await fetchCurrentRecordStatus(productId);
  if (verified === "archived") {
    return {
      status: "success",
      reason: "通信エラー後に現在の状態を確認し、アーカイブ済みであることを確認しました",
    };
  }
  if (verified === "active") {
    return {
      status: "failed",
      reason:
        "通信エラー後に現在の状態を確認し、未アーカイブであることを確認しました。再試行できます。",
    };
  }
  return {
    status: "unknown",
    reason:
      "受付結果不明・要確認（通信エラーにより現在の状態も確認できませんでした）",
  };
}

/**
 * 一括アーカイブ（既存の単品 update_record_status を1件ずつ直列実行）。
 *
 * - 逐次実行（並列にしない）。商品ごとに成功／失敗／スキップ／要確認を記録する。
 * - 途中失敗を全件成功と表示しない（成功は success の商品のみ）。
 * - 成功分は再送しない。確定失敗（failed）のみ再試行できる（retryFailed）。
 * - 通信断・タイムアウト等で結果不明（uncertain）の商品は、既存APIで現在の状態を再取得し、
 *   archived なら成功、未アーカイブなら failed（再試行可）、確認できなければ unknown（要確認）。
 * - 連打防止（isRunning / runningRef でガード）。
 * - 削除・完全消去は行わない（アーカイブの既存の意味のみ）。
 */
export function useBulkArchive() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<BulkArchiveResultItem[] | null>(null);
  const runningRef = useRef(false);

  const runTargets = useCallback(async (targets: BulkArchiveTarget[]) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true);
    setResults(null);
    setProgress({ done: 0, total: targets.length });

    const out: BulkArchiveResultItem[] = [];
    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i];
      const base = {
        product_id: target.product_id,
        product_name: target.product_name || "（商品名なし）",
      };
      // すでにアーカイブ済みなら API を呼ばず skipped
      if (target.record_status === "archived") {
        out.push({ ...base, status: "skipped", reason: "すでにアーカイブ済みです" });
      } else {
        const res = await requestArchive(target.product_id);
        if (res.kind === "success") {
          out.push({ ...base, status: "success" });
        } else if (res.kind === "failed") {
          out.push({ ...base, status: "failed", reason: res.reason });
        } else {
          // 通信断・タイムアウト等で結果不明 → 既存APIで現在の状態を再取得して判定する
          const resolved = await resolveUnknown(target.product_id);
          out.push({ ...base, status: resolved.status, reason: resolved.reason });
        }
      }
      setProgress({ done: i + 1, total: targets.length });
    }

    setIsRunning(false);
    runningRef.current = false;
    setResults(out);
  }, []);

  // 失敗分（確定失敗）のみを再試行する（成功・スキップ・要確認分は再送しない）。
  const retryFailed = useCallback(async () => {
    if (runningRef.current || !results) return;
    const failed = results.filter((item) => item.status === "failed");
    if (failed.length === 0) return;
    await runTargets(
      failed.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
      }))
    );
  }, [results, runTargets]);

  // 受付結果不明（unknown）の商品だけ、現在の状態を再取得して分類し直す。
  // 成功・失敗が確定した商品は再送・再判定しない。
  const reverifyUnknown = useCallback(async () => {
    if (runningRef.current || !results) return;
    const unknownItems = results.filter((item) => item.status === "unknown");
    if (unknownItems.length === 0) return;
    runningRef.current = true;
    setIsRunning(true);
    setProgress({ done: 0, total: unknownItems.length });

    const updated = new Map<string, BulkArchiveResultItem>();
    for (let i = 0; i < unknownItems.length; i += 1) {
      const item = unknownItems[i];
      const resolved = await resolveUnknown(item.product_id);
      updated.set(item.product_id, {
        ...item,
        status: resolved.status,
        reason: resolved.reason,
      });
      setProgress({ done: i + 1, total: unknownItems.length });
    }

    setIsRunning(false);
    runningRef.current = false;
    setResults((prev) =>
      prev ? prev.map((item) => updated.get(item.product_id) ?? item) : prev
    );
  }, [results]);

  const dismiss = useCallback(() => {
    setResults(null);
    setProgress({ done: 0, total: 0 });
  }, []);

  const counts = useMemo<BulkArchiveCounts | null>(() => {
    if (!results) return null;
    return {
      success: results.filter((item) => item.status === "success").length,
      failed: results.filter((item) => item.status === "failed").length,
      skipped: results.filter((item) => item.status === "skipped").length,
      unknown: results.filter((item) => item.status === "unknown").length,
    };
  }, [results]);

  return {
    isRunning,
    progress,
    results,
    counts,
    run: runTargets,
    retryFailed,
    reverifyUnknown,
    dismiss,
  };
}