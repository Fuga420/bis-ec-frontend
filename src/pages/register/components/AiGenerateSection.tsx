import {
  AI_ANALYSIS_IMAGE_COUNT,
  MAX_PRODUCT_IMAGES,
} from "@/pages/register/lib/aiProduct";
import type { AiGeneratePhase } from "@/pages/register/hooks/useAiProductGeneration";
import { isAiBusy } from "@/pages/register/hooks/useAiProductGeneration";

interface AiGenerateSectionProps {
  imageCount: number;
  phase: AiGeneratePhase;
  errorMessage: string;
  // 登録処理中など、外部要因でも無効化したいとき
  disabled?: boolean;
  draftCreated: boolean;
  onGenerate: () => void;
}

export default function AiGenerateSection({
  imageCount,
  phase,
  errorMessage,
  disabled = false,
  draftCreated,
  onGenerate,
}: AiGenerateSectionProps) {
  const busy = isAiBusy(phase);
  const noImage = imageCount === 0;
  const isDisabled = busy || noImage || disabled;
  const usedCount = Math.min(imageCount, AI_ANALYSIS_IMAGE_COUNT);

  return (
    <div className="rounded-lg border border-background-200 bg-white p-3 md:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground-950">
            <i className="ri-sparkling-line w-4 h-4 flex items-center justify-center text-primary-600"></i>
            画像からAIで商品情報を生成
          </p>
          <p className="mt-1 text-xs leading-relaxed text-foreground-500">
            {noImage
              ? "先に商品画像を追加してください。"
              : `画面の並び順で先頭 ${usedCount} 枚（最大${AI_ANALYSIS_IMAGE_COUNT}枚 / 全${MAX_PRODUCT_IMAGES}枚まで保持）を使用して解析します。`}
          </p>
        </div>

        <button
          type="button"
          onClick={onGenerate}
          disabled={isDisabled}
          className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <>
              <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
              {phase === "saving" ? "画像を保存中..." : "生成中..."}
            </>
          ) : (
            <>
              <i className="ri-sparkling-line w-4 h-4 flex items-center justify-center"></i>
              AIで商品情報を生成
            </>
          )}
        </button>
      </div>

      {busy && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-background-100 px-3 py-2">
          <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center text-primary-600"></i>
          <span className="text-xs font-medium text-foreground-700">
            {phase === "saving"
              ? "画像を保存し、商品ID付きの仮draftを作成しています..."
              : "画像を解析して商品情報を生成しています..."}
          </span>
        </div>
      )}

      {draftCreated && phase !== "error" && (
        <p className="mt-2 text-[11px] text-foreground-400">
          仮draft作成済みです。生成結果を確認してから登録してください。
        </p>
      )}

      {phase === "error" && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2">
          <p className="flex items-start gap-1.5 text-xs font-medium text-red-700">
            <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
            <span className="min-w-0 flex-1 break-words">
              {errorMessage || "AI生成に失敗しました。"}
            </span>
          </p>
          <p className="text-[11px] text-foreground-500">
            入力中の内容と画像は保持されています。
          </p>
          <button
            type="button"
            onClick={onGenerate}
            disabled={disabled}
            className="inline-flex w-fit cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
            再実行する
          </button>
        </div>
      )}
    </div>
  );
}