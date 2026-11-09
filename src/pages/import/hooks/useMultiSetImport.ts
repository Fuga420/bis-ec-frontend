import { useCallback, useRef, useState } from "react";
import { MAX_AI_ANALYSIS_IMAGES } from "@/pages/products/lib/aiBatch";
import { saveImportAiSelection } from "@/pages/import/lib/aiImageSelection";
import {
  autoLinkProductByItemNumber,
  type AutoLinkResult,
} from "@/pages/documents/lib/productAutoLink";
import {
  IMPORT_MAX_IMAGES,
  IMPORT_MIN_IMAGES,
  buildImagePayload,
  createImportAttemptId,
  importProductByImages,
  sameAuctionNumber,
  sameFiles,
  type ImportImagePayload,
} from "@/pages/import/lib/multiImport";

export type ImportSetStatus =
  | "idle"
  | "processing"
  | "success"
  | "error"
  | "unknown";

// AI解析用に選んだ画像（最大3枚）の保存状況。
// none: 未選択（先頭3枚を使用）/ saving: 保存中 / saved: 保存済み / error: 保存失敗
export type AiSelectionStatus = "none" | "saving" | "saved" | "error";

export interface ImportSet {
  id: string;
  // 画面で確定した順序の画像（先頭がメイン画像）。
  images: File[];
  // AI解析に使う画像として選んだ File（images 内の参照）。空なら先頭3枚。
  aiSelectedFiles: File[];
  aiSelectionStatus: AiSelectionStatus;
  aiSelectionError: string | null;
  // 保存した（または保存を要求した）Drive の file_id
  aiSelectedFileIds: string[];
  status: ImportSetStatus;
  // 仕入台帳の商品番号（任意入力）。文字列として保持し、先頭ゼロ・ハイフンを保つ。
  auctionItemNumber: string;
  // 送信に使った（使う）import_attempt_id。
  attemptId: string | null;
  // attemptId を発行したときの画像配列。編集検知＝attemptId の再利用可否の判定に使う。
  attemptFiles: File[] | null;
  // attemptId で送信したときの仕入台帳の商品番号。再送時に同じ値を送るために保持する。
  attemptAuctionNumber: string | null;
  // 「受付済みか不明」のセットで保持する、送信済みの完全なペイロード。
  // 同一ID・同一内容での再送に使う（再送前に編集させない）。
  retainedPayload: ImportImagePayload[] | null;
  // success:false のセットで内容を変更し、「新しい import_attempt_id」で取り込むことを
  // スタッフが明示承認したときの画像配列。現在の画像と一致するときだけ承認が有効
  // （＝編集すると承認は自動で無効になり、再確認が必要）。
  newIdAckFiles: File[] | null;
  productId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  // 仕入台帳の商品番号による自動照合の結果（未実行・無効時は null）。
  // 商品登録の成否とは独立して表示する（照合だけが未完了のケースを混同しない）。
  autoLink: AutoLinkResult | null;
}

let setSeq = 0;
function createSetId(): string {
  setSeq += 1;
  return `set-${Date.now()}-${setSeq}`;
}

function emptySet(): ImportSet {
  return {
    id: createSetId(),
    images: [],
    aiSelectedFiles: [],
    aiSelectionStatus: "none",
    aiSelectionError: null,
    aiSelectedFileIds: [],
    auctionItemNumber: "",
    status: "idle",
    attemptId: null,
    attemptFiles: null,
    attemptAuctionNumber: null,
    retainedPayload: null,
    newIdAckFiles: null,
    productId: null,
    errorCode: null,
    errorMessage: null,
    autoLink: null,
  };
}

/**
 * 複数の「商品セット（1商品＝画像1〜20枚）」を管理し、まとめて逐次取り込む。
 *
 * 方針（契約準拠）:
 * - 1セットにつき POST 1回。複数セットは必ず逐次送信（前の応答を待ってから次へ）。
 * - 成功したセットは再送しない。
 * - 受付済みか不明なセットは、保持した同一ペイロード・同一 import_attempt_id で再送できる。
 * - 状態はメモリ上のみで保持する（ページ再読込で復元されない。新しいIDでの自動再送も行わない）。
 */
export function useMultiSetImport() {
  const [sets, setSets] = useState<ImportSet[]>(() => [emptySet()]);
  const setsRef = useRef<ImportSet[]>(sets);
  const [isImporting, setIsImporting] = useState(false);
  const importingRef = useRef(false);

  // ref を正本にしつつ state へ反映する（逐次処理中も常に最新を参照できるようにする）。
  const commit = useCallback((next: ImportSet[]) => {
    setsRef.current = next;
    setSets(next);
  }, []);

  const updateSet = useCallback(
    (id: string, updater: (s: ImportSet) => ImportSet) => {
      commit(setsRef.current.map((s) => (s.id === id ? updater(s) : s)));
    },
    [commit]
  );

  const addSet = useCallback(() => {
    commit([...setsRef.current, emptySet()]);
  }, [commit]);

  const removeSet = useCallback(
    (id: string) => {
      const target = setsRef.current.find((s) => s.id === id);
      if (!target || target.status === "processing") return;
      const next = setsRef.current.filter((s) => s.id !== id);
      commit(next.length > 0 ? next : [emptySet()]);
    },
    [commit]
  );

  const setImages = useCallback(
    (id: string, files: File[]) => {
      updateSet(id, (s) => ({
        ...s,
        images: files,
        // 削除した画像は AI 解析用の選択からも外す（残った画像の順序は変えない）。
        aiSelectedFiles: s.aiSelectedFiles.filter((f) => files.includes(f)),
      }));
    },
    [updateSet]
  );

  // AI解析に使う画像（最大3枚）の選択切り替え。並び順やメイン画像は変えない。
  const toggleAiImage = useCallback(
    (id: string, file: File) => {
      updateSet(id, (s) => {
        if (!s.images.includes(file)) return s;
        if (s.status === "processing" || s.status === "success") return s;
        const already = s.aiSelectedFiles.includes(file);
        if (already) {
          return {
            ...s,
            aiSelectedFiles: s.aiSelectedFiles.filter((f) => f !== file),
            aiSelectionStatus: "none" as AiSelectionStatus,
            aiSelectionError: null,
            aiSelectedFileIds: [],
          };
        }
        if (s.aiSelectedFiles.length >= MAX_AI_ANALYSIS_IMAGES) return s;
        return {
          ...s,
          aiSelectedFiles: [...s.aiSelectedFiles, file],
          aiSelectionStatus: "none" as AiSelectionStatus,
          aiSelectionError: null,
        };
      });
    },
    [updateSet]
  );

  // 選択したAI解析用画像を保存し、再取得で確認する（成功を断定できない場合はエラー）。
  const persistAiSelection = useCallback(
    async (id: string, productId: string, files: File[], selected: File[]) => {
      updateSet(id, (s) => ({
        ...s,
        aiSelectionStatus: "saving",
        aiSelectionError: null,
      }));
      const result = await saveImportAiSelection({
        productId,
        images: files,
        selectedFiles: selected,
      });
      updateSet(id, (s) => ({
        ...s,
        aiSelectionStatus: result.ok ? "saved" : "error",
        aiSelectionError: result.ok ? null : result.message ?? "AI解析用の画像の保存に失敗しました。",
        aiSelectedFileIds: result.selectedIds,
      }));
    },
    [updateSet]
  );

  // AI解析用画像の保存だけを再試行する（商品は既に作成済みなので再取り込みはしない）。
  const retryAiSelection = useCallback(
    async (id: string) => {
      const set = setsRef.current.find((s) => s.id === id);
      if (!set || !set.productId) return;
      if (set.aiSelectedFiles.length === 0) return;
      await persistAiSelection(id, set.productId, set.images, set.aiSelectedFiles);
    },
    [persistAiSelection]
  );

  // 仕入台帳の商品番号（任意入力）の変更。文字列のまま保持する（数値変換しない）。
  const setAuctionItemNumber = useCallback(
    (id: string, value: string) => {
      updateSet(id, (s) => {
        if (s.status === "processing" || s.status === "success") return s;
        if (s.status === "unknown") return s;
        return { ...s, auctionItemNumber: value };
      });
    },
    [updateSet]
  );

  // 画像と仕入台帳の商品番号の両方が送信時と同じか（同一IDでの再送可否の判定）。
  const isAttemptContentSame = useCallback(
    (s: ImportSet) =>
      sameFiles(s.attemptFiles, s.images) &&
      sameAuctionNumber(s.attemptAuctionNumber, s.auctionItemNumber),
    []
  );

  const moveImage = useCallback(
    (id: string, index: number, direction: -1 | 1) => {
      updateSet(id, (s) => {
        const target = index + direction;
        if (target < 0 || target >= s.images.length) return s;
        const next = [...s.images];
        const [moved] = next.splice(index, 1);
        next.splice(target, 0, moved);
        return { ...s, images: next };
      });
    },
    [updateSet]
  );

  const setMainImage = useCallback(
    (id: string, index: number) => {
      updateSet(id, (s) => {
        if (index <= 0 || index >= s.images.length) return s;
        const next = [...s.images];
        const [moved] = next.splice(index, 1);
        next.unshift(moved);
        return { ...s, images: next };
      });
    },
    [updateSet]
  );

  // success:false のセットで内容を変更した後、「前回の取込結果を確認した」という
  // スタッフの明示承認を記録する（承認時点の画像を保持し、編集で自動的に無効化する）。
  const acknowledgeNewId = useCallback(
    (id: string, acknowledged: boolean) => {
      updateSet(id, (s) => ({
        ...s,
        newIdAckFiles: acknowledged ? s.images : null,
      }));
    },
    [updateSet]
  );

  // 実際の送信と、結果に応じた状態更新。
  const sendSet = useCallback(
    async (
      id: string,
      attemptId: string,
      payload: ImportImagePayload[],
      files: File[],
      aiSelected: File[],
      auctionItemNumber: string
    ) => {
      updateSet(id, (s) => ({
        ...s,
        status: "processing",
        attemptId,
        attemptAuctionNumber: auctionItemNumber,
        errorCode: null,
        errorMessage: null,
      }));

      const result = await importProductByImages({
        importAttemptId: attemptId,
        images: payload,
        auctionItemNumber,
      });

      if (result.kind === "success") {
        updateSet(id, (s) => ({
          ...s,
          status: "success",
          productId: result.productId,
          errorCode: null,
          errorMessage: null,
          retainedPayload: null,
          newIdAckFiles: null,
        }));

        // 商品IDが確定し、仕入台帳の商品番号が入力されているときだけ自動照合を試みる。
        // 照合の結果は商品登録の成否とは別に保持する（失敗しても登録は成功のまま）。
        if (result.productId && auctionItemNumber !== "") {
          const autoLink = await autoLinkProductByItemNumber({
            productId: result.productId,
            auctionItemNumber,
          });
          updateSet(id, (s) => ({
            ...s,
            autoLink: autoLink.status === "disabled" ? null : autoLink,
          }));
        }
        // 商品IDが発行されたので、選んだAI解析用画像を Drive の file_id で保存する。
        // 保存に失敗した場合は「保存できた」ように扱わず、AI生成の対象から外す。
        if (result.productId && aiSelected.length > 0) {
          await persistAiSelection(id, result.productId, files, aiSelected);
        }
      } else if (result.kind === "rejected") {
        // 応答本文 success:false を明示。ただし Drive 保存や本票書込みの「途中」で失敗した
        // 可能性があり、受付済みか判断できないケースがある。送信時のペイロードと
        // import_attempt_id を保持しておき、再試行時は（内容が変わっていなければ）
        // 新IDを発行せず、保存した同一ペイロード・同一IDで再送できるようにする。
        updateSet(id, (s) => ({
          ...s,
          status: "error",
          errorCode: result.errorCode || null,
          errorMessage: result.message,
          retainedPayload: payload,
        }));
      } else {
        // 受付済みか不明。ペイロードとIDを保持し、同じ内容での再送だけを許可する。
        updateSet(id, (s) => ({
          ...s,
          status: "unknown",
          errorCode: null,
          errorMessage: result.message,
          retainedPayload: payload,
        }));
      }
    },
    [persistAiSelection, updateSet]
  );

  // 1セットを（必要なら再送として）処理する。
  const runSet = useCallback(
    async (id: string) => {
      const set = setsRef.current.find((s) => s.id === id);
      if (!set) return;
      if (set.status === "success" || set.status === "processing") return;

      // 受付状況が不明（unknown）、または success:false だが「Drive保存・本票書込みの
      // 途中で失敗した可能性がある」（error）セットは、送信時のペイロードと ID を保持している。
      const hadAttempt =
        set.retainedPayload !== null && set.attemptId !== null;
      const contentUnchanged = isAttemptContentSame(set);

      // 内容が送信時と完全に同一なら、保存済みの同一ペイロード・同一 import_attempt_id で
      // 再送する（冪等・重複しない）。内容が変わっていなければ新IDは発行しない。
      if (
        hadAttempt &&
        (set.status === "unknown" || set.status === "error") &&
        contentUnchanged
      ) {
        await sendSet(
          id,
          set.attemptId as string,
          set.retainedPayload as ImportImagePayload[],
          set.images,
          set.aiSelectedFiles,
          set.attemptAuctionNumber ?? ""
        );
        return;
      }

      // 受付状況が不明なセットは、内容が変わると同一IDで再送できない
      // （編集ロックしているため通常は起きないが、安全側で再送しない）。
      if (set.status === "unknown") return;

      // success:false のセットで内容を変更した場合、取り込みは必ず「新しい
      // import_attempt_id」で行われる。前回の試行で商品が作成されている可能性があり、
      // 新IDでの取り込みは重複登録につながる恐れがあるため、
      // スタッフが「前回の取込結果を確認した」と明示承認した場合のみ実行する。
      // （自動での新規取り込み・自動新ID再送は行わない。）
      if (set.status === "error" && hadAttempt && !contentUnchanged) {
        const acknowledged = sameFiles(set.newIdAckFiles, set.images);
        if (!acknowledged) return;
      }

      if (set.images.length < IMPORT_MIN_IMAGES) return; // 画像なしは対象外
      if (set.images.length > IMPORT_MAX_IMAGES) {
        updateSet(id, (s) => ({
          ...s,
          status: "error",
          errorCode: "TOO_MANY_IMAGES",
          errorMessage: `1セットに取り込める画像は最大${IMPORT_MAX_IMAGES}枚です。`,
        }));
        return;
      }

      updateSet(id, (s) => ({
        ...s,
        status: "processing",
        errorCode: null,
        errorMessage: null,
      }));

      let payload: ImportImagePayload[];
      try {
        payload = await buildImagePayload(set.images);
      } catch {
        updateSet(id, (s) => ({
          ...s,
          status: "error",
          errorCode: "LOCAL_READ_ERROR",
          errorMessage:
            "画像の読み込みに失敗しました。画像を選び直してください。",
        }));
        return;
      }

      // 内容が前回と完全に同一のときだけ attempt_id を再利用する。
      // 1文字でも変わっていれば新しい attempt_id を発行する（契約の指紋照合に合わせる）。
      const auctionItemNumber = set.auctionItemNumber.trim();
      const reuse = set.attemptId !== null && isAttemptContentSame(set);
      const attemptId =
        reuse && set.attemptId ? set.attemptId : createImportAttemptId();
      updateSet(id, (s) => ({
        ...s,
        attemptFiles: s.images,
        attemptAuctionNumber: auctionItemNumber,
        newIdAckFiles: null,
      }));

      await sendSet(
        id,
        attemptId,
        payload,
        set.images,
        set.aiSelectedFiles,
        auctionItemNumber
      );
    },
    [isAttemptContentSame, sendSet, updateSet]
  );

  const importAll = useCallback(async () => {
    if (importingRef.current) return;
    // 受付不明（unknown）のセットは「まとめて取り込む」に巻き込まず、
    // セット単位の「同じ内容で再送」で明示的に扱う（誤操作を避ける）。
    const targets = setsRef.current.filter(
      (s) =>
        s.status !== "success" &&
        s.status !== "unknown" &&
        s.images.length > 0
    );
    if (targets.length === 0) return;

    importingRef.current = true;
    setIsImporting(true);
    // 逐次送信：必ず前のセットの応答を待ってから次へ進む（並列・一括配列はしない）。
    for (const t of targets) {
      await runSet(t.id);
    }
    importingRef.current = false;
    setIsImporting(false);
  }, [runSet]);

  // セット単位の再送。
  // - unknown / success:false（保留）: 保存した同一ペイロード・同一 import_attempt_id で再送
  // - error（内容変更後）: 新しい import_attempt_id を発行して再取り込み
  const resendSet = useCallback(
    async (id: string) => {
      if (importingRef.current) return;
      importingRef.current = true;
      setIsImporting(true);
      await runSet(id);
      importingRef.current = false;
      setIsImporting(false);
    },
    [runSet]
  );

  const resetAll = useCallback(() => {
    if (importingRef.current) return;
    commit([emptySet()]);
  }, [commit]);

  const hasImportableSet = sets.some(
    (s) =>
      s.images.length > 0 && s.status !== "success" && s.status !== "unknown"
  );

  const summary = {
    total: sets.filter((s) => s.images.length > 0).length,
    success: sets.filter((s) => s.status === "success").length,
    error: sets.filter((s) => s.status === "error").length,
    unknown: sets.filter((s) => s.status === "unknown").length,
  };

  // 商品登録の結果とは別に、書類添付の結果を集計する。

  return {
    sets,
    isImporting,
    hasImportableSet,
    summary,
    addSet,
    removeSet,
    setImages,
    setAuctionItemNumber,
    moveImage,
    setMainImage,
    toggleAiImage,
    retryAiSelection,
    acknowledgeNewId,
    importAll,
    resendSet,
    resetAll,
  };
}