import { useCallback, useRef, useState } from "react";
import {
  MAX_AI_SELECTED_IMAGES,
  createTempProductDraft,
  fetchProductImageSelection,
  generateAiProductDraft,
  updateProductImages,
  type AiProductCandidate,
} from "@/pages/register/lib/aiProduct";
import { saveProductAiSelectedImages } from "@/pages/products/lib/aiBatch";

// idle: 待機中 / saving: 画像保存（アップロード）中 / generating: AI生成中 / error: 失敗
export type AiGeneratePhase = "idle" | "saving" | "generating" | "error";

export function isAiBusy(phase: AiGeneratePhase): boolean {
  return phase === "saving" || phase === "generating";
}

/**
 * 単品AI生成のフローを管理する。
 *  1. 未保存なら画像保存 + 仮draft作成（product_id取得 → 以後保持）
 *  2. 画像が変わった場合は同じ product_id のまま update_product_images で差し替えてから再生成
 *  3. generate_ai_product_draft を呼んで candidate と draft_id / draft_version を取得
 * 再試行・画像変更のどちらでも新規登録POSTは送らない（商品を二重作成しない）。
 */
export function useAiProductGeneration(
  images: File[],
  // AI解析に使う画像（0始まりの画像インデックス、最大3枚）。
  // 未選択（空配列）の場合は従来どおり GAS 側で先頭3枚が使われる。
  selectedAiIndexes: number[] = []
) {
  const [phase, setPhase] = useState<AiGeneratePhase>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [candidate, setCandidate] = useState<AiProductCandidate | null>(null);
  const [draftProductId, setDraftProductId] = useState("");
  const [draftId, setDraftId] = useState("");
  // draft_version は数値で返る想定。返却値をそのまま保持する。
  const [draftVersion, setDraftVersion] = useState<string | number>("");

  // 仮draft作成時に保存した画像セット。配列の参照比較で「画像変更あり」を判定する。
  const draftImageBaselineRef = useRef<File[] | null>(null);

  /**
   * 画像が変わっていれば、同じ product_id のまま既存の画像更新APIで同期する。
   * 仮draft作成直後（baseline=null）は作成時に保存済みなので何もしない。
   * 通常保存（新規POSTを送らない）側からも呼べるように公開する。
   */
  const syncDraftImages = useCallback(
    async (productId: string) => {
      const baseline = draftImageBaselineRef.current;
      if (baseline === null || baseline === images) return;
      await updateProductImages(productId, images);
      draftImageBaselineRef.current = images;
    },
    [images]
  );

  /**
   * 登録中のAI解析用画像の選択を、商品IDと各画像のDrive file_id が確定した後に保存する。
   * IDが解決できない・保存を確認できない場合は例外にし、生成を進めない。
   */
  const persistAiSelection = useCallback(
    async (productId: string) => {
      if (selectedAiIndexes.length === 0) return;
      if (selectedAiIndexes.length > MAX_AI_SELECTED_IMAGES) {
        throw new Error(
          `AI解析に使う画像は最大${MAX_AI_SELECTED_IMAGES}枚です。`
        );
      }
      const snapshot = await fetchProductImageSelection(productId);
      const ids: string[] = [];
      for (const index of selectedAiIndexes) {
        const id = snapshot.fileIds[index] ?? "";
        if (!id) {
          throw new Error(
            "AI解析に使う画像のIDを特定できませんでした。画像を保存し直してから再度お試しください。"
          );
        }
        ids.push(id);
      }
      await saveProductAiSelectedImages({
        productId,
        selectedImageIds: ids,
      });
      // 保存後に再取得して、選択が残っていることを確認する。
      const after = await fetchProductImageSelection(productId);
      if (after.selectedIds !== null) {
        const expected = [...ids].sort().join("|");
        const actual = [...after.selectedIds].sort().join("|");
        if (expected !== actual) {
          throw new Error(
            "AI解析用画像の保存を確認できませんでした。時間をおいて再度お試しください。"
          );
        }
      }
    },
    [selectedAiIndexes]
  );

  const generate = useCallback(async () => {
    if (phase === "saving" || phase === "generating") return;
    if (images.length === 0) {
      setErrorMessage("商品画像を1枚以上追加してください。");
      setPhase("error");
      return;
    }

    setErrorMessage("");
    try {
      let currentProductId = draftProductId;

      if (!currentProductId) {
        // 初回のみ：画像保存 + 商品ID付き仮draft作成
        setPhase("saving");
        currentProductId = await createTempProductDraft(images);
        setDraftProductId(currentProductId);
        draftImageBaselineRef.current = images;
      } else if (draftImageBaselineRef.current !== images) {
        // 同じ商品の画像を差し替える（product_id は再利用、新規商品は作らない）
        setPhase("saving");
        await updateProductImages(currentProductId, images);
        draftImageBaselineRef.current = images;
      }

      // 画像の保存（＝Drive file_id の確定）後に、AI解析用の選択を保存する。
      await persistAiSelection(currentProductId);

      setPhase("generating");
      const generation = await generateAiProductDraft(currentProductId);
      // 生成応答の product_id も保持する（以後の再試行・確定保存で再利用）
      if (generation.productId) setDraftProductId(generation.productId);
      setCandidate(generation.candidate);
      setDraftId(generation.draftId);
      setDraftVersion(generation.draftVersion);
      setPhase("idle");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "AI生成に失敗しました。"
      );
      setPhase("error");
    }
  }, [images, phase, draftProductId, persistAiSelection]);

  const updateCandidate = useCallback((patch: Partial<AiProductCandidate>) => {
    setCandidate((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  // 候補だけを破棄する（仮draftの product_id / draft_id は保持し、再試行や通常保存で再利用する）
  const discardCandidate = useCallback(() => {
    setCandidate(null);
    setErrorMessage("");
    setPhase("idle");
  }, []);

  // AI関連の状態を完全初期化する（確定完了後やフォームリセット時）
  const reset = useCallback(() => {
    setPhase("idle");
    setErrorMessage("");
    setCandidate(null);
    setDraftProductId("");
    setDraftId("");
    setDraftVersion("");
    draftImageBaselineRef.current = null;
  }, []);

  return {
    phase,
    errorMessage,
    candidate,
    draftProductId,
    draftId,
    draftVersion,
    generate,
    syncDraftImages,
    updateCandidate,
    discardCandidate,
    reset,
  };
}