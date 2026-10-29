import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AiBatchConfirmModal from "@/pages/products/components/AiBatchConfirmModal";
import { useAiBatch } from "@/pages/products/context/AiBatchProvider";
import {
  AI_BATCH_STATUS_LABELS,
  MAX_AI_BATCH_SIZE,
} from "@/pages/products/lib/aiBatch";
import type { AiBatchTarget } from "@/pages/products/types";

interface ImportBatchSectionProps {
  // 取り込みに成功した（product_id を取得できた）商品のみ。
  products: AiBatchTarget[];
  // AI解析用画像の保存が終わっていないため、対象から外した商品の件数。
  blockedAiSelectionCount?: number;
}

/**
 * 画像だけ取込（/import）で下書き取込に成功した商品を一覧表示し、
 * 既存の一括AI生成（gas-ai-batch-relay 経由。新しいAI生成APIは作らない）へ進む導線を提供する。
 *
 * 契約上、1回の受付は最大 MAX_AI_BATCH_SIZE（20件）のため、
 * 20件を超える場合は画面上で 20件ずつに区切ってグループ表示し、グループ単位で実行する。
 * 進捗は既存のフック（ポーリング・再読込復帰・失敗分のみ再実行）をそのまま使う。
 */
export default function ImportBatchSection({
  products,
  blockedAiSelectionCount = 0,
}: ImportBatchSectionProps) {
  // バッチ状態は管理画面共通のプロバイダーが保持する（ここで独自にポーリングしない）。
  const batch = useAiBatch();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [pendingTargets, setPendingTargets] = useState<AiBatchTarget[]>([]);

  // 20件ずつに区切る。20件以下なら1グループ。
  const groups = useMemo(() => {
    const out: AiBatchTarget[][] = [];
    for (let i = 0; i < products.length; i += MAX_AI_BATCH_SIZE) {
      out.push(products.slice(i, i + MAX_AI_BATCH_SIZE));
    }
    return out;
  }, [products]);

  if (products.length === 0 && blockedAiSelectionCount === 0) return null;

  const isSplit = products.length > MAX_AI_BATCH_SIZE;

  const requestGroup = (group: AiBatchTarget[]) => {
    if (batch.isBusy) return;
    setPendingTargets(group);
    setIsConfirmOpen(true);
  };

  const confirmStart = async () => {
    if (batch.isBusy || pendingTargets.length === 0) return;
    setIsConfirmOpen(false);
    await batch.start(pendingTargets);
  };

  return (
    <div className="mt-4 rounded-lg border border-accent-200 bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <i className="ri-sparkling-line w-5 h-5 flex items-center justify-center text-accent-600"></i>
          <h2 className="text-base font-bold text-foreground-950">
            取り込み済みの商品
            <span className="ml-1.5 text-sm font-medium text-foreground-600">
              {products.length}件
            </span>
          </h2>
        </div>
        {batch.items && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-accent-100 px-3 py-1 text-xs font-bold text-accent-900">
              {batch.isPolling && (
                <i className="ri-loader-4-line w-3.5 h-3.5 animate-spin flex items-center justify-center"></i>
              )}
              {batch.batchStatus
                ? AI_BATCH_STATUS_LABELS[batch.batchStatus]
                : "受付済み"}
            </span>
            <button
              type="button"
              onClick={batch.openResult}
              className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-accent-300 bg-accent-50 px-3 py-1.5 text-xs font-medium text-accent-900 transition-colors hover:bg-accent-100"
            >
              <i className="ri-list-check-2 w-4 h-4 flex items-center justify-center"></i>
              進捗を見る
            </button>
          </div>
        )}
      </div>

      {blockedAiSelectionCount > 0 && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-800">
          <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center shrink-0"></i>
          <span className="min-w-0 flex-1">
            AI解析用に選んだ画像の保存が終わっていない商品が
            {blockedAiSelectionCount}
            件あります。保存できていない選択のまま生成を進めないため、対象から外しています。各商品セットの「AI解析用画像の保存を再試行」で保存してから一括AI生成を実行してください。
          </span>
        </p>
      )}

      {products.length > 0 && (
        <p className="mt-2 text-sm leading-relaxed text-foreground-600">
          下書きとして取り込んだ商品IDです。ここから既存の一括AI生成へ進み、
          商品名・説明・価格などの商品情報を画像から補完できます
          （生成結果は下書きへ自動反映されます）。
        </p>
      )}

      {/* 成功した商品IDの一覧 */}
      {products.length > 0 && (
      <ul className="mt-3 max-h-72 overflow-y-auto rounded-md border border-background-200">
        {products.map((product, index) => (
          <li
            key={product.product_id}
            className="flex items-center gap-3 border-b border-background-200 px-3 py-2 last:border-b-0"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background-100 text-[11px] font-bold text-foreground-700">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground-800">
              {product.product_id}
            </span>
            <Link
              to={`/products/${product.product_id}`}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-background-50 px-2.5 py-1 text-[11px] font-medium text-foreground-700 transition-colors hover:bg-background-100"
            >
              <i className="ri-article-line w-3.5 h-3.5 flex items-center justify-center"></i>
              商品を開く
            </Link>
          </li>
        ))}
      </ul>
      )}

      {/* 20件超は画面で区切る案内 */}
      {isSplit && (
        <p className="mt-3 flex items-start gap-1.5 rounded-md bg-background-100 px-3 py-2 text-[11px] leading-relaxed text-foreground-500">
          <i className="ri-information-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
          <span>
            一括AI生成は一度に最大{MAX_AI_BATCH_SIZE}件までのため、
            {MAX_AI_BATCH_SIZE}件ずつに区切っています。前のグループの完了を待って、順番に実行してください。
          </span>
        </p>
      )}

      {/* グループごとの実行ボタン */}
      <div className="mt-3 flex flex-col gap-2">
        {groups.map((group, groupIndex) => {
          const start = groupIndex * MAX_AI_BATCH_SIZE + 1;
          const end = start + group.length - 1;
          const rangeLabel =
            start === end ? `${start}件目` : `${start}〜${end}件目`;
          return (
            <div
              key={groupIndex}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-background-200 bg-background-50 px-3 py-2.5"
            >
              <span className="text-xs font-medium text-foreground-600">
                {isSplit
                  ? `グループ${groupIndex + 1}（${rangeLabel}・${group.length}件）`
                  : `対象 ${group.length}件`}
              </span>
              <button
                type="button"
                onClick={() => requestGroup(group)}
                disabled={batch.isBusy}
                className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md bg-accent-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {batch.isBusy ? (
                  <>
                    <i className="ri-loader-4-line w-4 h-4 animate-spin flex items-center justify-center"></i>
                    処理中...
                  </>
                ) : (
                  <>
                    <i className="ri-sparkling-line w-4 h-4 flex items-center justify-center"></i>
                    この{group.length}件を一括AI生成
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* 一括AI生成 確認ダイアログ（既存UIを再利用） */}
      <AiBatchConfirmModal
        open={isConfirmOpen}
        count={pendingTargets.length}
        isBusy={batch.isBusy}
        errorMessage={batch.errorMessage}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={confirmStart}
      />

    </div>
  );
}