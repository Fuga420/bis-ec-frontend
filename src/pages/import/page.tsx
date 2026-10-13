import { Link } from "react-router-dom";
import ImportSetCard from "@/pages/import/components/ImportSetCard";
import ImportBatchSection from "@/pages/import/components/ImportBatchSection";
import { sameFiles } from "@/pages/import/lib/multiImport";
import { useMultiSetImport } from "@/pages/import/hooks/useMultiSetImport";

export default function ImportPage() {
  const importer = useMultiSetImport();
  const { sets, isImporting, summary, documentSummary } = importer;

  const anyDone =
    summary.success > 0 || summary.error > 0 || summary.unknown > 0;

  // 取り込みに成功した（product_id を取得できた）商品を、画面の並び順で集める。
  const successProducts = sets
    .filter((s) => s.status === "success" && s.productId)
    .map((s) => ({ product_id: s.productId as string }));

  // success:false の後に内容を変更し、まだ「前回の取込結果を確認した」承認が
  // 得られていないセットの数（新IDでの取り込みは承認後にのみ実行できる）。
  const needsResultConfirm = sets.filter(
    (s) =>
      s.status === "error" &&
      s.retainedPayload !== null &&
      s.attemptId !== null &&
      !sameFiles(s.attemptFiles, s.images) &&
      !sameFiles(s.newIdAckFiles, s.images)
  ).length;

  return (
    <div className="admin-font products-theme min-h-screen bg-background-50">
      <header className="border-b border-background-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3 md:px-6">
          <Link
            to="/products"
            className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-foreground-600 transition-colors hover:text-primary-600"
          >
            <i className="ri-arrow-left-line w-4 h-4 flex items-center justify-center"></i>
            商品一覧
          </Link>
          <span className="text-sm font-semibold text-foreground-950">
            画像セットで一括取込
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-4 md:px-6">
        {/* 説明（コンパクト） */}
        <div className="rounded-[10px] border border-background-200 bg-white px-4 py-3.5 md:px-5">
          <div className="flex items-center gap-2">
            <i className="ri-stack-line w-5 h-5 flex items-center justify-center text-primary-600"></i>
            <h1 className="text-[15px] font-semibold text-foreground-950">
              画像セットで一括取込
            </h1>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground-600">
            商品ごとに画像をまとめて、複数商品を下書き登録します。
          </p>

          {/* 詳細説明・注意事項（初期状態は閉じる） */}
          <details className="group mt-3">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-foreground-600 transition-colors hover:text-primary-600 [&::-webkit-details-marker]:hidden">
              <i className="ri-arrow-right-s-line w-4 h-4 flex items-center justify-center transition-transform duration-200 group-open:rotate-90"></i>
              取込方法・注意事項
            </summary>
            <div className="mt-2.5 rounded-md border border-background-200 bg-background-50 px-3 py-3">
              <p className="text-xs leading-relaxed text-foreground-600">
                1商品＝1セットとして区切り、商品ごとの画像（1〜20枚）を準備します。
                「まとめて取り込む」でセットを
                <span className="font-medium">1つずつ順番に</span>送信し、それぞれを
                <span className="font-medium text-foreground-800">下書き</span>
                として取り込みます（公開はされません）。取り込み後の商品情報は、商品一覧の「一括AI生成」で補完できます。
              </p>
              <ul className="mt-2.5 grid grid-cols-1 gap-1.5 text-xs text-foreground-500 sm:grid-cols-2">
                <li className="flex items-center gap-1.5">
                  <i className="ri-checkbox-blank-circle-fill w-3.5 h-3.5 flex items-center justify-center text-[6px] text-primary-500"></i>
                  1セット＝1商品（画像1〜20枚・1枚目がメイン）
                </li>
                <li className="flex items-center gap-1.5">
                  <i className="ri-checkbox-blank-circle-fill w-3.5 h-3.5 flex items-center justify-center text-[6px] text-primary-500"></i>
                  追加・並べ替え・メイン変更・削除ができます
                </li>
                <li className="flex items-center gap-1.5">
                  <i className="ri-checkbox-blank-circle-fill w-3.5 h-3.5 flex items-center justify-center text-[6px] text-primary-500"></i>
                  複数セットは前の応答を待って逐次送信します
                </li>
                <li className="flex items-center gap-1.5">
                  <i className="ri-checkbox-blank-circle-fill w-3.5 h-3.5 flex items-center justify-center text-[6px] text-primary-500"></i>
                  成功したセットは再送しません
                </li>
                <li className="flex items-center gap-1.5">
                  <i className="ri-checkbox-blank-circle-fill w-3.5 h-3.5 flex items-center justify-center text-[6px] text-primary-500"></i>
                  書類（請求書・領収書）を任意で1件添付できます
                </li>
              </ul>
              <p className="mt-2.5 flex items-start gap-1.5 rounded-md bg-background-100 px-3 py-2 text-[11px] leading-relaxed text-foreground-500">
                <i className="ri-information-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
                <span>
                  この画面を閉じたり再読み込みすると、進行中の取り込みは中断され、内容は復元されません（新しいIDでの自動再送も行いません）。
                  通信状況によっては、受付済みか判断できないセットを同じ内容で再送できます。
                </span>
              </p>
            </div>
          </details>
        </div>

        {/* セット一覧 */}
        <div className="mt-4 flex flex-col gap-3">
          {sets.map((set, index) => (
            <ImportSetCard
              key={set.id}
              index={index}
              set={set}
              disabled={isImporting}
              onImagesChange={(files) => importer.setImages(set.id, files)}
              onRemove={() => importer.removeSet(set.id)}
              onResend={() => importer.resendSet(set.id)}
              onAcknowledgeNewId={(ack) =>
                importer.acknowledgeNewId(set.id, ack)
              }
              onDocumentSelect={(file) => importer.setDocument(set.id, file)}
              onDocumentAttach={() => importer.attachDocument(set.id)}
              onDocumentResend={() => importer.resendDocument(set.id)}
            />
          ))}
        </div>

        {/* セット追加 */}
        <button
          type="button"
          onClick={importer.addSet}
          disabled={isImporting}
          className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border-2 border-dashed border-background-300 bg-background-50 py-3 text-sm font-bold text-foreground-700 transition-colors hover:border-primary-400 hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <i className="ri-add-line w-4 h-4 flex items-center justify-center"></i>
          商品セットを追加
        </button>

        {/* サマリー＋まとめて取り込む */}
        <div className="mt-4 rounded-lg border border-background-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-background-100 px-3 py-1 text-xs font-medium text-foreground-700">
                セット {summary.total}
              </span>
              {summary.success > 0 && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary-100 px-3 py-1 text-xs font-bold text-primary-700">
                  <i className="ri-checkbox-circle-line w-3.5 h-3.5 flex items-center justify-center"></i>
                  成功 {summary.success}
                </span>
              )}
              {summary.error > 0 && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                  <i className="ri-error-warning-line w-3.5 h-3.5 flex items-center justify-center"></i>
                  失敗 {summary.error}
                </span>
              )}
              {summary.unknown > 0 && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                  <i className="ri-question-line w-3.5 h-3.5 flex items-center justify-center"></i>
                  受付不明 {summary.unknown}
                </span>
              )}
            </div>
          </div>

          {/* 書類添付の結果（商品登録とは別） */}
          {documentSummary.total > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-background-100 pt-3">
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-background-100 px-3 py-1 text-xs font-medium text-foreground-700">
                <i className="ri-file-text-line w-3.5 h-3.5 flex items-center justify-center"></i>
                書類 対象 {documentSummary.total}
              </span>
              {documentSummary.attached > 0 && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary-100 px-3 py-1 text-xs font-bold text-primary-700">
                  <i className="ri-checkbox-circle-line w-3.5 h-3.5 flex items-center justify-center"></i>
                  添付済み {documentSummary.attached}
                </span>
              )}
              {documentSummary.pending > 0 && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-secondary-100 px-3 py-1 text-xs font-bold text-secondary-900">
                  <i className="ri-loader-4-line w-3.5 h-3.5 flex items-center justify-center"></i>
                  添付待ち {documentSummary.pending}
                </span>
              )}
              {documentSummary.conflict > 0 && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                  <i className="ri-alert-line w-3.5 h-3.5 flex items-center justify-center"></i>
                  競合 {documentSummary.conflict}
                </span>
              )}
              {documentSummary.error > 0 && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                  <i className="ri-error-warning-line w-3.5 h-3.5 flex items-center justify-center"></i>
                  未添付 {documentSummary.error}
                </span>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={importer.importAll}
              disabled={isImporting || !importer.hasImportableSet}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary-500 px-5 py-2.5 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <i className="ri-loader-4-line w-4 h-4 animate-spin flex items-center justify-center"></i>
                  取り込み中...
                </>
              ) : (
                <>
                  <i className="ri-inbox-archive-line w-4 h-4 flex items-center justify-center"></i>
                  まとめて取り込む（下書き）
                </>
              )}
            </button>
            {anyDone && !isImporting && (
              <button
                type="button"
                onClick={importer.resetAll}
                className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-background-50 px-4 py-2.5 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
              >
                <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
                リセットして最初から
              </button>
            )}
            {isImporting && (
              <span className="text-xs text-foreground-500">
                1セットずつ順番に送信しています。完了までこの画面を開いたままにしてください。
              </span>
            )}
          </div>
          {!importer.hasImportableSet && !isImporting && (
            <p className="mt-2 text-xs text-foreground-400">
              {summary.unknown > 0
                ? "受付状況が不明なセットは、各セットの「同じ内容で再送」から再送してください。"
                : "取り込むには、いずれかのセットに画像を1枚以上追加してください。"}
            </p>
          )}
          {needsResultConfirm > 0 && !isImporting && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
              <i className="ri-alert-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
              <span>
                失敗したセットの内容を変更したものがあります（{needsResultConfirm}件）。前回の試行で商品が作成されている恐れがあるため、新しいIDでの取り込みは自動では行いません。各セットで商品一覧の取込結果を確認し、確認チェックを入れてから取り込んでください。
              </span>
            </p>
          )}
        </div>

        {/* 取り込み済み商品の一覧＋一括AI生成への導線（既存バッチ生成を再利用） */}
        <ImportBatchSection products={successProducts} />
      </main>
    </div>
  );
}