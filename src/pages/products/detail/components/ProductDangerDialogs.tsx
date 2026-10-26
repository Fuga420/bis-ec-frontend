import SaveStatusMessage from "@/components/base/SaveStatusMessage";

interface ProductDangerDialogsProps {
  productId: string;
  squareLinked: boolean;

  // アーカイブ
  isArchiveOpen: boolean;
  archiveSaving: boolean;
  archiveError: string;
  onCloseArchive: () => void;
  onConfirmArchive: () => void;

  // 復元（再有効化）
  isRestoreOpen: boolean;
  restoreSaving: boolean;
  canRegeneratePaymentLink: boolean;
  restoreRegenerateLink: boolean;
  onToggleRestoreRegenerateLink: (value: boolean) => void;
  onCloseRestore: () => void;
  onConfirmRestore: () => void;

  // 完全削除
  isDeleteOpen: boolean;
  deleteSaving: boolean;
  deleteConfirmInput: string;
  deleteError: string;
  onChangeDeleteInput: (value: string) => void;
  onCloseDelete: () => void;
  onConfirmDelete: () => void;
}

/** アーカイブ / 復元 / 完全削除の確認ダイアログ（表示のみ・実行は呼び出し元） */
export default function ProductDangerDialogs({
  productId,
  squareLinked,
  isArchiveOpen,
  archiveSaving,
  archiveError,
  onCloseArchive,
  onConfirmArchive,
  isRestoreOpen,
  restoreSaving,
  canRegeneratePaymentLink,
  restoreRegenerateLink,
  onToggleRestoreRegenerateLink,
  onCloseRestore,
  onConfirmRestore,
  isDeleteOpen,
  deleteSaving,
  deleteConfirmInput,
  deleteError,
  onChangeDeleteInput,
  onCloseDelete,
  onConfirmDelete,
}: ProductDangerDialogsProps) {
  return (
    <>
      {/* アーカイブ確認ダイアログ */}
      {isArchiveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-background-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <i className="ri-error-warning-line w-5 h-5 flex items-center justify-center text-red-600"></i>
              <h3 className="text-base font-bold text-foreground-950">
                商品をアーカイブ
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-foreground-700">
              この商品をアーカイブしますか？
              <br />
              アーカイブすると通常の商品一覧と公開サイトから除外されます。
              <br />
              商品データと画像は削除されません。
            </p>
            {squareLinked && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-relaxed font-medium text-amber-800">
                Square連携済み商品のため、Square側でも在庫停止・決済リンク無効化・商品アーカイブが実行されます。
              </p>
            )}
            {archiveError && (
              <SaveStatusMessage tone="error" text={archiveError} className="mt-3" />
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCloseArchive}
                disabled={archiveSaving}
                className="cursor-pointer whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={onConfirmArchive}
                disabled={archiveSaving}
                className="inline-flex min-w-[124px] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {archiveSaving ? (
                  <>
                    <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                    処理中...
                  </>
                ) : (
                  "アーカイブする"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 再有効化（復元）確認ダイアログ（Square連携済みのみ） */}
      {isRestoreOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-background-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <i className="ri-refresh-line w-5 h-5 flex items-center justify-center text-primary-600"></i>
              <h3 className="text-base font-bold text-foreground-950">
                商品を復元
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-foreground-700">
              この商品を復元しますか？
              <br />
              復元すると通常の商品一覧と公開サイトに表示されます。
            </p>
            <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-relaxed font-medium text-amber-800">
              Square連携済み商品ですが、復元してもSquare側は停止したままです（自動では再開されません）。Squareでの再開・再連携が必要です。決済リンクは下のチェックで再生成できます。
            </p>

            <label className="mt-4 flex items-start gap-2">
              <input
                type="checkbox"
                checked={restoreRegenerateLink}
                disabled={!canRegeneratePaymentLink || restoreSaving}
                onChange={(e) => onToggleRestoreRegenerateLink(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="min-w-0 flex-1 text-sm font-medium text-foreground-800">
                決済リンクも再生成する
              </span>
            </label>
            {!canRegeneratePaymentLink && (
              <p className="mt-1 text-xs text-foreground-400">
                商品が未公開または在庫なしのため、決済リンクは再生成できません。
              </p>
            )}

            {archiveError && (
              <SaveStatusMessage tone="error" text={archiveError} className="mt-3" />
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCloseRestore}
                disabled={restoreSaving}
                className="cursor-pointer whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={onConfirmRestore}
                disabled={restoreSaving}
                className="inline-flex min-w-[116px] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {restoreSaving ? (
                  <>
                    <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                    処理中...
                  </>
                ) : (
                  "復元する"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 完全削除確認ダイアログ */}
      {isDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-background-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <i className="ri-error-warning-line w-5 h-5 flex items-center justify-center text-red-600"></i>
              <h3 className="text-base font-bold text-foreground-950">
                商品を完全削除
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-foreground-700">
              この商品を完全に削除しますか？
              <br />
              <br />
              この操作は取り消せません。
              <br />
              Google Sheetsの商品データは削除され、
              <br />
              Google Driveの商品フォルダはゴミ箱へ移動します。
              <br />
              <br />
              続行するには、商品IDを入力してください。
            </p>

            <div className="mt-4">
              <label className="text-xs font-medium text-foreground-500">
                対象商品ID
              </label>
              <p className="mt-1 font-mono text-sm font-bold text-foreground-950">
                {productId}
              </p>
              <input
                type="text"
                value={deleteConfirmInput}
                onChange={(e) => onChangeDeleteInput(e.target.value)}
                placeholder={productId}
                disabled={deleteSaving}
                className="mt-2 w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-sm text-foreground-900 placeholder:text-foreground-300 focus:border-red-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {deleteError && (
              <SaveStatusMessage tone="error" text={deleteError} className="mt-3" />
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCloseDelete}
                disabled={deleteSaving}
                className="cursor-pointer whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={deleteSaving || deleteConfirmInput !== productId}
                className="inline-flex min-w-[124px] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteSaving ? (
                  <>
                    <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                    削除中...
                  </>
                ) : (
                  "完全に削除する"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}