import { useEffect, useState } from "react";
import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
import type {
  ProductTranslation,
  ProductTranslationGenerateResponse,
  ProductTranslationApproveResponse,
} from "../../types";
import SaveStatusMessage from "@/components/base/SaveStatusMessage";

type SyncState = "idle" | "generating" | "success" | "error";
type ApproveState = "idle" | "approving";

type TranslationStatus = "draft" | "approved";

function formatGeneratedAt(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(translation: ProductTranslation | null | undefined): {
  label: string;
  className: string;
} {
  if (!translation) {
    return {
      label: "未生成",
      className: "bg-foreground-100 text-foreground-600",
    };
  }
  if (translation.translation_status === "approved") {
    return {
      label: "承認済み",
      className: "bg-primary-100 text-primary-700",
    };
  }
  if (translation.translation_status === "draft") {
    return {
      label: "Draft（確認待ち）",
      className: "bg-accent-100 text-accent-900",
    };
  }
  return {
    label: translation.translation_status,
    className: "bg-foreground-100 text-foreground-600",
  };
}

export default function ProductTranslationSection({
  productId,
  translation,
  onTranslationChange,
}: {
  productId: string;
  translation: ProductTranslation | null | undefined;
  onTranslationChange?: (translation: ProductTranslation | null) => void;
}) {
  const [translationData, setTranslationData] = useState<
    ProductTranslation | null
  >(translation ?? null);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [approveState, setApproveState] = useState<ApproveState>("idle");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setTranslationData(translation ?? null);
  }, [translation]);

  // 英語翻訳の生成処理自体は残しています（画面からの個別生成ボタンは撤去済み）。
  // 自動生成など別経路で呼び出す場合にそのまま利用できます。
  const handleGenerate = async () => {
    if (!productId || syncState === "generating") return;

    setSyncState("generating");
    setMessage(null);

    try {
      const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "generate_translation",
          product_id: productId,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as ProductTranslationGenerateResponse;
      if (!data || data.success !== true) {
        throw new Error(data?.error ?? "Invalid response");
      }

      const next =
        data.translation ?? data.save_result?.data ?? null;
      setTranslationData(next);
      if (onTranslationChange) {
        onTranslationChange(next);
      }
      setMessage({
        type: "success",
        text: "英語説明を生成しました",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: "英語説明の生成に失敗しました",
      });
      // 開発時に確認できるよう、APIのerror内容をコンソールに保持
      console.error("generate_translation failed:", err);
    } finally {
      setSyncState("idle");
    }
  };

  const handleApprove = async () => {
    if (!productId || approveState === "approving") return;
    if (translationData?.translation_status !== "draft") return;

    setApproveState("approving");
    setMessage(null);

    try {
      const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "approve_translation",
          product_id: productId,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as ProductTranslationApproveResponse;
      if (!data || data.success !== true) {
        throw new Error(data?.error ?? "Invalid response");
      }

      const next =
        data.translation ??
        data.save_result?.data ??
        (translationData ? { ...translationData, translation_status: "approved" } : null);
      setTranslationData(next);
      if (onTranslationChange) {
        onTranslationChange(next);
      }
      setMessage({
        type: "success",
        text: "英語翻訳を承認しました",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: "英語翻訳の承認に失敗しました",
      });
      console.error("approve_translation failed:", err);
    } finally {
      setApproveState("idle");
    }
  };

  const badge = statusBadge(translationData);
  const status: TranslationStatus | null =
    translationData?.translation_status === "approved" ||
    translationData?.translation_status === "draft"
      ? translationData.translation_status
      : null;

  return (
    <div className="rounded-[10px] border border-background-200 bg-white p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-foreground-950">
            英語翻訳
          </h2>
          <p className="mt-1 text-xs text-foreground-500">
            越境EC向けに英語の商品説明を生成します
          </p>
        </div>
        <span
          className={`inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-md px-2 text-[11px] font-medium leading-none ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      {translationData ? (
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <p className="text-xs font-medium text-foreground-500">
              英語タイトル
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground-900">
              {translationData.translated_title || "—"}
            </p>
          </div>
          {(translationData.translated_condition ||
            translationData.translated_box ||
            translationData.translated_accessories) && (
            <div className="flex flex-wrap gap-2">
              {translationData.translated_condition && (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-background-200 bg-background-50 px-2.5 py-1 text-xs text-foreground-700">
                  <span className="font-medium text-foreground-400">Condition:</span>
                  {translationData.translated_condition}
                </span>
              )}
              {translationData.translated_box && (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-background-200 bg-background-50 px-2.5 py-1 text-xs text-foreground-700">
                  <span className="font-medium text-foreground-400">Box:</span>
                  {translationData.translated_box}
                </span>
              )}
              {translationData.translated_accessories && (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-background-200 bg-background-50 px-2.5 py-1 text-xs text-foreground-700">
                  <span className="font-medium text-foreground-400">Accessories:</span>
                  {translationData.translated_accessories}
                </span>
              )}
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-foreground-500">
              英語説明
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground-700">
              {translationData.translated_description || "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-background-100 pt-3 text-xs text-foreground-400">
            <span>ロケール：{translationData.locale || "—"}</span>
            <span>生成日時：{formatGeneratedAt(translationData.generated_at)}</span>
            {status && (
              <span className="font-medium text-foreground-500">
                ステータス：
                {status === "approved" ? "承認済み" : "Draft"}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-background-300 bg-background-50 px-3 py-6 text-center">
          <p className="text-sm text-foreground-500">
            まだ英語翻訳が生成されていません
          </p>
        </div>
      )}

      {translationData?.translation_status === "draft" && (
        <button
          type="button"
          onClick={handleApprove}
          disabled={approveState === "approving"}
          className="mt-4 inline-flex min-w-[148px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-background-50 transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {approveState === "approving" ? (
            <>
              <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
              承認中...
            </>
          ) : (
            <>
              <i className="ri-check-double-line w-4 h-4 flex items-center justify-center"></i>
              承認する（Approve）
            </>
          )}
        </button>
      )}

      {syncState === "generating" && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-background-100"></div>
          <div className="h-3 w-full animate-pulse rounded bg-background-100"></div>
          <div className="h-3 w-2/3 animate-pulse rounded bg-background-100"></div>
        </div>
      )}

      {message && (
        <SaveStatusMessage
          tone={message.type === "success" ? "success" : "error"}
          text={message.text}
          className="mt-3"
        />
      )}
    </div>
  );
}