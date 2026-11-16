import { memo } from "react";
import { Link } from "react-router-dom";
import ProductThumbnail from "@/pages/products/components/ProductThumbnail";
import type {
  PokecaLightResultRow,
  PokecaLightResultStatus,
} from "@/pages/products/lib/pokecaLightResult";

const STATUS_LABELS: Record<PokecaLightResultStatus, string> = {
  success: "成功",
  failed: "失敗",
  skipped: "スキップ",
  pending: "未完了",
};

const STATUS_STYLES: Record<PokecaLightResultStatus, string> = {
  success: "text-primary-700",
  failed: "text-amber-700",
  skipped: "text-foreground-500",
  pending: "text-foreground-400",
};

interface PokecaLightResultRowViewProps {
  row: PokecaLightResultRow;
  /** 一覧から取得できたサムネイルURL（取得できない場合は空文字） */
  imageUrl: string;
}

function formatPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return value.toLocaleString("ja-JP");
}

/**
 * ライト版AIの結果リスト1行。
 * サムネイル・商品ID・商品名・カード情報・作家・参考価格・結果を表示する。
 */
function PokecaLightResultRowView({
  row,
  imageUrl,
}: PokecaLightResultRowViewProps) {
  const price = formatPrice(row.candidatePrice);
  const cardLine = [row.cardName, row.cardNumber].filter(Boolean).join(" / ");

  return (
    <div className="flex items-start gap-3 border-b border-background-200/70 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-background-50 md:px-6">
      <span className="w-10 shrink-0 pt-0.5">
        <ProductThumbnail
          src={imageUrl}
          alt={`${row.productName || row.productId}のサムネイル`}
          size="sm"
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p
            className={`min-w-0 max-w-full truncate text-[13px] font-medium leading-snug ${
              row.productName ? "text-foreground-900" : "text-foreground-400"
            }`}
          >
            {row.productName || "（商品名未取得）"}
          </p>
          <span className="admin-numeric shrink-0 text-[11px] leading-none text-foreground-400">
            {row.productId}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-snug">
          <span className="min-w-0 max-w-full truncate text-foreground-700">
            {cardLine ? (
              cardLine
            ) : (
              <span className="text-foreground-300">カード情報なし</span>
            )}
          </span>
          <span className="min-w-0 max-w-[160px] truncate text-foreground-600">
            {row.illustrator || (
              <span className="text-foreground-300">作家なし</span>
            )}
          </span>
          <span className="admin-numeric whitespace-nowrap">
            {price ? (
              <span className="font-medium text-foreground-900">
                参考価格 ¥{price}
              </span>
            ) : row.priceKnown ? (
              <span className="text-foreground-400">価格なし</span>
            ) : (
              // 一覧の商品データと突き合わせできない行は「価格なし」と断定しない
              <span className="text-foreground-400">—</span>
            )}
          </span>
        </div>

        {row.errorMessage && (
          <p className="mt-1 line-clamp-2 break-words text-[11px] leading-relaxed text-amber-800">
            {row.errorMessage}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        <span
          className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium leading-none ${
            STATUS_STYLES[row.status]
          }`}
        >
          {row.status === "pending" && (
            <i className="ri-loader-4-line flex h-3 w-3 animate-spin items-center justify-center text-[12px]"></i>
          )}
          {STATUS_LABELS[row.status]}
        </span>
        <Link
          to={`/products/${row.productId}`}
          className="inline-flex cursor-pointer items-center gap-0.5 whitespace-nowrap text-[11px] leading-none text-foreground-500 transition-colors hover:text-primary-700 hover:underline"
        >
          商品を開く
          <i className="ri-arrow-right-s-line flex h-3 w-3 items-center justify-center text-[12px]"></i>
        </Link>
      </div>
    </div>
  );
}

export default memo(PokecaLightResultRowView);