import { useState } from "react";
import { Link } from "react-router-dom";
import DocumentUploadField from "./components/DocumentUploadField";
import DocumentListRow from "./components/DocumentListRow";
import DriveInboxImportSection from "./components/DriveInboxImportSection";
import SupplyLineSearch from "./components/SupplyLineSearch";
import { useDocumentList } from "./hooks/useDocumentList";
import {
  DOCUMENT_MATCH_STATUS_LABELS,
  type DocumentMatchStatus,
} from "./types";

const STATUS_OPTIONS: Array<{ value: "" | DocumentMatchStatus; label: string }> =
  [
    { value: "", label: "すべての照合状態" },
    { value: "unmatched", label: DOCUMENT_MATCH_STATUS_LABELS.unmatched },
    { value: "partial", label: DOCUMENT_MATCH_STATUS_LABELS.partial },
    { value: "matched", label: DOCUMENT_MATCH_STATUS_LABELS.matched },
  ];

export default function DocumentsPage() {
  const list = useDocumentList();
  const {
    loadState,
    documents,
    filtered,
    keyword,
    setKeyword,
    statusFilter,
    setStatusFilter,
    hasFilter,
    clearFilter,
    retry,
    addDocument,
    summary,
  } = list;

  // Inbox一括取込と書類アップロードは、この下部パネルを開いたときだけ表示する。
  const [addPanelOpen, setAddPanelOpen] = useState(false);

  const selectClass =
    "h-9 w-full rounded-lg border border-background-300 bg-white px-3 text-sm text-foreground-900 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 sm:w-44";

  return (
    <div className="admin-font products-theme min-h-screen bg-background-50">
      <header className="border-b border-background-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 md:px-6">
          <h1 className="min-w-0 text-xl font-semibold text-foreground-950">
            書類管理
          </h1>
          <Link
            to="/products"
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
          >
            <i className="ri-archive-2-line w-4 h-4 flex items-center justify-center"></i>
            商品一覧
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-4 md:px-6">
        {/* 画面の主役: 仕入明細を探す（受付番号・ことば） */}
        <SupplyLineSearch />

        {/* 従来の書類一覧（ファイル単位）。検索の役割を分けてここに置く。 */}
        <section className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground-950">
              <i className="ri-folder-3-line w-4 h-4 flex items-center justify-center text-foreground-500"></i>
              書類一覧
            </h2>
            {loadState === "success" && documents.length > 0 && (
              <p className="text-[12px] text-foreground-500">
                {hasFilter ? (
                  <>
                    該当{" "}
                    <span className="font-semibold tabular-nums text-foreground-900">
                      {filtered.length}
                    </span>{" "}
                    / 全 {documents.length} 件
                  </>
                ) : (
                  <>
                    全{" "}
                    <span className="font-semibold tabular-nums text-foreground-900">
                      {documents.length}
                    </span>{" "}
                    件
                  </>
                )}
              </p>
            )}
          </div>

          {/* 書類一覧の絞り込み（ファイル名・書類IDのみ） */}
          <div className="mt-2.5 flex flex-col gap-2 rounded-lg border border-background-200 bg-white p-2.5 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative min-w-0 w-full lg:min-w-[240px] lg:flex-1">
              <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 flex items-center justify-center text-sm text-foreground-400"></i>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="ファイル名・書類IDで絞り込む"
                aria-label="書類を絞り込む"
                className="h-9 w-full rounded-lg border border-background-300 bg-white py-2 pl-9 pr-9 text-sm text-foreground-900 placeholder:text-foreground-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
              {keyword !== "" && (
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  aria-label="検索文字列をクリア"
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-foreground-400 transition-colors hover:bg-background-200 hover:text-foreground-700"
                >
                  <i className="ri-close-line w-4 h-4 flex items-center justify-center text-sm"></i>
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "" | DocumentMatchStatus)
              }
              aria-label="照合状態で絞り込み"
              className={selectClass}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {hasFilter && (
              <button
                type="button"
                onClick={clearFilter}
                className="inline-flex w-fit cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium text-foreground-600 transition-colors hover:bg-background-100 hover:text-foreground-900"
              >
                <i className="ri-refresh-line w-3.5 h-3.5 flex items-center justify-center text-sm"></i>
                条件をクリア
              </button>
            )}
          </div>

          {loadState === "loading" && (
            <div className="mt-6 flex flex-col items-center justify-center gap-3 py-16">
              <i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i>
              <p className="text-sm text-foreground-500">読み込み中...</p>
            </div>
          )}

          {loadState === "error" && (
            <div className="mt-6 flex flex-col items-center justify-center gap-2 py-16 text-center">
              <i className="ri-error-warning-line text-3xl w-8 h-8 flex items-center justify-center text-foreground-300"></i>
              <p className="text-sm font-medium text-foreground-800">
                書類を読み込めませんでした
              </p>
              <p className="text-sm text-foreground-500">
                時間をおいて再度お試しください
              </p>
              <button
                type="button"
                onClick={retry}
                className="mt-2 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
              >
                <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
                再読み込み
              </button>
            </div>
          )}

          {loadState === "success" && (
            <>
              {documents.length === 0 ? (
                <div className="mt-3 flex flex-col items-center justify-center gap-2 rounded-lg border border-background-200 bg-white py-16 text-center">
                  <i className="ri-folder-open-line text-3xl w-8 h-8 flex items-center justify-center text-foreground-300"></i>
                  <p className="text-sm font-medium text-foreground-800">
                    書類がまだ登録されていません
                  </p>
                  <p className="text-sm text-foreground-500">
                    下部の「書類の追加・管理」から書類を登録できます
                  </p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="mt-3 flex flex-col items-center justify-center gap-2 rounded-lg border border-background-200 bg-white py-16 text-center">
                  <i className="ri-search-line text-3xl w-8 h-8 flex items-center justify-center text-foreground-300"></i>
                  <p className="text-sm font-medium text-foreground-800">
                    条件に一致する書類がありません
                  </p>
                  <button
                    type="button"
                    onClick={clearFilter}
                    className="mt-1 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
                  >
                    <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
                    条件をクリア
                  </button>
                </div>
              ) : (
                <div className="mt-3 overflow-hidden rounded-lg border border-background-200 bg-white">
                  <div className="overflow-x-auto">
                    <div className="min-w-full lg:min-w-[1020px]">
                      {/* ヘッダー行（デスクトップ） */}
                      <div className="hidden items-center gap-4 border-b border-background-200 bg-white px-4 py-2 lg:flex">
                        <span className="w-9 shrink-0"></span>
                        <span className="min-w-0 flex-1 text-[11px] font-medium text-foreground-500">
                          ファイル名
                        </span>
                        <span className="w-[56px] shrink-0 text-[11px] font-medium text-foreground-500">
                          種別
                        </span>
                        <span className="w-[104px] shrink-0 text-right text-[11px] font-medium text-foreground-500">
                          原本合計
                        </span>
                        <span className="w-[104px] shrink-0 text-right text-[11px] font-medium text-foreground-500">
                          明細合計
                        </span>
                        <span className="w-[60px] shrink-0 text-right text-[11px] font-medium text-foreground-500">
                          明細数
                        </span>
                        <span className="w-[104px] shrink-0 text-[11px] font-medium text-foreground-500">
                          照合状態
                        </span>
                        <span className="w-[124px] shrink-0 text-[11px] font-medium text-foreground-500">
                          アップロード日時
                        </span>
                        <span className="w-4 shrink-0"></span>
                      </div>

                      {filtered.map((doc) => (
                        <DocumentListRow key={doc.document_id} doc={doc} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* 書類の追加・管理（通常は閉じておき、開いたときだけ取込UIを表示） */}
        <section className="mt-5 rounded-lg border border-background-200 bg-white">
          <button
            type="button"
            onClick={() => setAddPanelOpen((prev) => !prev)}
            aria-expanded={addPanelOpen}
            className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3.5 text-left transition-colors hover:bg-background-50 md:px-5"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary-100 text-secondary-800">
                <i className="ri-folder-add-line w-4 h-4 flex items-center justify-center"></i>
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-foreground-950">
                  書類の追加・管理
                </span>
                <span className="mt-0.5 block text-[11px] text-foreground-400">
                  Inbox一括取込・書類アップロードはここを開いたときだけ表示します
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-foreground-600">
              {addPanelOpen ? "閉じる" : "開く"}
              <i
                className={`ri-arrow-down-s-line w-4 h-4 flex items-center justify-center transition-transform ${
                  addPanelOpen ? "rotate-180" : ""
                }`}
              ></i>
            </span>
          </button>

          {addPanelOpen && (
            <div className="border-t border-background-200 px-4 py-4 md:px-5">
              {/* 接続状況の案内 */}
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-secondary-200 bg-secondary-50 px-3.5 py-2.5">
                <i className="ri-information-line mt-0.5 w-4 h-4 flex items-center justify-center shrink-0 text-secondary-700"></i>
                <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-secondary-900">
                  原本は Drive に保管し、構造化データ（明細・紐付け・照合状態）はこの台帳で管理します。書類台帳API（documents-relay）に接続済みです。
                </p>
              </div>

              {/* Drive 01_inbox の一括取込（起動APIの実測確認までは無効） */}
              <DriveInboxImportSection
                ledgerSummary={loadState === "success" ? summary : null}
                ledgerDocuments={loadState === "success" ? documents : []}
              />

              {/* 書類アップロード欄（PDF / JPG / PNG・1回1ファイル） */}
              <div className="mt-3">
                <DocumentUploadField onUploaded={addDocument} />
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}