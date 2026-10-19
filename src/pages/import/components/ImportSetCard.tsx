import { Link } from "react-router-dom";
import SetImageEditor from "@/pages/import/components/SetImageEditor";
import {
  IMPORT_PAYLOAD_MISMATCH_CODE,
  evaluateRejectionRisk,
  sameFiles,
} from "@/pages/import/lib/multiImport";
import type {
  ImportSet,
  ImportSetStatus,
} from "@/pages/import/hooks/useMultiSetImport";

interface ImportSetCardProps {
  index: number;
  set: ImportSet;
  disabled: boolean;
  onImagesChange: (files: File[]) => void;
  onRemove: () => void;
  onResend: () => void;
  // success:false のセットで内容を変更した後、新IDでの取り込みに進む前の明示承認。
  onAcknowledgeNewId: (acknowledged: boolean) => void;
}

const STATUS_LABELS: Record<ImportSetStatus, string> = {
  idle: "未取り込み",
  processing: "取り込み中",
  success: "下書きで取り込み済み",
  error: "取り込み失敗",
  unknown: "受付状況 不明",
};

const STATUS_STYLES: Record<ImportSetStatus, string> = {
  idle: "bg-background-100 text-foreground-600",
  processing: "bg-secondary-100 text-secondary-900",
  success: "bg-primary-100 text-primary-700",
  error: "bg-red-100 text-red-700",
  unknown: "bg-amber-100 text-amber-800",
};

export default function ImportSetCard({
  index,
  set,
  disabled,
  onImagesChange,
  onRemove,
  onResend,
  onAcknowledgeNewId,
}: ImportSetCardProps) {
  const isProcessing = set.status === "processing";
  const isSuccess = set.status === "success";
  const isUnknown = set.status === "unknown";
  const isError = set.status === "error";

  // 取り込み中・成功・受付不明は編集不可（再送前に内容を変えないため）。
  const editorDisabled = disabled || isProcessing || isSuccess || isUnknown;

  // 送信済み（受付状況が不明 or success:false）＝ペイロードと attempt_id を保持している。
  const hadAttempt = set.retainedPayload !== null && set.attemptId !== null;
  // 現在の画像が「送信時の内容」と同一か。
  const contentUnchanged = sameFiles(set.attemptFiles, set.images);
  // 「前回の取込結果を確認した」というスタッフ承認が現在の内容に対して有効か。
  const acknowledged = sameFiles(set.newIdAckFiles, set.images);

  const risk = evaluateRejectionRisk(set.errorCode || "");
  const isPayloadMismatch = isError && risk.isPayloadMismatch;

  // success:false の後に内容を変更して「新しい取り込みID」で取り込もうとしている状態。
  const isNewIdAfterFailure = isError && hadAttempt && !contentUnchanged;
  // 送信時の内容のまま → 同一ID・同一ペイロードで再送できる（冪等・重複しない）。
  const canResendSameId = isError && hadAttempt && contentUnchanged;
  // 送信前に弾かれたローカルなエラー等（まだ一度も送信していない）。
  const isLocalError = isError && !hadAttempt;

  return (
    <div className="rounded-[10px] border border-background-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background-100 text-xs font-bold text-foreground-700">
            {index + 1}
          </span>
          <h2 className="text-sm font-bold text-foreground-950">
            商品セット{index + 1}：
            <span className="font-medium text-foreground-600">
              画像{set.images.length}枚
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${
              STATUS_STYLES[set.status]
            }`}
          >
            {isProcessing && (
              <i className="ri-loader-4-line w-3.5 h-3.5 animate-spin flex items-center justify-center"></i>
            )}
            {isSuccess && (
              <i className="ri-checkbox-circle-line w-3.5 h-3.5 flex items-center justify-center"></i>
            )}
            {isError && (
              <i className="ri-error-warning-line w-3.5 h-3.5 flex items-center justify-center"></i>
            )}
            {isUnknown && (
              <i className="ri-question-line w-3.5 h-3.5 flex items-center justify-center"></i>
            )}
            {STATUS_LABELS[set.status]}
          </span>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled || isProcessing}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-background-300 text-foreground-500 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-40"
            title="このセットを削除"
          >
            <i className="ri-delete-bin-6-line w-4 h-4 flex items-center justify-center"></i>
          </button>
        </div>
      </div>

      <div className="mt-3">
        <SetImageEditor
          images={set.images}
          onChange={onImagesChange}
          disabled={editorDisabled}
        />
      </div>

      {/* 書類（請求書・領収書）：商品への直接アップロード導線は撤去済み。
          仕入書類は独立した書類台帳で取り込み、商品との照合を行う。 */}

      {/* 状態ごとの表示 */}
      {isProcessing && (
        <p className="mt-3 flex items-center gap-1.5 rounded-md bg-secondary-100/70 px-3 py-2 text-xs font-medium text-secondary-900">
          <i className="ri-loader-4-line w-4 h-4 animate-spin flex items-center justify-center"></i>
          このセットを下書きとして取り込んでいます...
        </p>
      )}

      {isSuccess && (
        <div className="mt-3 rounded-md border border-primary-200 bg-primary-50 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-bold text-primary-700">
            <i className="ri-checkbox-circle-line w-4 h-4 flex items-center justify-center"></i>
            下書きとして取り込みました
          </p>
          {set.productId && (
            <p className="mt-1 text-xs text-foreground-600">
              商品ID：
              <span className="font-mono text-foreground-950">
                {set.productId}
              </span>
            </p>
          )}
          <p className="mt-1 text-[11px] text-foreground-500">
            ※ 商品情報（名前・状態・価格など）は未入力です。商品一覧の「一括AI生成」で生成できます。
          </p>
          {set.productId && (
            <Link
              to={`/products/${set.productId}`}
              className="mt-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-primary-300 bg-white px-3 py-1.5 text-xs font-bold text-primary-700 transition-colors hover:bg-primary-100"
            >
              <i className="ri-article-line w-4 h-4 flex items-center justify-center"></i>
              商品詳細を見る
            </Link>
          )}
        </div>
      )}

      {isError && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
          {/* エラー本体 */}
          <p className="flex items-start gap-1.5 text-xs font-medium text-red-800">
            <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
            <span className="min-w-0 flex-1 break-words">
              {set.errorMessage || "取り込みに失敗しました。"}
              {set.errorCode && !isPayloadMismatch && (
                <span className="ml-1 font-mono text-[11px]">
                  （コード: {set.errorCode}）
                </span>
              )}
            </span>
          </p>

          {/* 同一IDで内容不一致（指紋照合）により中止されたケース */}
          {isPayloadMismatch && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-red-700">
              同じ取り込みID
              <span className="mx-0.5 font-mono">
                （{IMPORT_PAYLOAD_MISMATCH_CODE}）
              </span>
              で内容（画像の順序・内容・ファイル名）が変わっているため中止されました。新しいIDでの自動取り込みは行いません。先に商品一覧で前回の取込結果（重複の有無）を確認してください。
            </p>
          )}

          {/* 送信時の内容のまま → 同一ID・同一ペイロードで再送 */}
          {canResendSameId && (
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5">
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-900">
                <i className="ri-information-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
                <span>
                  Drive保存や本票書込みの「途中」で失敗した可能性があり、<span className="font-bold">前回の試行で商品が作成されている恐れ</span>があります。先に商品一覧で重複がないか確認してください。内容は送信時のままなので、同じ取り込みID・同じ画像で安全に再送できます（同じ商品として扱われます）。
                </span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link
                  to="/products"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-100"
                >
                  <i className="ri-list-check-2 w-4 h-4 flex items-center justify-center"></i>
                  商品一覧で結果を確認
                </Link>
                <button
                  type="button"
                  onClick={onResend}
                  disabled={disabled}
                  className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
                  同じ内容で再送（同一ID）
                </button>
              </div>
            </div>
          )}

          {/* 送信後に内容を変更 → 新ID。重複リスクを表示し、明示承認を必須にする */}
          {isNewIdAfterFailure && (
            <div className="mt-2 rounded-md border border-amber-400 bg-amber-50 px-3 py-2.5">
              <p className="flex items-start gap-1.5 text-xs font-bold text-amber-900">
                <i className="ri-alert-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
                <span>
                  内容を変更したため、次の取り込みは「新しい取り込みID」で登録されます。
                </span>
              </p>
              {risk.mayHaveCreated && (
                <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                  前回の試行では Drive 保存や本票書込みの途中で失敗した可能性があり、
                  <span className="font-bold">
                    すでに同じ商品が作成されている恐れ
                  </span>
                  があります。その状態で新しいIDで取り込むと、同じ商品が
                  <span className="font-bold">重複して登録</span>
                  されます。新しいIDでの取り込みは自動では行いません。
                </p>
              )}
              <div className="mt-2">
                <Link
                  to="/products"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-100"
                >
                  <i className="ri-list-check-2 w-4 h-4 flex items-center justify-center"></i>
                  商品一覧で前回の結果を確認
                </Link>
              </div>
              <label className="mt-2.5 flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => onAcknowledgeNewId(e.target.checked)}
                  disabled={disabled}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-amber-600"
                />
                <span className="text-[11px] leading-relaxed text-amber-900">
                  前回の取込結果を確認し、重複して登録される可能性を理解しました
                </span>
              </label>
              <button
                type="button"
                onClick={onResend}
                disabled={disabled || !acknowledged || set.images.length === 0}
                className="mt-2 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <i className="ri-add-circle-line w-4 h-4 flex items-center justify-center"></i>
                新しいIDで取り込む（重複に注意）
              </button>
            </div>
          )}

          {/* 送信前のローカルエラー等 → 通常の再取り込み */}
          {isLocalError && (
            <button
              type="button"
              onClick={onResend}
              disabled={disabled || set.images.length === 0}
              className="mt-2 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-800 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
              再取り込み
            </button>
          )}
        </div>
      )}

      {isUnknown && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5">
          <p className="flex items-start gap-1.5 text-xs font-medium text-amber-900">
            <i className="ri-question-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
            <span className="min-w-0 flex-1 break-words">
              {set.errorMessage ||
                "受付状況を確認できませんでした。受付済みの可能性があります。"}
            </span>
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-amber-800">
            受付済みか判断できないため、同じ取り込みID・同じ内容（画像の順序・ファイル・枚数）で再送します。
            再送するまでこのセットは編集できません（内容が変わると二重登録や拒否の原因になるため）。
          </p>
          <button
            type="button"
            onClick={onResend}
            disabled={disabled}
            className="mt-2 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
            同じ内容で再送
          </button>
        </div>
      )}
    </div>
  );
}