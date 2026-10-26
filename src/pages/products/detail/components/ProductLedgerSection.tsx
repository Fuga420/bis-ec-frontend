import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DocumentLedgerApiError,
  fetchProductCostDetail,
  unlinkProductManual,
  type ProductCostDetail,
  type ProductCostLinkDetail,
} from "@/pages/documents/lib/documentLedgerApi";
import ProductLedgerLinker from "./ProductLedgerLinker";
import LedgerOverview from "./LedgerOverview";
import LedgerDocumentList from "./LedgerDocumentList";

interface ProductLedgerSectionProps {
  productId: string;
  // 紐付け確認の表示用（任意）
  productName?: string;
  // 販売予定価格（概算利益の算出に使う。未設定なら利益は表示しない）
  plannedSalePrice: number | null | undefined;
}

type LoadState = "loading" | "success" | "error";

/**
 * 商品詳細の「仕入内訳（書類台帳）」。
 *
 * documents-relay の get_product_cost を使い、紐付いた書類明細の
 * 仕入先・受付番号・商品代金・落札手数料・原本PDFリンクを表示する。
 * 金額は税額の厳密な配分を行わないため、利益は「概算」と明記する。
 *
 * 表示は「仕入れ概要（数字）」と「紐付け書類（一覧・操作）」の2ブロックに分ける。
 */
export default function ProductLedgerSection({
  productId,
  productName,
  plannedSalePrice,
}: ProductLedgerSectionProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [detail, setDetail] = useState<ProductCostDetail | null>(null);
  const [errorText, setErrorText] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  // スタッフ用の明細検索パネルの開閉
  const [linkerOpen, setLinkerOpen] = useState(false);
  // 解除の確認対象（link_id）と実行中フラグ
  const [unlinkTarget, setUnlinkTarget] = useState<string | null>(null);
  const [unlinkBusy, setUnlinkBusy] = useState<string | null>(null);
  const [unlinkError, setUnlinkError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setErrorText("");
    fetchProductCostDetail(productId)
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
        setLoadState("success");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setErrorText(
          e instanceof DocumentLedgerApiError
            ? e.message
            : "仕入内訳を取得できませんでした。"
        );
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [productId, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  // 紐付け確定・解除のあとは仕入内訳を再取得する。
  const handleChanged = useCallback(() => {
    setUnlinkTarget(null);
    setUnlinkError("");
    setReloadKey((k) => k + 1);
  }, []);

  const handleUnlink = useCallback(async (linkId: string) => {
    setUnlinkBusy(linkId);
    setUnlinkError("");
    setNotice("");
    try {
      await unlinkProductManual(linkId);
      setUnlinkTarget(null);
      setNotice("紐付けを解除しました。");
      setReloadKey((k) => k + 1);
    } catch (e: unknown) {
      setUnlinkError(
        e instanceof DocumentLedgerApiError
          ? e.message
          : "紐付けの解除に失敗しました。時間をおいて再度お試しください。"
      );
    } finally {
      setUnlinkBusy(null);
    }
  }, []);

  const links: ProductCostLinkDetail[] = detail?.links ?? [];
  const hasLinks = links.length > 0;

  // 金額は「リンクの割当金額（allocated_amount）」ではなく、明細の内訳列から集計する。
  // ・商品代金  = item_amount（税抜）
  // ・落札手数料 = fee_amount（税抜）
  // ・税額      = tax_amount / fee_tax_amount（商品代金・手数料には混ぜない）
  // 同一明細に複数の紐付け（分割・手数料の別リンク等）があっても二重計上しないよう、
  // 明細ID単位に1件へまとめてから合計する。
  const uniqueLines = useMemo(() => {
    const map = new Map<string, ProductCostLinkDetail>();
    for (const link of links) {
      const key = link.line_id || link.link_id;
      if (!map.has(key)) map.set(key, link);
    }
    return Array.from(map.values());
  }, [links]);

  const isOtherExpenseLine = (link: ProductCostLinkDetail): boolean =>
    link.transaction_type === "shipping" ||
    link.transaction_type === "other_expense" ||
    link.transaction_type === "participation_fee" ||
    link.transaction_type === "unsold_fee";

  const itemTotal = uniqueLines.reduce(
    (sum, link) => sum + (link.item_amount ?? 0),
    0
  );
  const feeTotal = uniqueLines.reduce(
    (sum, link) => sum + (link.fee_amount ?? 0),
    0
  );
  const itemTaxTotal = uniqueLines.reduce(
    (sum, link) => sum + (link.tax_amount ?? 0),
    0
  );
  const feeTaxTotal = uniqueLines.reduce(
    (sum, link) => sum + (link.fee_tax_amount ?? 0),
    0
  );
  const taxTotal = itemTaxTotal + feeTaxTotal;

  // 内訳が取得できていない列は「0円」と断定せず「—」で表示を保留する（再入力を促さない）。
  const hasItemBreakdown = uniqueLines.some(
    (link) => link.item_amount !== null
  );
  const hasFeeBreakdown = uniqueLines.some((link) => link.fee_amount !== null);
  const hasTaxBreakdown = uniqueLines.some(
    (link) => link.tax_amount !== null || link.fee_tax_amount !== null
  );

  // 送料・その他経費は商品代金／手数料の内訳を持たないため、明細金額をそのまま使う。
  const otherTotal = uniqueLines.reduce((sum, link) => {
    const hasBreakdown =
      link.item_amount !== null || link.fee_amount !== null;
    if (hasBreakdown || !isOtherExpenseLine(link)) return sum;
    return sum + (link.total_line_amount ?? 0);
  }, 0);

  // 内訳（商品代金・手数料）が未取得の明細。金額は原価に含めるが、商品代金としては表示しない。
  const unknownBreakdownTotal = uniqueLines.reduce((sum, link) => {
    const hasBreakdown =
      link.item_amount !== null || link.fee_amount !== null;
    if (hasBreakdown || isOtherExpenseLine(link)) return sum;
    return sum + (link.total_line_amount ?? 0);
  }, 0);
  const hasUnknownBreakdown = unknownBreakdownTotal > 0;

  // 仕入原価（概算）: 商品代金＋落札手数料＋税額＋送料その他（それぞれ1回だけ）。
  const costTotal =
    itemTotal + feeTotal + taxTotal + otherTotal + unknownBreakdownTotal;

  const price = Number(plannedSalePrice) || 0;
  const canShowProfit = price > 0 && hasLinks;
  const profit = price - costTotal;
  const profitRate = price > 0 ? (profit / price) * 100 : 0;

  return (
    <div className="mt-4 flex flex-col gap-4">
      <LedgerOverview
        loading={loadState === "loading"}
        hasLinks={hasLinks}
        itemTotal={itemTotal}
        hasItemBreakdown={hasItemBreakdown}
        feeTotal={feeTotal}
        hasFeeBreakdown={hasFeeBreakdown}
        taxTotal={taxTotal}
        hasTaxBreakdown={hasTaxBreakdown}
        itemTaxTotal={itemTaxTotal}
        feeTaxTotal={feeTaxTotal}
        costTotal={costTotal}
        otherTotal={otherTotal}
        unknownBreakdownTotal={unknownBreakdownTotal}
        hasUnknownBreakdown={hasUnknownBreakdown}
        canShowProfit={canShowProfit}
        profit={profit}
        profitRate={profitRate}
      />

      <LedgerDocumentList
        loading={loadState === "loading"}
        errorText={loadState === "error" ? errorText : ""}
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