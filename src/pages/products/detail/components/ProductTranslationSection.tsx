import { useEffect, useState } from "react";
import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
import { syncProductToReadDb } from "@/config/productsApi";
import type {
  ProductTranslation,
  ProductTranslationGenerateResponse,
  ProductTranslationApproveResponse,
} from "../../types";
import SaveStatusMessage from "@/components/base/SaveStatusMessage";
import CollapsibleText from "./CollapsibleText";
import { normalizeDisplayNewlines } from "../lib/format";

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

// バッジの色は「ドメイン」で固定する。翻訳は外部連携と同じグレー系、
// AIが生成した直後（Draft）だけ金（accent）。詳細のステータス列と色を競わせない。
function statusBadge(translation: ProductTranslation | null | undefined): {
  label: string;
  className: string;
} {
  if (!translation) {
    return {
      label: "未生成",
      className: "st-muted",
    };
  }
  if (translation.translation_status === "approved") {
    return {
      label: "承認済み",
      className: "st-link",
    };
  }
  if (translation.translation_status === "draft") {
    // AI が生成した直後の状態。AI の識別色（金）で他の状態と区別する。
    return {
      label: "Draft（確認待ち）",
      className: "tone-ai",
    };
  }
  return {
    label: translation.translation_status,
    className: "st-muted",
  };
}

/**
 * 英語翻訳（English表示）の中身。
 * 独立した管理タブではなく、商品説明セクションの言語切り替えで表示する。
 * 生成・承認の処理は従来のまま変更しない。
 */
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

      const next = data.translation ?? data.save_result?.data ?? null;
      setTranslationData(next);
      if (onTranslationChange) {
        onTranslationChange(next);
      }
      void syncProductToReadDb(productId);
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
        (translationData
          ? { ...translationData, translation_status: "approved" }
          : null);
      setTranslationData(next);
      if (onTranslationChange) {
        onTranslationChange(next);
      }
      void syncProductToReadDb(productId);
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

  // 英語説明は保存データを書き換えず、表示時だけ改行を整える
  const translatedDescription = normalizeDisplayNewlines(
    translationData?.translated_description ?? ""
  );

  return (
    <div>
      {/* 翻訳の状態（ステータス）と承認状態は、既存データの値だけを表示する */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="text-[11px] leading-5 text-foreground-500">英語の商品情報</p>
        <span className={`st-badge ${badge.className}`}>{badge.label}</span>
      </div>

      {translationData ? (
        <div className="mt-2.5 flex flex-col gap-3.5">
          <div>
            <p className="text-[11px] text-foreground-500">英語タイトル</p>
            <p className="mt-0.5 break-words text-[13.5px] font-semibold leading-relaxed text-foreground-900">
              {translationData.translated_title || "—"}
            </p>
          </div>

          {(translationData.translated_condition ||
            translationData.translated_box ||
            translationData.translated_accessories) && (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-md bg-background-50 px-3 py-3 sm:grid-cols-3">
              {translationData.translated_condition && (
                <div className="min-w-0">
                  <dt className="text-[11px] leading-4 text-foreground-500">
                    状態（英語）
                  </dt>
                  <dd className="mt-1 text-[12.5px] font-medium leading-relaxed text-foreground-800">
                    {translationData.translated_condition}
                  </dd>
                </div>
              )}
              {translationData.translated_box && (
                <div className="min-w-0">
                  <dt className="text-[11px] leading-4 text-foreground-500">
                    箱（英語）
                  </dt>
                  <dd className="mt-1 text-[12.5px] font-medium leading-relaxed text-foreground-800">
                    {translationData.translated_box}
                  </dd>
                </div>
              )}
              {translationData.translated_accessories && (
                <div className="min-w-0">
                  <dt className="text-[11px] leading-4 text-foreground-500">
                    付属品（英語）
                  </dt>
                  <dd className="mt-1 text-[12.5px] font-medium leading-relaxed text-foreground-800">
                    {translationData.translated_accessories}
                  </dd>
                </div>
              )}
            </dl>
          )}

          <div>
            <p className="text-[11px] text-foreground-500">英語説明</p>
            {translatedDescription ? (
              <CollapsibleText
                text={translatedDescription}
                collapsedLines={5}
                threshold={160}
                className="mt-1"
              />
            ) : (
              <p className="mt-1 text-[12.5px] leading-relaxed text-foreground-400">
                —
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-background-200 pt-2.5 text-[11.5px] text-foreground-500">
            <span>ロケール：{translationData.locale || "—"}</span>
            <span>
              生成日時：{formatGeneratedAt(translationData.generated_at)}
            </span>
            {status && (
              <span className="font-medium text-foreground-800">
                ステータス：
                {status === "approved" ? "承認済み" : "Draft"}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-2.5">
          <p className="text-[12.5px] leading-relaxed text-foreground-600">
            英語の商品情報は未生成です
          </p>
        </div>
      )}

      {translationData?.translation_status === "draft" && (
        <button
          type="button"
          onClick={handleApprove}
          disabled={approveState === "approving"}
          className="mt-3 inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-primary-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-primary-700 transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {approveState === "approving" ? (
            <>
              <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
              承認中...
            </>
          ) : (
            <>
              <i className="ri-check-double-line w-3.5 h-3.5 flex items-center justify-center"></i>
              承認する
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
          className="mt-3"
          text={message.text}
        />
      )}
    </div>
  );
}