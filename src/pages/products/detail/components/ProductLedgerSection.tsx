import { useCallback, useState } from "react";
import {
  DocumentLedgerApiError,
  unlinkProductManual,
} from "@/pages/documents/lib/documentLedgerApi";
import type { ProductCostDetail } from "@/pages/documents/lib/documentLedgerApi";
import type { ProductCostLoadState } from "../hooks/useProductCostDetail";
import { deriveProductCost } from "../lib/productCost";
import ProductLedgerLinker from "./ProductLedgerLinker";
import LedgerOverview from "./LedgerOverview";
import LedgerDocumentList from "./LedgerDocumentList";

interface ProductLedgerSectionProps {
  productId: string;
  // 紐付け確認の表示用（任意）
  productName?: string;
  // 販売予定価格（概算利益の算出に使う。未設定なら利益は表示しない）
  plannedSalePrice: number | null | undefined;
  // 商品詳細ページが取得した確定済み仕入原価（上部サマリーと同じ取得結果）。
  costDetail: ProductCostDetail | null;
  costLoadState: ProductCostLoadState;
  costErrorText: string;
  // 紐付け確定・解除のあとに原価を取り直す（上部の表示も同時に更新する）。
  onReloadCost: () => void;
  // 仕入台帳の商品番号による自動照合の結果（商品登録・編集の成否とは別に表示する）。
  autoLinkNotice?: AutoLinkNotice | null;
  onDismissAutoLinkNotice?: () => void;
}

export interface AutoLinkNotice {
  tone: "success" | "warning" | "error";
  text: string;
  // 既存の「明細を探して紐付け」へ進むべきか（自動では紐付けていない）
  needsManualLink: boolean;
}

/**
 * 商品詳細の「仕入内訳（書類台帳）」。
 *
 * 取得は商品詳細ページ（useProductCostDetail）が1回だけ行い、上部サマリーと
 * このセクションが同じ結果を使う。ここでは取得し直さない。
 * 金額の集計は deriveProductCost に集約し、上部の「仕入原価（概算）」と同じ値になる。
 */
export default function ProductLedgerSection({
  productId,
  productName,
  plannedSalePrice,
  costDetail,
  costLoadState,
  costErrorText,
  onReloadCost,
  autoLinkNotice = null,
  onDismissAutoLinkNotice,
}: ProductLedgerSectionProps) {
  // スタッフ用の明細検索パネルの開閉
  const [linkerOpen, setLinkerOpen] = useState(false);
  // 解除の確認対象（link_id）と実行中フラグ
  const [unlinkTarget, setUnlinkTarget] = useState<string | null>(null);
  const [unlinkBusy, setUnlinkBusy] = useState<string | null>(null);
  const [unlinkError, setUnlinkError] = useState("");
  const [notice, setNotice] = useState("");

  const retry = useCallback(() => onReloadCost(), [onReloadCost]);

  // 紐付け確定・解除のあとは仕入内訳を再取得する。
  const handleChanged = useCallback(() => {
    setUnlinkTarget(null);
    setUnlinkError("");
    onReloadCost();
  }, [onReloadCost]);

  const handleUnlink = useCallback(
    async (linkId: string) => {
      setUnlinkBusy(linkId);
      setUnlinkError("");
      setNotice("");
      try {
        await unlinkProductManual(linkId);
        setUnlinkTarget(null);
        setNotice("紐付けを解除しました。");
        onReloadCost();
      } catch (e: unknown) {
        setUnlinkError(
          e instanceof DocumentLedgerApiError
            ? e.message
            : "紐付けの解除に失敗しました。時間をおいて再度お試しください。"
        );
      } finally {
        setUnlinkBusy(null);
      }
    },
    [onReloadCost]
  );

  const cost = deriveProductCost(costDetail);
  const links = costDetail?.links ?? [];

  const price = Number(plannedSalePrice) || 0;
  const canShowProfit = price > 0 && cost.hasLinks;
  const profit = price - cost.costTotal;
  const profitRate = price > 0 ? (profit / price) * 100 : 0;

  return (
    <div className="mt-4 flex flex-col gap-4">
      {/* 自動照合の結果（商品の登録・編集の成否とは別に表示する） */}
      {autoLinkNotice && (
        <div
          className={`rounded-[10px] border bg-white px-3.5 py-3 ${
            autoLinkNotice.tone === "success"
              ? "border-primary-200"
              : autoLinkNotice.tone === "error"
                ? "border-background-300"
                : "border-amber-300"
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-2">
            <i
              className={`mt-0.5 w-4 h-4 flex items-center justify-center ${
                autoLinkNotice.tone === "success"
                  ? "ri-link text-primary-600"
                  : autoLinkNotice.tone === "error"
                    ? "ri-information-line text-foreground-500"
                    : "ri-error-warning-line text-amber-600"
              }`}
            ></i>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] leading-relaxed text-foreground-800">
                {autoLinkNotice.text}
              </p>
              {autoLinkNotice.needsManualLink && (
                <p className="mt-1 text-[11px] leading-relaxed text-foreground-500">
                  自動で別の明細を選んだり、既存の紐付けを付け替えたりはしていません。下の「明細を探して紐付け」から手動で紐付けてください。
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {autoLinkNotice.needsManualLink && (
                  <button
                    type="button"
                    onClick={() => {
                      setLinkerOpen(true);
                      setNotice("");
                      setUnlinkError("");
                    }}
                    className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-white px-3 py-1.5 text-xs font-bold text-foreground-800 transition-colors hover:bg-background-100"
                  >
                    <i className="ri-search-line w-4 h-4 flex items-center justify-center"></i>
                    明細を探して紐付け
                  </button>
                )}
                {onDismissAutoLinkNotice && (
                  <button
                    type="button"
                    onClick={onDismissAutoLinkNotice}
                    className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-2 py-1.5 text-[11px] font-medium text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-700"
                  >
                    閉じる
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <LedgerOverview
        loading={costLoadState === "loading"}
        hasLinks={cost.hasLinks}
        hasCostAmount={cost.hasCostAmount}
        itemTotal={cost.itemTotal}
        hasItemBreakdown={cost.hasItemBreakdown}
        feeTotal={cost.feeTotal}
        hasFeeBreakdown={cost.hasFeeBreakdown}
        taxTotal={cost.taxTotal}
        hasTaxBreakdown={cost.hasTaxBreakdown}
        itemTaxTotal={cost.itemTaxTotal}
        feeTaxTotal={cost.feeTaxTotal}
        costTotal={cost.costTotal}
        otherTotal={cost.otherTotal}
        unknownBreakdownTotal={cost.unknownBreakdownTotal}
        hasUnknownBreakdown={cost.hasUnknownBreakdown}
        canShowProfit={canShowProfit}
        profit={profit}
        profitRate={profitRate}
      />

      <LedgerDocumentList
        loading={costLoadState === "loading"}
        errorText={costLoadState === "error" ? costErrorText : ""}
        onRetry={retry}
        links={links}
        notice={notice}
        unlinkError={unlinkError}
        unlinkingId={unlinkBusy}
        unlinkTargetId={unlinkTarget}
        onAskUnlink={(linkId) => {
          setUnlinkTarget(linkId);
          setUnlinkError("");
          setNotice("");
        }}
        onCancelUnlink={() => setUnlinkTarget(null)}
        onConfirmUnlink={(linkId) => void handleUnlink(linkId)}
        linkerOpen={linkerOpen}
        onToggleLinker={() => {
          setLinkerOpen((open) => !open);
          setNotice("");
          setUnlinkError("");
        }}
        linker={
          <ProductLedgerLinker
            productId={productId}
            productName={productName}
            onChanged={() => {
              setNotice("仕入明細を紐付けました。");
              handleChanged();
            }}
          />
        }
      />
    </div>
  );
}