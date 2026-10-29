import { Link } from "react-router-dom";
import type { DocumentLineSearchHit } from "@/pages/documents/types";

interface SupplyLineSearchResultsProps {
  hits: DocumentLineSearchHit[];
}

function formatYen(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `¥${Number(value).toLocaleString("ja-JP")}`;
}

// 明細は書類詳細の該当行へ直接移動する（?line= で強調表示）。
function lineDetailPath(hit: DocumentLineSearchHit): string {
  return `/documents/${hit.document_id}?line=${encodeURIComponent(hit.line_id)}`;
}

const HEAD_CELL = "text-[11px] font-medium text-foreground-500";

/**
 * 仕入明細検索の結果一覧（明細単位）。
 *
 * 各行から書類詳細の該当明細を開き、既存の商品検索・手動紐付け・解除へ進む。
 * ここでは自動照合は行わない（候補の提示のみ）。
 */
export default function SupplyLineSearchResults({
  hits,
}: SupplyLineSearchResultsProps) {
  const linkedCount = hits.filter((hit) => hit.linked_product_ids.length > 0).length;
  const unlinkedCount = hits.length - linkedCount;

  return (
    <div className="overflow-hidden rounded-lg border border-background-200 bg-white">
      {/* 件数（検索結果件数を主、紐付け内訳を補助テキストとして同じ行に置く） */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-background-200 px-4 py-2.5">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] text-foreground-600">
          <span>
            検索結果{" "}
            <span className="text-sm font-semibold tabular-nums text-foreground-950">
              {hits.length}
            </span>{" "}
            件
          </span>
          <span className="text-[11px] text-foreground-400">
            紐付け済み {linkedCount} 件 / 未紐付け {unlinkedCount} 件
          </span>
          {hits.length >= 100 && (
            <span className="text-[11px] text-foreground-500">
              上限100件まで表示しています。条件を追加してください。
            </span>
          )}
        </p>
      </div>

      {/* ヘッダー行（デスクトップ） */}
      <div className="hidden items-center gap-3 border-b border-background-200 bg-white px-4 py-2 lg:flex">
        <span className={`w-[108px] shrink-0 ${HEAD_CELL}`}>受付番号</span>
        <span className={`min-w-0 flex-1 ${HEAD_CELL}`}>品目 / 書類</span>
        <span className={`w-[116px] shrink-0 ${HEAD_CELL}`}>仕入先</span>
        <span className={`w-[92px] shrink-0 text-right ${HEAD_CELL}`}>
          商品代金
        </span>
        <span className={`w-[92px] shrink-0 text-right ${HEAD_CELL}`}>
          落札手数料
        </span>
        <span className={`w-[124px] shrink-0 ${HEAD_CELL}`}>紐付け状態</span>
        <span className={`w-[132px] shrink-0 ${HEAD_CELL}`}>操作</span>
      </div>

      <ul>
        {hits.map((hit) => {
          const linked = hit.linked_product_ids.length > 0;
          const detailPath = lineDetailPath(hit);
          const itemLabel = hit.item_name || "（品目なし）";
          return (
            <li
              key={hit.line_id}
              className="border-b border-background-100 transition-colors last:border-b-0 hover:bg-background-50"
            >
              {/* デスクトップ */}
              <div className="hidden items-center gap-3 px-4 py-3 lg:flex lg:min-h-[76px]">
                <span className="w-[108px] shrink-0">
                  {hit.reception_number ? (
                    <span className="whitespace-nowrap font-mono text-[12px] tabular-nums text-foreground-700">
                      {hit.reception_number}
                    </span>
                  ) : (
                    <span className="text-[11px] text-foreground-400">
                      受付番号なし
                    </span>
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <Link
                    to={detailPath}
                    className="block min-w-0 cursor-pointer"
                    title={itemLabel}
                  >
                    <span className="line-clamp-2 break-words text-[13px] font-medium leading-snug text-foreground-950 hover:text-primary-700">
                      {itemLabel}
                    </span>
                  </Link>
                  <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-foreground-400">
                    {hit.brand_name && (
                      <span className="shrink-0 text-foreground-500">
                        {hit.brand_name}
                      </span>
                    )}
                    <span className="min-w-0 truncate">
                      {hit.document_file_name || "（書類名なし）"}
                      {hit.line_number ? ` / 明細 ${hit.line_number}` : ""}
                    </span>
                  </span>
                </div>

                <span className="w-[116px] shrink-0 truncate text-[12px] text-foreground-600">
                  {hit.supplier_name || "—"}
                </span>
                <span className="w-[92px] shrink-0 whitespace-nowrap text-right text-[12px] font-medium tabular-nums text-foreground-900">
                  {formatYen(hit.item_amount)}
                </span>
                <span className="w-[92px] shrink-0 whitespace-nowrap text-right text-[12px] font-medium tabular-nums text-foreground-600">
                  {formatYen(hit.fee_amount)}
                </span>

                <span className="w-[124px] shrink-0">
                  {linked ? (
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-foreground-700">
                        <i className="ri-link w-3 h-3 flex items-center justify-center"></i>
                        紐付け済み
                        {hit.linked_product_ids.length > 1 && (
                          <span className="tabular-nums text-foreground-400">
                            +{hit.linked_product_ids.length - 1}
                          </span>
                        )}
                      </span>
                      <span className="truncate font-mono text-[11px] tabular-nums text-foreground-400">
                        {hit.linked_product_ids.join(", ")}
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-foreground-500">
                      <i className="ri-link-unlink-m w-3 h-3 flex items-center justify-center"></i>
                      未紐付け
                    </span>
                  )}
                </span>

                <div className="flex w-[132px] shrink-0 items-center gap-1.5">
                  <Link
                    to={detailPath}
                    title="明細を開く"
                    aria-label={`${itemLabel} の明細を開く`}
                    className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-foreground-800 transition-colors hover:border-background-400 hover:bg-background-50"
                  >
                    明細を開く
                    <i className="ri-arrow-right-s-line w-3.5 h-3.5 flex items-center justify-center"></i>
                  </Link>
                  {hit.drive_url ? (
                    <a
                      href={hit.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-background-300 bg-white text-foreground-600 transition-colors hover:border-background-400 hover:bg-background-50 hover:text-foreground-900"
                      title="原本PDFを開く"
                      aria-label={`${itemLabel} の原本PDFを開く`}
                    >
                      <i className="ri-file-pdf-2-line w-4 h-4 flex items-center justify-center"></i>
                    </a>
                  ) : (
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-background-200 text-foreground-300"
                      title="原本PDFは未登録です"
                      aria-label="原本PDFは未登録です"
                    >
                      <i className="ri-file-pdf-2-line w-4 h-4 flex items-center justify-center"></i>
                    </span>
                  )}
                </div>
              </div>

              {/* モバイル */}
              <div className="flex flex-col gap-1.5 px-4 py-3 lg:hidden">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {hit.reception_number ? (
                    <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-foreground-600">
                      {hit.reception_number}
                    </span>
                  ) : (
                    <span className="text-[11px] text-foreground-400">
                      受付番号なし
                    </span>
                  )}
                  {linked ? (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-foreground-500">
                      <i className="ri-link w-3 h-3 flex items-center justify-center"></i>
                      紐付け済み
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-foreground-500">
                      <i className="ri-link-unlink-m w-3 h-3 flex items-center justify-center"></i>
                      未紐付け
                    </span>
                  )}
                </div>
                <Link
                  to={detailPath}
                  className="line-clamp-2 cursor-pointer break-words text-[13px] font-medium leading-snug text-foreground-950 hover:text-primary-700"
                >
                  {itemLabel}
                </Link>
                <p className="truncate text-[11px] text-foreground-400">
                  {hit.supplier_name || "仕入先不明"} /{" "}
                  {hit.document_file_name || "書類名なし"}
                  {hit.line_number ? ` / 明細 ${hit.line_number}` : ""}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-foreground-500">
                  <span className="inline-flex items-baseline gap-1">
                    商品代金
                    <span className="font-medium tabular-nums text-foreground-900">
                      {formatYen(hit.item_amount)}
                    </span>
                  </span>
                  <span className="inline-flex items-baseline gap-1">
                    落札手数料
                    <span className="font-medium tabular-nums text-foreground-900">
                      {formatYen(hit.fee_amount)}
                    </span>
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <Link
                    to={detailPath}
                    title="明細を開く"
                    aria-label={`${itemLabel} の明細を開く`}
                    className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-foreground-800 transition-colors hover:border-background-400 hover:bg-background-50"
                  >
                    明細を開く
                    <i className="ri-arrow-right-s-line w-3.5 h-3.5 flex items-center justify-center"></i>
                  </Link>
                  {hit.drive_url ? (
                    <a
                      href={hit.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-2 text-[11px] font-medium text-foreground-600 transition-colors hover:border-background-400 hover:bg-background-50 hover:text-foreground-900"
                      title="原本PDFを開く"
                      aria-label={`${itemLabel} の原本PDFを開く`}
                    >
                      <i className="ri-file-pdf-2-line w-4 h-4 flex items-center justify-center"></i>
                      原本
                    </a>
                  ) : (
                    <span
                      className="inline-flex h-7 items-center justify-center rounded-md border border-background-200 px-2 text-[11px] text-foreground-300"
                      aria-label="原本PDFは未登録です"
                    >
                      <i className="ri-file-pdf-2-line w-4 h-4 flex items-center justify-center"></i>
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}