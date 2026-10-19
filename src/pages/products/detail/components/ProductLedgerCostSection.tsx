import { useEffect, useState } from "react";
import {
  fetchProductCost,
  type ProductCostResult,
} from "@/pages/documents/lib/documentLedgerApi";

interface ProductLedgerCostSectionProps {
  productId: string;
}

export default function ProductLedgerCostSection({
  productId,
}: ProductLedgerCostSectionProps) {
  const [costData, setCostData] = useState<ProductCostResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    setLoading(true);
    fetchProductCost(productId)
      .then((res) => {
        if (!cancelled) setCostData(res);
      })
      .catch((err) => {
        console.warn("書類原価の取得エラー:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const breakdown = costData?.cost_breakdown;
  const links = costData?.links ?? [];
  const hasLinks = links.length > 0;

  if (loading && !costData) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-foreground-400">
        <i className="ri-loader-4-line animate-spin w-3.5 h-3.5"></i>
        <span>仕入書類・原価内訳を取得中...</span>
      </div>
    );
  }

  if (!hasLinks) {
    return (
      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground-500">
          <i className="ri-file-list-3-line w-3.5 h-3.5 flex items-center justify-center text-primary-600"></i>
          仕入書類・原価内訳（書類台帳連携）
        </p>
        <p className="mt-1.5 text-xs text-foreground-400">
          仕入書類の紐付けはありません（書類詳細画面から受付番号で紐付け可能です）。
        </p>
      </div>
    );
  }

  const primaryCost = Number(breakdown?.total_primary_cost ?? 0);
  const commissionFee = Number(breakdown?.total_commission_fee ?? 0);
  const totalAllocated = Number(breakdown?.total_allocated_cost ?? 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground-900">
          <i className="ri-scales-3-line w-3.5 h-3.5 flex items-center justify-center text-primary-600"></i>
          仕入書類・原価内訳（書類台帳連携）
        </p>
        <span className="rounded bg-primary-100 px-2 py-0.5 text-[10px] font-bold text-primary-700">
          照合済み ({links.length}件)
        </span>
      </div>

      {/* 原価内訳カード */}
      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-background-200 bg-background-50 p-2.5">
          <span className="text-[11px] font-medium text-foreground-500">
            商品代金（税込）
          </span>
          <p className="mt-0.5 font-mono text-sm font-bold text-foreground-900">
            ¥{primaryCost.toLocaleString("ja-JP")}
          </p>
        </div>
        <div className="rounded-lg border border-background-200 bg-background-50 p-2.5">
          <span className="text-[11px] font-medium text-foreground-500">
            落札手数料（税込）
          </span>
          <p className="mt-0.5 font-mono text-sm font-bold text-foreground-900">
            ¥{commissionFee.toLocaleString("ja-JP")}
          </p>
        </div>
        <div className="rounded-lg border border-primary-200 bg-primary-50/50 p-2.5">
          <span className="text-[11px] font-bold text-primary-700">
            合計仕入原価
          </span>
          <p className="mt-0.5 font-mono text-sm font-bold text-primary-800">
            ¥{totalAllocated.toLocaleString("ja-JP")}
          </p>
        </div>
      </div>

      {/* 紐付け明細一覧 */}
      <div className="mt-2.5 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-foreground-500">
          紐付け済み明細
        </span>
        {links.map((link) => {
          const isPrimary = link.link_type === "primary_cost";
          const typeLabel = isPrimary
            ? "商品代金"
            : link.link_type === "commission"
            ? "落札手数料"
            : String(link.link_type);
          const amount = Number(link.allocated_amount ?? 0);
          return (
            <div
              key={String(link.id)}
              className="flex items-center justify-between rounded border border-background-200 bg-white px-2.5 py-1.5 text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    isPrimary
                      ? "border border-blue-200 bg-blue-50 text-blue-700"
                      : "border border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {typeLabel}
                </span>
                <span className="font-mono text-[11px] text-foreground-600">
                  明細ID: {String(link.document_line_id ?? link.id).slice(0, 8)}...
                </span>
              </div>
              <span className="font-mono font-semibold text-foreground-900">
                ¥{amount.toLocaleString("ja-JP")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
