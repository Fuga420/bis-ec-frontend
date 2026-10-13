import { useCallback, useRef, useState } from "react";
import {
  IMPORT_MAX_IMAGES,
  IMPORT_MIN_IMAGES,
  buildImagePayload,
  createImportAttemptId,
  importProductByImages,
  sameFiles,
  type ImportImagePayload,
} from "@/pages/import/lib/multiImport";
import {
  attachProductDocument,
  createDocumentIdempotencyKey,
  type AttachedDocument,
  type DocumentAttachStatus,
} from "@/pages/import/lib/productDocument";

export type ImportSetStatus =
  | "idle"
  | "processing"
  | "success"
  | "error"
  | "unknown";

export interface ImportSet {
  id: string;
  // 画面で確定した順序の画像（先頭がメイン画像）。
  images: File[];
  status: ImportSetStatus;
  // 送信に使った（使う）import_attempt_id。
  attemptId: string | null;
  // attemptId を発行したときの画像配列。編集検知＝attemptId の再利用可否の判定に使う。
  attemptFiles: File[] | null;
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
  // --- 書類（請求書・領収書）: 画像取込とは独立に管理する（任意・MVPは1件） ---
  // 選択した書類ファイル（PDF / JPG / PNG・1件）。
  document: File | null;
  // 書類添付の状態（商品登録の status とは別）。
  documentStatus: DocumentAttachStatus;
  // 書類用の再送識別子。再送時は同じIDを再利用して冪等にする。
  documentAttemptId: string | null;
  // 添付済み（または競合時に既存）の書類情報。
  documentResult: AttachedDocument | null;
  documentErrorCode: string | null;
  documentErrorMessage: string | null;
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
    status: "idle",
    attemptId: null,
    attemptFiles: null,
    retainedPayload: null,
    newIdAckFiles: null,
    productId: null,
    errorCode: null,
    errorMessage: null,
    document: null,
    documentStatus: "idle",
    documentAttemptId: null,
    documentResult: null,
    documentErrorCode: null,
    documentErrorMessage: null,
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
      updateSet(id, (s) => ({ ...s, images: files }));
    },
    [updateSet]
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

  // 書類ファイルをセットに設定する（null で解除）。
  // 添付中・添付済み・競合時は変更させない（上書き防止）。
  const setDocument = useCallback(
    (id: string, file: File | null) => {
      updateSet(id, (s) => {
        if (
          s.documentStatus === "attaching" ||
          s.documentStatus === "attached" ||
          s.documentStatus === "conflict"
        ) {
          return s;
        }
        return {
          ...s,
          document: file,
          documentStatus: "idle",
          documentAttemptId: null,
          documentResult: null,
          documentErrorCode: null,
          documentErrorMessage: null,
        };
      });
    },
    [updateSet]
  );

  // 選択した書類を、画像取込で得た同じ product_id へ「書類だけ」送信する。
  // 商品の再登録は行わない（画像取込とは別リクエスト・別識別子）。
  // 再送時は同じ idempotency_key を再利用する（冪等）。
  const attachDocument = useCallback(
    async (id: string) => {
      const set = setsRef.current.find((s) => s.id === id);
      if (!set || !set.document || !set.productId) return;
      if (set.documentStatus === "attaching") return;
      // 添付済み・競合は上書きしない。
      if (
        set.documentStatus === "attached" ||
        set.documentStatus === "conflict"
      ) {
        return;
      }

      const attemptId =
        set.documentAttemptId ?? createDocumentIdempotencyKey();
      updateSet(id, (s) => ({
        ...s,
        documentStatus: "attaching",
        documentAttemptId: attemptId,
        documentErrorCode: null,
        documentErrorMessage: null,
      }));

      const result = await attachProductDocument({
        productId: set.productId as string,
        idempotencyKey: attemptId,
        // 取込画面には書類種別の選択がないため、請求書を既定として送る。
        documentType: "invoice",
        file: set.document as File,
      });

      if (result.kind === "success") {
        updateSet(id, (s) => ({
          ...s,
          documentStatus: "attached",
          documentResult: result.document,
          documentErrorCode: null,
          documentErrorMessage: null,
        }));
      } else if (result.kind === "conflict") {
        // 別の書類が既に添付済み。勝手に上書きせず、競合として表示する。
        updateSet(id, (s) => ({
          ...s,
          documentStatus: "conflict",
          documentResult: result.existing,
          documentErrorCode: "DOCUMENT_ALREADY_ATTACHED",
          documentErrorMessage: result.message,
        }));
      } else if (result.kind === "rejected") {
        updateSet(id, (s) => ({
          ...s,
          documentStatus: "error",
          documentErrorCode: result.errorCode || null,
          documentErrorMessage: result.message,
        }));
      } else {
        updateSet(id, (s) => ({
          ...s,
          documentStatus: "unknown",
          documentErrorCode: null,
          documentErrorMessage: result.message,
        }));
      }
    },
    [updateSet]
  );

  // 書類のみ再送（商品は再登録しない）。
  const resendDocument = useCallback(
    async (id: string) => {
      await attachDocument(id);
    },
    [attachDocument]
  );

  // 実際の送信と、結果に応じた状態更新。
  const sendSet = useCallback(
    async (id: string, attemptId: string, payload: ImportImagePayload[]) => {
      updateSet(id, (s) => ({
        ...s,
        status: "processing",
        attemptId,
        errorCode: null,
        errorMessage: null,
      }));

      const result = await importProductByImages({
        importAttemptId: attemptId,
        images: payload,
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
        // 商品登録に成功し、書類が選択されていれば、別リクエストで書類のみ添付する
        // （商品は再登録しない）。
        const current = setsRef.current.find((s) => s.id === id);
        if (current?.document) {
          void attachDocument(id);
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
    [attachDocument, updateSet]
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
      const contentUnchanged = sameFiles(set.attemptFiles, set.images);

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
          set.retainedPayload as ImportImagePayload[]
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
      const reuse =
        set.attemptId !== null && sameFiles(set.attemptFiles, set.images);
      const attemptId =
        reuse && set.attemptId ? set.attemptId : createImportAttemptId();
      updateSet(id, (s) => ({
        ...s,
        attemptFiles: s.images,
        newIdAckFiles: null,
      }));

      await sendSet(id, attemptId, payload);
    },
    [sendSet, updateSet]
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
  const documentSummary = {
    total: sets.filter((s) => s.document !== null).length,
    attached: sets.filter((s) => s.documentStatus === "attached").length,
    conflict: sets.filter((s) => s.documentStatus === "conflict").length,
    error: sets.filter(
      (s) =>
        s.documentStatus === "error" || s.documentStatus === "unknown"
    ).length,
    pending: sets.filter(
      (s) =>
        s.document !== null &&
        (s.documentStatus === "idle" || s.documentStatus === "attaching")
    ).length,
  };

  return {
    sets,
    isImporting,
    hasImportableSet,
    summary,
    documentSummary,
    addSet,
    removeSet,
    setImages,
    moveImage,
    setMainImage,
    acknowledgeNewId,
    setDocument,
    attachDocument,
    resendDocument,
    importAll,
    resendSet,
    resetAll,
  };
}