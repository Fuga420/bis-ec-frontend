import type {
  ProductCostDetail,
  ProductCostLinkDetail,
} from "@/pages/documents/lib/documentLedgerApi";

/**
 * 商品詳細の仕入原価の集計ロジック（表示専用）。
 *
 * 商品詳細の下部「仕入・書類」と上部サマリーの両方が、この1つの関数の結果だけを使う。
 * 同じ明細・同じ税額・同じ手数料を画面ごとに別々に足し直さないため、
 * 上下で金額が食い違うことがない（二重加算もしない）。
 *
 * 集計ルール（既存の下部表示をそのまま踏襲する）:
 *  - 商品代金   = item_amount（税抜）
 *  - 落札手数料 = fee_amount（税抜）
 *  - 税額       = tax_amount / fee_tax_amount（商品代金・手数料には混ぜない）
 *  - 送料・その他経費 = 内訳を持たない明細の total_line_amount
 *  - 内訳未取得の明細 = total_line_amount を仕入原価にだけ算入する
 * 同一明細に複数の紐付け（分割・手数料の別リンク等）があっても二重計上しないよう、
 * 明細ID単位に1件へまとめてから合計する。
 */
export const OTHER_EXPENSE_TRANSACTION_TYPES = [
  "shipping",
  "other_expense",
  "participation_fee",
  "unsold_fee",
];

export function isOtherExpenseLine(link: ProductCostLinkDetail): boolean {
  return OTHER_EXPENSE_TRANSACTION_TYPES.includes(link.transaction_type);
}

export interface ProductCostView {
  hasLinks: boolean;
  /** 金額として表示できる値があるか（紐付けはあるが金額が未取得の場合と区別する） */
  hasCostAmount: boolean;
  uniqueLines: ProductCostLinkDetail[];

  itemTotal: number;
  feeTotal: number;
  itemTaxTotal: number;
  feeTaxTotal: number;
  taxTotal: number;

  hasItemBreakdown: boolean;
  hasFeeBreakdown: boolean;
  hasTaxBreakdown: boolean;

  otherTotal: number;
  unknownBreakdownTotal: number;
  hasUnknownBreakdown: boolean;

  /** 仕入原価（概算）: 商品代金＋落札手数料＋税額＋送料その他＋内訳未取得分 */
  costTotal: number;

  /** 税額が確認できていない明細を含むか（含む場合は概算であることを明示する） */
  hasUnconfirmedTax: boolean;
}

export function deriveProductCost(
  detail: ProductCostDetail | null
): ProductCostView {
  const links = detail?.links ?? [];
  const hasLinks = links.length > 0;

  const map = new Map<string, ProductCostLinkDetail>();
  for (const link of links) {
    const key = link.line_id || link.link_id;
    if (!map.has(key)) map.set(key, link);
  }
  const uniqueLines = Array.from(map.values());

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

  const hasItemBreakdown = uniqueLines.some(
    (link) => link.item_amount !== null
  );
  const hasFeeBreakdown = uniqueLines.some((link) => link.fee_amount !== null);
  const hasTaxBreakdown = uniqueLines.some(
    (link) => link.tax_amount !== null || link.fee_tax_amount !== null
  );

  const otherTotal = uniqueLines.reduce((sum, link) => {
    const hasBreakdown = link.item_amount !== null || link.fee_amount !== null;
    if (hasBreakdown || !isOtherExpenseLine(link)) return sum;
    return sum + (link.total_line_amount ?? 0);
  }, 0);

  const unknownBreakdownTotal = uniqueLines.reduce((sum, link) => {
    const hasBreakdown = link.item_amount !== null || link.fee_amount !== null;
    if (hasBreakdown || isOtherExpenseLine(link)) return sum;
    return sum + (link.total_line_amount ?? 0);
  }, 0);
  const hasUnknownBreakdown = unknownBreakdownTotal > 0;

  const costTotal =
    itemTotal + feeTotal + taxTotal + otherTotal + unknownBreakdownTotal;

  // 内訳を持つ列（商品代金・手数料）に対して税額が未取得の明細があるか。
  const hasUnconfirmedTax = uniqueLines.some((link) => {
    if (link.item_amount !== null && link.tax_amount === null) return true;
    if (link.fee_amount !== null && link.fee_tax_amount === null) return true;
    return false;
  });

  const hasCostAmount = uniqueLines.some(
    (link) =>
      link.item_amount !== null ||
      link.fee_amount !== null ||
      link.tax_amount !== null ||
      link.fee_tax_amount !== null ||
      link.total_line_amount !== null
  );

  return {
    hasLinks,
    hasCostAmount: hasLinks && hasCostAmount,
    uniqueLines,
    itemTotal,
    feeTotal,
    itemTaxTotal,
    feeTaxTotal,
    taxTotal,
    hasItemBreakdown,
    hasFeeBreakdown,
    hasTaxBreakdown,
    otherTotal,
    unknownBreakdownTotal,
    hasUnknownBreakdown,
    costTotal,
    hasUnconfirmedTax,
  };
}