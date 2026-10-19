/**
 * aucnetParser.ts
 * オークネット ブランドオークション計算書パーサー
 */

import { ParsedInvoiceResult, ParsedDocumentLine } from "./types";

export function parseAucnetInvoice(text: string): ParsedInvoiceResult {
  const result: ParsedInvoiceResult = {
    supplier_name: "オークネット",
    document_number: null,
    member_number: null,
    issue_date: null,
    accounting_date: null,
    invoice_registration_number: null,
    declared_total_claim: 0,
    declared_total_payment: 0,
    declared_net_amount: 0,
    lines: [],
    calculated_total: 0,
    discrepancy: 0,
    is_balanced: false,
    has_text_layer: text && text.trim().length > 50,
    needs_review_reasons: []
  };

  if (!result.has_text_layer) {
    result.needs_review_reasons.push("TEXT_LAYER_MISSING_NEEDS_OCR");
    return result;
  }

  const rawLines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // 1. ヘッダー情報抽出
  for (const line of rawLines) {
    if (!result.document_number) {
      const m = line.match(/計算書番号\s*(\d+)/);
      if (m) result.document_number = m[1];
    }
    if (!result.member_number) {
      const m = line.match(/会員番号[：:]\s*([A-Za-z0-9]+)/);
      if (m) result.member_number = m[1];
    }
    if (!result.accounting_date) {
      const m = line.match(/(\d{4})年(\d{2})月(\d{2})日計上分/);
      if (m) result.accounting_date = `${m[1]}-${m[2]}-${m[3]}`;
    }
    if (!result.issue_date) {
      const m = line.match(/(\d{4})年(\d{2})月(\d{2})日/);
      if (m && !line.includes("計上分")) {
        result.issue_date = `${m[1]}-${m[2]}-${m[3]}`;
      }
    }
    if (!result.invoice_registration_number) {
      const m = line.match(/登録番号\s*[:：]\s*(T\d{13})/);
      if (m) result.invoice_registration_number = m[1];
    }
  }

  // 2. 原本記載のA/B額・今回ご請求額の抽出
  // お支払の部(税込合計) [A]
  const payMatch = text.match(/お支払の部\(税込合計\)[\s\S]*?[￥¥]([\d,]+)/);
  if (payMatch) {
    result.declared_total_payment = parseInt(payMatch[1].replace(/,/g, ""), 10);
  }

  // ご請求の部(税込合計) [B]
  const claimMatch = text.match(/ご請求の部\(税込合計\)[\s\S]*?[￥¥]([\d,]+)/);
  if (claimMatch) {
    result.declared_total_claim = parseInt(claimMatch[1].replace(/,/g, ""), 10);
  }

  // 今回ご請求額 (B + C - A) または オークネットからのお支払額
  const netClaimMatch = text.match(/今回ご請求額[\s\S]*?[￥¥]([\d,]+)/);
  if (netClaimMatch) {
    result.declared_net_amount = parseInt(netClaimMatch[1].replace(/,/g, ""), 10);
  } else {
    const netPayMatch = text.match(/オークネットからのお支払額[\s\S]*?[￥¥]([\d,]+)/);
    if (netPayMatch) {
      result.declared_net_amount = -parseInt(netPayMatch[1].replace(/,/g, ""), 10);
    }
  }

  // 3. 動的明細抽出 (落札・配送費・出品売却相殺)
  const linesStartIdx = rawLines.findIndex((l) => l.includes("受付番号") || l.includes("セリ順"));
  if (linesStartIdx !== -1) {
    const targetSlice = rawLines.slice(linesStartIdx + 1);
    let currentLine: { no: number; header: string; tokens: string[] } | null = null;
    const itemBlocks: Array<{ no: number; header: string; tokens: string[] }> = [];

    for (let i = 0; i < targetSlice.length; i++) {
      const l = targetSlice[i];
      if (l.startsWith("頁計") || l.startsWith("総合計")) {
        if (currentLine) itemBlocks.push(currentLine);
        break;
      }

      const m = l.match(/^(\d+)\s+(\d+-\d+|配送費.*)$/);
      if (m) {
        if (currentLine) itemBlocks.push(currentLine);
        currentLine = {
          no: parseInt(m[1], 10),
          header: m[2],
          tokens: [],
        };
      } else if (currentLine) {
        currentLine.tokens.push(l);
      }
    }

    for (const b of itemBlocks) {
      if (b.header.startsWith("配送費")) {
        let feeAmount = 0;
        let feeTax = 0;
        let total = 0;
        let note = "配送費";

        for (const tok of b.tokens) {
          const mTotal = tok.match(/0\s+0\s+0\s+0\s+([\d,]+)/);
          if (mTotal) {
            total = parseInt(mTotal[1].replace(/,/g, ""), 10);
          }
          if (tok.includes("配送費") || tok.includes("配送")) {
            note = tok;
          }
          const mFee = tok.match(/^(\d+)\s+.*$/);
          if (mFee && !mTotal) {
            feeTax = parseInt(mFee[1], 10);
          } else if (/^\d+$/.test(tok) && parseInt(tok, 10) > 100) {
            feeAmount = parseInt(tok, 10);
          }
        }
        if (total === 0 && feeAmount > 0) {
          total = feeAmount + feeTax;
        }

        result.lines.push({
          line_number: result.lines.length + 1,
          page_number: 1,
          reception_number_raw: null,
          reception_number_normalized: null,
          lot_number: null,
          branch_number: null,
          auction_bid_number: null,
          item_name_raw: "配送費",
          brand_name_raw: null,
          transaction_type: "shipping_cost",
          item_amount: 0,
          tax_amount: 0,
          fee_amount: feeAmount || Math.round(total / 1.1),
          fee_tax_amount: feeTax || (total - Math.round(total / 1.1)),
          total_line_amount: total,
          notes: note,
        });
      } else {
        const recMatch = b.header.match(/^(\d+)-(\d+)$/);
        const lotNumber = recMatch ? recMatch[1] : null;
        const branchNumber = recMatch ? recMatch[2] : null;

        const bidNumber = b.tokens[0] || null;
        const brandName = b.tokens[1] || null;
        const itemName = b.tokens[2] || null;

        let itemAmt = 0;
        let itemTax = 0;
        let feeAmt = 0;
        let feeTax = 0;
        let totalLineAmt = 0;
        let isSale = false;

        const summaryLine = b.tokens.find((t) => t.includes(" ") && /^[\d,\s]+$/.test(t));
        if (summaryLine) {
          const sNums = summaryLine.split(/\s+/).map((p) => parseInt(p.replace(/,/g, ""), 10));
          if (sNums.length >= 4) {
            const paySalesIncl = sNums[0] || 0;
            const claimItemIncl = sNums[2] || 0;
            const feeIncl = sNums[3] || 0;

            if (paySalesIncl > 0) {
              isSale = true;
              itemAmt = Math.round(paySalesIncl / 1.1);
              itemTax = paySalesIncl - itemAmt;
              feeAmt = Math.round(feeIncl / 1.1);
              feeTax = feeIncl - feeAmt;
              totalLineAmt = -(paySalesIncl - feeIncl);
            } else if (claimItemIncl > 0 || feeIncl > 0) {
              isSale = false;
              itemAmt = Math.round(claimItemIncl / 1.1);
              itemTax = claimItemIncl - itemAmt;
              feeAmt = Math.round(feeIncl / 1.1);
              feeTax = feeIncl - feeAmt;
              totalLineAmt = claimItemIncl + feeIncl;
            }
          }
        }

        result.lines.push({
          line_number: result.lines.length + 1,
          page_number: 1,
          reception_number_raw: b.header,
          reception_number_normalized: b.header,
          lot_number: lotNumber,
          branch_number: branchNumber,
          auction_bid_number: bidNumber,
          item_name_raw: itemName,
          brand_name_raw: brandName,
          transaction_type: isSale ? "sale_settlement" : "purchase",
          item_amount: isSale ? -itemAmt : itemAmt,
          tax_amount: isSale ? -itemTax : itemTax,
          fee_amount: feeAmt,
          fee_tax_amount: feeTax,
          total_line_amount: totalLineAmt,
          notes: isSale
            ? `支払の部 (売却代金${(itemAmt + itemTax).toLocaleString()}円 - 出品手数料${(feeAmt + feeTax).toLocaleString()}円)`
            : "落札商品 (本体+手数料)",
        });
      }
    }
  }

  // 4. 金額検算 (明細合算と原本公称純請求額の照合)
  if (result.lines.length > 0) {
    result.calculated_total = result.lines.reduce((s, l) => s + l.total_line_amount, 0);
    result.discrepancy = result.declared_net_amount - result.calculated_total;
    result.is_balanced = (result.discrepancy === 0);
    if (!result.is_balanced) {
      result.needs_review_reasons.push(`AMOUNT_MISMATCH_DIFF_${result.discrepancy}`);
    }
  } else {
    result.needs_review_reasons.push("NO_LINES_EXTRACTED");
  }

  return result;
}

