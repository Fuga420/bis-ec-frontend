import { Link } from "react-router-dom";
import type { DocumentLineSearchHit } from "@/pages/documents/types";

interface SupplyLineSearchResultsProps {
  hits: DocumentLineSearchHit[];
  // 検索条件をクリアする
  onClear: () => void;
}

function formatYen(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `¥${Number(value).toLocaleString("ja-JP")}`;
}

// 明細は書類詳細の該当行へ直接移動する（?line= で強調表示）。
function lineDetailPath(hit: DocumentLineSearchHit): string {
  return `/documents/${hit.document_id}?line=${encodeURIComponent(hit.line_id)}`;
}

/**
 * 仕入明細検索の結果一覧（明細単位）。
 *
 * 各行から書類詳細の該当明細を開き、既存の商品検索・手動紐付け・解除へ進む。
 * ここでは自動照合は行わない（候補の提示のみ）。
 */
export default function SupplyLineSearchResults({
  hits,
  onClear,
}: SupplyLineSearchResultsProps) {
  const linkedCount = hits.filter((hit) => hit.linked_product_ids.length > 0).length;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-background-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-background-200 bg-background-50 px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-[12px] font-medium text-foreground-600">
            候補{" "}
            <span className="text-sm font-bold tabular-nums text-foreground-950">
              {hits.length}
            </span>{" "}
            件
          </p>
          <span className="text-[11px] text-foreground-400">
            紐付け済み {linkedCount} 件 / 未紐付け {hits.length - linkedCount} 件
          </span>
          {hits.length >= 100 && (
            <span className="text-[11px] font-medium text-amber-700">
              上限100件まで表示しています。条件を追加してください。
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium text-foreground-500 transition-colors hover:bg-background-200 hover:text-foreground-800"
        >
          <i className="ri-close-line w-3.5 h-3.5 flex items-center justify-center"></i>
          検索条件をクリア
        </button>
      </div>

      {/* ヘッダー行（デスクトップ） */}
      <div className="hidden items-center gap-3 border-b border-background-200 bg-white px-3.5 py-2 lg:flex">
        <span className="w-[104px] shrink-0 text-[11px] font-medium text-foreground-500">
          受付番号
        </span>
        <span className="min-w-0 flex-1 text-[11px] font-medium text-foreground-500">
          品目 / 書類
        </span>
        <span className="w-[110px] shrink-0 text-[11px] font-medium text-foreground-500">
          仕入先
        </span>
        <span className="w-[92px] shrink-0 text-right text-[11px] font-medium text-foreground-500">
          商品代金
        </span>
        <span className="w-[92px] shrink-0 text-right text-[11px] font-medium text-foreground-500">
          落札手数料
        </span>
        <span className="w-[132px] shrink-0 text-[11px] font-medium text-foreground-500">
          紐付け状態
        </span>
        <span className="w-[136px] shrink-0 text-[11px] font-medium text-foreground-500">
          操作
        </span>
      </div>

      <ul>
        {hits.map((hit) => {
          const linked = hit.linked_product_ids.length > 0;
          return (
            <li
              key={hit.line_id}
              className="border-b border-background-100 transition-colors last:border-b-0 hover:bg-background-50"
            >
              {/* デスクトップ */}
              <div className="hidden items-center gap-3 px-3.5 py-2.5 lg:flex">
                <span className="w-[104px] shrink-0">
                  {hit.reception_number ? (
                    <span className="inline-flex h-[22px] max-w-full items-center whitespace-nowrap rounded-md bg-secondary-100 px-2 font-mono text-[11px] font-bold text-secondary-900">
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
                    to={lineDetailPath(hit)}
                    className="group/item block min-w-0 cursor-pointer"
                  >
                    <span className="block truncate text-[13px] font-medium text-foreground-900 group-hover/item:text-primary-700">
                      {hit.item_name || "（品目なし）"}
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                      {hit.brand_name && (
                        <span className="shrink-0 rounded border border-background-200 bg-background-50 px-1.5 text-[10px] text-foreground-600">
                          {hit.brand_name}
                        </span>
                      )}
                      <span className="truncate text-[11px] text-foreground-400">
                        {hit.document_file_name || "（書類名なし）"}
                        {hit.line_number ? ` / 明細 ${hit.line_number}` : ""}
                      </span>
                    </span>
                  </Link>
                </div>

                <span className="w-[110px] shrink-0 truncate text-[12px] text-foreground-600">
                  {hit.supplier_name || "—"}
                </span>
                <span className="w-[92px] shrink-0 whitespace-nowrap text-right text-[12px] font-semibold tabular-nums text-foreground-950">
                  {formatYen(hit.item_amount)}
                </span>
                <span className="w-[92px] shrink-0 whitespace-nowrap text-right text-[12px] tabular-nums text-foreground-700">
                  {formatYen(hit.fee_amount)}
                </span>

                <span className="w-[132px] shrink-0">
                  {linked ? (
                    <span className="inline-flex max-w-full items-center gap-1 truncate whitespace-nowrap rounded-md bg-primary-100 px-2 py-0.5 font-mono text-[10px] font-bold text-primary-700">
                      <i className="ri-link w-3 h-3 flex items-center justify-center"></i>
                      <span className="truncate">{hit.linked_product_ids[0]}</span>
                      {hit.linked_product_ids.length > 1 && (
                        <span className="shrink-0">
                          +{hit.linked_product_ids.length - 1}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex items-center whitespace-nowrap rounded-md bg-background-100 px-2 py-0.5 text-[10px] font-medium text-foreground-500">
                      未紐付け
                    </span>
                  )}
                </span>

                <div className="flex w-[136px] shrink-0 items-center gap-1.5">
                  <Link
                    to={lineDetailPath(hit)}
                    className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md bg-primary-500 px-2.5 py-1.5 text-[11px] font-semibold text-background-50 transition-colors hover:bg-primary-600"
                  >
                    <i className="ri-link-m w-3.5 h-3.5 flex items-center justify-center"></i>
                    明細を開く
                  </Link>
                  {hit.drive_url ? (
                    <a
                      href={hit.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-1.5 py-1.5 text-[11px] font-medium text-foreground-600 transition-colors hover:border-primary-400 hover:text-primary-700"
                      title="原本を開く"
                      aria-label="原本を開く"
                    >
                      <i className="ri-file-pdf-2-line w-3.5 h-3.5 flex items-center justify-center"></i>
                    </a>
                  ) : (
                    <span className="inline-flex items-center rounded-md border border-background-200 px-1.5 py-1.5 text-[11px] text-foreground-300">
                      <i className="ri-file-pdf-2-line w-3.5 h-3.5 flex items-center justify-center"></i>
                    </span>
                  )}
                </div>
              </div>

              {/* モバイル */}
              <div className="flex flex-col gap-2 px-3.5 py-3 lg:hidden">
                <div className="flex flex-wrap items-center gap-1.5">
                  {hit.reception_number ? (
                    <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-md bg-secondary-100 px-2 font-mono text-[11px] font-bold text-secondary-900">
                      {hit.reception_number}
                    </span>
                  ) : (
                    <span className="text-[11px] text-foreground-400">
                      受付番号なし
                    </span>
                  )}
                  {linked ? (
                    <span className="inline-flex max-w-[160px] items-center gap-1 truncate whitespace-nowrap rounded-md bg-primary-100 px-2 py-0.5 font-mono text-[10px] font-bold text-primary-700">
                      <i className="ri-link w-3 h-3 flex items-center justify-center"></i>
                      <span className="truncate">{hit.linked_product_ids[0]}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center whitespace-nowrap rounded-md bg-background-100 px-2 py-0.5 text-[10px] font-medium text-foreground-500">
                      未紐付け
                    </span>
                  )}
                </div>
                <Link
                  to={lineDetailPath(hit)}
                  className="cursor-pointer text-[13px] font-medium text-foreground-900 hover:text-primary-700"
                >
                  {hit.item_name || "（品目なし）"}
                </Link>
                <p className="truncate text-[11px] text-foreground-400">
                  {hit.supplier_name || "仕入先不明"} /{" "}
                  {hit.document_file_name || "書類名なし"}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-foreground-500">
                    商品代金{" "}
                    <span className="font-semibold tabular-nums text-foreground-950">
                      {formatYen(hit.item_amount)}
                    </span>
                  </span>
                  <span className="text-foreground-500">
                    落札手数料{" "}
                    <span className="font-semibold tabular-nums text-foreground-800">
                      {formatYen(hit.fee_amount)}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={lineDetailPath(hit)}
                    className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md bg-primary-500 px-3 py-1.5 text-[11px] font-semibold text-background-50 transition-colors hover:bg-primary-600"
                  >
                    <i className="ri-link-m w-3.5 h-3.5 flex items-center justify-center"></i>
                    明細を開く
                  </Link>
                  {hit.drive_url && (
                    <a
                      href={hit.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-foreground-600 transition-colors hover:border-primary-400 hover:text-primary-700"
                    >
                      <i className="ri-file-pdf-2-line w-3.5 h-3.5 flex items-center justify-center"></i>
                      原本
                    </a>
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