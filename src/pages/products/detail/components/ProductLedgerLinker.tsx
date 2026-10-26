import { useState } from "react";
import {
  DocumentLedgerApiError,
  linkLineToProduct,
  searchDocumentLines,
} from "@/pages/documents/lib/documentLedgerApi";
import type {
  DocumentLineSearchHit,
  TransactionType,
} from "@/pages/documents/types";

interface ProductLedgerLinkerProps {
  // 紐付け先の商品ID（この商品へ明細を紐付ける）
  productId: string;
  // 確認表示用の商品名（任意）
  productName?: string;
  // 紐付け確定後に呼ぶ（呼び出し側で仕入内訳を再取得する）
  onChanged: () => void;
}

type SearchState = "idle" | "loading" | "success" | "empty" | "error";
type ConfirmState = "idle" | "saving" | "error";

const fieldClass =
  "h-10 w-full rounded-md border border-background-300 bg-white px-3 text-sm text-foreground-900 placeholder:text-foreground-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200";

function formatYen(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `¥${Number(value).toLocaleString("ja-JP")}`;
}

// 明細の取引種別から紐付け種別を決める（書類画面の手動紐付けと同じ対応）。
function resolveLinkType(transactionType: TransactionType | string): string {
  switch (transactionType) {
    case "commission":
    case "fee_only":
    case "unsold_fee":
      return "commission";
    case "shipping":
      return "shipping_cost";
    case "refund":
    case "discount":
    case "cancel":
      return "refund";
    case "sale_settlement":
      return "sale_settlement";
    case "other_expense":
    case "participation_fee":
      return "other_expense";
    default:
      return "primary_cost";
  }
}

/**
 * 商品詳細の「仕入内訳」カード内に置く、スタッフ用の明細検索・紐付けパネル。
 *
 * - 検索は書類管理と同じ searchDocumentLines（受付番号・品目の部分一致）を再利用する。
 * - 確定は documents-relay の link_product_manual、解除は unlink_product_manual。
 * - 自動照合は行わない（候補の提示のみ）。税額の再配分・利益計算は変更しない。
 */
export default function ProductLedgerLinker({
  productId,
  productName,
  onChanged,
}: ProductLedgerLinkerProps) {
  const [receptionNumber, setReceptionNumber] = useState("");
  const [keyword, setKeyword] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [hits, setHits] = useState<DocumentLineSearchHit[]>([]);
  const [selected, setSelected] = useState<DocumentLineSearchHit | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>("idle");
  const [errorText, setErrorText] = useState("");
  const [doneText, setDoneText] = useState("");

  const hasInput = receptionNumber.trim() !== "" || keyword.trim() !== "";

  const runSearch = async () => {
    if (!hasInput || searchState === "loading") return;
    setSearchState("loading");
    setErrorText("");
    setDoneText("");
    setSelected(null);
    try {
      const rows = await searchDocumentLines({ receptionNumber, keyword });
      setHits(rows);
      setSearchState(rows.length > 0 ? "success" : "empty");
    } catch (e) {
      setHits([]);
      setErrorText(
        e instanceof DocumentLedgerApiError
          ? e.message
          : "明細の検索に失敗しました。時間をおいて再度お試しください。"
      );
      setSearchState("error");
    }
  };

  const confirmLink = async () => {
    if (!selected || confirmState === "saving") return;
    // 既にこの商品へ紐付いている明細は重複確定させない。
    if (selected.linked_product_ids.includes(productId)) return;

    setConfirmState("saving");
    setErrorText("");
    setDoneText("");
    try {
      // 割当金額は明細の内訳（商品代金＋落札手数料）を優先し、無ければ明細金額を使う。
      const breakdown = (selected.item_amount ?? 0) + (selected.fee_amount ?? 0);
      const allocatedAmount = breakdown > 0 ? breakdown : selected.total_line_amount;

      await linkLineToProduct({
        documentLineId: selected.line_id,
        productId,
        linkType: resolveLinkType(selected.transaction_type),
        allocatedAmount,
      });

      // 候補一覧の紐付け状態をその場で更新する（再検索しても重複確定できない）。
      setHits((prev) =>
        prev.map((hit) =>
          hit.line_id === selected.line_id &&
          !hit.linked_product_ids.includes(productId)
            ? {
                ...hit,
                linked_product_ids: [...hit.linked_product_ids, productId],
              }
            : hit
        )
      );
      setDoneText(
        `受付番号 ${selected.reception_number || "なし"} / ${
          selected.item_name || "品目なし"
        } を商品 ${productId} に紐付けました。`
      );
      setSelected(null);
      setConfirmState("idle");
      onChanged();
    } catch (e) {
      setErrorText(
        e instanceof DocumentLedgerApiError
          ? e.message
          : "紐付けに失敗しました。時間をおいて再度お試しください。"
      );
      setConfirmState("error");
    }
  };

  const resetSearch = () => {
    setReceptionNumber("");
    setKeyword("");
    setHits([]);
    setSelected(null);
    setSearchState("idle");
    setConfirmState("idle");
    setErrorText("");
    setDoneText("");
  };

  return (
    <div className="rounded-lg border border-secondary-200 bg-secondary-50/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground-900">
            <i className="ri-link-m w-4 h-4 flex items-center justify-center text-secondary-700"></i>
            仕入明細を探して紐付け
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-foreground-500">
            受付番号または品目で書類明細を検索し、この商品に紐付けます（スタッフ用）。自動照合は行いません。
          </p>
        </div>
        <span className="inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-md bg-secondary-100 px-2 text-[10px] font-medium leading-none text-secondary-900">
          スタッフ用
        </span>
      </div>

      <form
        className="mt-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-foreground-600">
              受付番号（部分一致）
            </span>
            <input
              type="text"
              value={receptionNumber}
              onChange={(e) => setReceptionNumber(e.target.value)}
              placeholder="例: 875-37916"
              aria-label="受付番号で検索"
              className={`${fieldClass} font-mono`}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-foreground-600">
              品目・ことば
            </span>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="例: ダイヤモンド / オークネット"
              aria-label="品目で検索"
              className={fieldClass}
            />
          </label>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={!hasInput || searchState === "loading"}
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary-500 px-3.5 py-2 text-[12px] font-semibold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {searchState === "loading" ? (
              <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
            ) : (
              <i className="ri-search-line w-3.5 h-3.5 flex items-center justify-center"></i>
            )}
            {searchState === "loading" ? "検索中..." : "明細を検索"}
          </button>
          {(hasInput || searchState !== "idle") && (
            <button
              type="button"
              onClick={resetSearch}
              className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 py-2 text-[11px] font-medium text-foreground-600 transition-colors hover:bg-background-100"
            >
              <i className="ri-refresh-line w-3.5 h-3.5 flex items-center justify-center"></i>
              条件をクリア
            </button>
          )}
        </div>
      </form>

      {errorText && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] font-medium text-red-700">
          <i className="ri-error-warning-line mt-0.5 w-3.5 h-3.5 shrink-0 flex items-center justify-center"></i>
          <span className="min-w-0 flex-1">{errorText}</span>
        </p>
      )}

      {doneText && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-primary-200 bg-primary-50 px-2.5 py-2 text-[11px] font-medium text-primary-800">
          <i className="ri-checkbox-circle-line mt-0.5 w-3.5 h-3.5 shrink-0 flex items-center justify-center"></i>
          <span className="min-w-0 flex-1">{doneText}</span>
        </p>
      )}

      {searchState === "empty" && (
        <p className="mt-2 flex items-center gap-1.5 rounded-md border border-background-200 bg-white px-2.5 py-2 text-[11px] text-foreground-600">
          <i className="ri-inbox-line w-4 h-4 flex items-center justify-center"></i>
          条件に一致する明細は見つかりませんでした。桁や表記を変えてお試しください。
        </p>
      )}

      {searchState === "success" && (
        <>
          <p className="mt-2 text-[11px] text-foreground-500">
            候補 <span className="font-bold tabular-nums text-foreground-900">{hits.length}</span> 件
            （上限100件）
          </p>
          <ul className="mt-1 max-h-[360px] overflow-y-auto rounded-md border border-background-200 bg-white">
            {hits.map((hit) => {
              const linkedHere = hit.linked_product_ids.includes(productId);
              const linkedElsewhere =
                !linkedHere && hit.linked_product_ids.length > 0;
              const isSelected = selected?.line_id === hit.line_id;
              return (
                <li
                  key={hit.line_id}
                  className={`border-b border-background-100 px-3 py-2.5 last:border-b-0 ${
                    isSelected ? "bg-primary-50/60" : ""
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex h-[21px] shrink-0 items-center whitespace-nowrap rounded-md bg-secondary-100 px-1.5 font-mono text-[11px] font-bold text-secondary-900">
                          {hit.reception_number || "受付番号なし"}
                        </span>
                        <span className="min-w-0 break-words text-[13px] font-semibold text-foreground-950">
                          {hit.item_name || "（品目なし）"}
                        </span>
                        {linkedHere && (
                          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-primary-100 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">
                            <i className="ri-check-line w-3 h-3 flex items-center justify-center"></i>
                            この商品に紐付け済み
                          </span>
                        )}
                        {linkedElsewhere && (
                          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-background-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground-600">
                            <i className="ri-link w-3 h-3 flex items-center justify-center"></i>
                            他商品 {hit.linked_product_ids[0]}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-foreground-600">
                        <span className="whitespace-nowrap">
                          仕入先{" "}
                          <span className="font-medium text-foreground-800">
                            {hit.supplier_name || "—"}
                          </span>
                        </span>
                        <span className="whitespace-nowrap tabular-nums">
                          商品代金{" "}
                          <span className="font-semibold text-foreground-900">
                            {formatYen(hit.item_amount)}
                          </span>
                        </span>
                        <span className="whitespace-nowrap tabular-nums">
                          落札手数料{" "}
                          <span className="font-semibold text-foreground-900">
                            {formatYen(hit.fee_amount)}
                          </span>
                        </span>
                        <span className="whitespace-nowrap tabular-nums text-foreground-500">
                          明細金額（税込）{" "}
                          <span className="font-medium text-foreground-700">
                            {formatYen(hit.total_line_amount)}
                          </span>
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 truncate text-[10px] text-foreground-400">
                          {hit.document_file_name || "書類名なし"}
                          {hit.line_number ? ` / 明細 ${hit.line_number}` : ""}
                        </span>
                        {hit.drive_url ? (
                          <a
                            href={hit.drive_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded border border-background-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-foreground-600 transition-colors hover:border-primary-400 hover:text-primary-700"
                          >
                            <i className="ri-file-pdf-2-line w-3 h-3 flex items-center justify-center"></i>
                            原本
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-background-200 px-1.5 py-0.5 text-[10px] text-foreground-400">
                            <i className="ri-link-unlink w-3 h-3 flex items-center justify-center"></i>
                            原本なし
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {linkedHere ? (
                        <span className="inline-flex items-center whitespace-nowrap rounded-md border border-background-200 bg-background-50 px-2.5 py-1.5 text-[11px] font-medium text-foreground-400">
                          選択不可
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(hit);
                            setConfirmState("idle");
                            setErrorText("");
                            setDoneText("");
                          }}
                          className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-primary-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-primary-700 transition-colors hover:bg-primary-100"
                        >
                          <i className="ri-add-line w-3.5 h-3.5 flex items-center justify-center"></i>
                          この明細を選択
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* 選択後: 紐付け先と明細を確認して確定する */}
      {selected && (
        <div className="mt-2.5 rounded-lg border border-primary-300 bg-white p-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground-900">
            <i className="ri-checkbox-blank-circle-line w-3.5 h-3.5 flex items-center justify-center text-primary-600"></i>
            紐付け内容の確認
          </p>

          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-primary-200 bg-primary-50 px-2.5 py-2">
              <p className="text-[10px] font-medium text-primary-700">紐付け先の商品ID</p>
              <p className="mt-0.5 break-all font-mono text-[12px] font-bold text-primary-800">
                {productId}
              </p>
              {productName && (
                <p className="mt-0.5 truncate text-[10px] text-primary-700" title={productName}>
                  {productName}
                </p>
              )}
            </div>
            <div className="rounded-md border border-background-200 bg-background-50 px-2.5 py-2">
              <p className="text-[10px] font-medium text-foreground-500">紐付ける明細</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex h-[20px] items-center whitespace-nowrap rounded bg-secondary-100 px-1.5 font-mono text-[11px] font-bold text-secondary-900">
                  {selected.reception_number || "受付番号なし"}
                </span>
                <span className="min-w-0 break-words text-[12px] font-semibold text-foreground-900">
                  {selected.item_name || "（品目なし）"}
                </span>
              </p>
              <p className="mt-0.5 truncate text-[10px] text-foreground-400">
                明細ID {selected.line_id}
                {selected.document_file_name ? ` / ${selected.document_file_name}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-foreground-600">
            <span className="whitespace-nowrap">
              仕入先{" "}
              <span className="font-medium text-foreground-800">
                {selected.supplier_name || "—"}
              </span>
            </span>
            <span className="whitespace-nowrap tabular-nums">
              商品代金{" "}
              <span className="font-semibold text-foreground-900">
                {formatYen(selected.item_amount)}
              </span>
            </span>
            <span className="whitespace-nowrap tabular-nums">
              落札手数料{" "}
              <span className="font-semibold text-foreground-900">
                {formatYen(selected.fee_amount)}
              </span>
            </span>
            <span className="whitespace-nowrap tabular-nums text-foreground-500">
              明細金額（税込）{" "}
              <span className="font-medium text-foreground-700">
                {formatYen(selected.total_line_amount)}
              </span>
            </span>
          </div>

          <p className="mt-1.5 text-[10px] leading-relaxed text-foreground-400">
            確定すると書類明細にこの商品IDが紐付き、仕入内訳に反映されます。税額の配分・利益計算は変わりません。
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void confirmLink()}
              disabled={confirmState === "saving"}
              className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md bg-primary-500 px-3.5 py-2 text-[12px] font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {confirmState === "saving" ? (
                <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
              ) : (
                <i className="ri-link-m w-3.5 h-3.5 flex items-center justify-center"></i>
              )}
              {confirmState === "saving" ? "確定中..." : "この商品に紐付ける"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setConfirmState("idle");
                setErrorText("");
              }}
              disabled={confirmState === "saving"}
              className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 py-2 text-[11px] font-medium text-foreground-600 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              選択をやめる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}