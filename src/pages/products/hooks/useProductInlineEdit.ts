import { useCallback, useState } from "react";
import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
import type { AdminProduct, ProductUpdateResponse } from "../types";
import {
  buildInlineEditInitialDraft,
  computeInlineEditChanges,
  type InlineEditDraft,
} from "../lib/inlineEdit";

// バックエンドが返す安全なエラー理由を表示用に整形する（汎用文で隠さない）。
function extractError(
  data: { error?: string; message?: string; error_code?: string } | null,
  fallback: string
): string {
  if (!data) return fallback;
  const message = (data.message ?? data.error ?? "").toString().trim();
  const code = (data.error_code ?? "").toString().trim();
  if (message && code) return `${message}（コード: ${code}）`;
  if (message) return message;
  if (code) return `${fallback}（コード: ${code}）`;
  return fallback;
}

interface UseProductInlineEditParams {
  // 保存（成功・失敗どちらでも）後に一覧を再取得するためのコールバック。
  // サーバーの実際の保存値と状態を表示するために使う。
  onSaved: () => void;
}

// 一覧のインライン編集（下書きの「一覧に表示するタイトル」「販売予定価格」のみ）。
//
// - 既存の update_product へ「変更項目だけ」を送る部分更新（未変更項目は送らない）。
// - 価格変更時の Square 同期は GAS の既存処理に任せ、フロントからは重複して呼ばない。
// - 成功・失敗いずれも一覧を再取得し、実際の保存値を表示する。
//   失敗時は入力を破棄（元の値に戻す）し、理由を該当行に表示し続ける。
export function useProductInlineEdit({ onSaved }: UseProductInlineEditParams) {
  // 同時に編集できる行は1行だけ（編集中の商品IDで管理）。
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InlineEditDraft>({ title: "", price: "" });
  const [savingId, setSavingId] = useState<string | null>(null);
  // 商品ID単位のエラー理由（保存失敗・バリデーション）。再取得後も該当行に表示し続ける。
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearError = useCallback((productId: string) => {
    setErrors((prev) => {
      if (!(productId in prev)) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, []);

  const startEdit = useCallback(
    (product: AdminProduct) => {
      clearError(product.product_id);
      setDraft(buildInlineEditInitialDraft(product));
      setEditingId(product.product_id);
    },
    [clearError]
  );

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const updateDraft = useCallback((patch: Partial<InlineEditDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const save = useCallback(
    async (product: AdminProduct) => {
      if (savingId === product.product_id) return;

      const { payload, changed, error } = computeInlineEditChanges(
        product,
        draft
      );
      if (error) {
        setErrors((prev) => ({ ...prev, [product.product_id]: error }));
        return;
      }
      if (!changed) {
        setErrors((prev) => ({
          ...prev,
          [product.product_id]: "変更がありません",
        }));
        return;
      }

      setSavingId(product.product_id);
      try {
        const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "update_product",
            product_id: product.product_id,
            ...payload,
          }),
        });
        let data: ProductUpdateResponse | null = null;
        try {
          data = (await response.json()) as ProductUpdateResponse;
        } catch {
          data = null;
        }
        if (!response.ok || !data || data.success !== true) {
          throw new Error(extractError(data, "商品情報の更新に失敗しました"));
        }

        // 成功: 該当行のエラーを消し、編集モードを閉じ、一覧を再取得する。
        clearError(product.product_id);
        setEditingId(null);
        onSaved();
      } catch (err) {
        // 失敗: 入力を破棄（元の値に戻す）し、再取得して実際の保存状態と理由を表示する。
        setErrors((prev) => ({
          ...prev,
          [product.product_id]:
            err instanceof Error && err.message
              ? err.message
              : "商品情報の更新に失敗しました",
        }));
        setEditingId(null);
        onSaved();
      } finally {
        setSavingId(null);
      }
    },
    [clearError, draft, onSaved, savingId]
  );

  return {
    editingId,
    draft,
    savingId,
    errors,
    startEdit,
    cancelEdit,
    updateDraft,
    save,
  };
}