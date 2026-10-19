/**
 * komehyoParser.ts
 * KOMEHYO (株式会社コメ兵) ご精算書パーサー
 */

import { ParsedInvoiceResult, ParsedDocumentLine } from "./types";

export function parseKomehyoInvoice(text: string): ParsedInvoiceResult {
  const result: ParsedInvoiceResult = {
    supplier_name: "KOMEHYO",
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

  // 1. ヘッダー情報抽出
  // 登録番号 (コメ兵)
  const regMatch = text.match(/登録番号[：:]\s*(T\d{13})/);
  if (regMatch) result.invoice_registration_number = regMatch[1];

  // 会員番号 (例: 【2764】)
  const memMatch = text.match(/【(\d+)】/);
  if (memMatch) result.member_number = memMatch[1];

  // 発行日
  const issueMatch = text.match(/発行日[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (issueMatch) {
    result.issue_date = `${issueMatch[1]}-${issueMatch[2].padStart(2, "0")}-${issueMatch[3].padStart(2, "0")}`;
  }

  // 請求額合計 (1P 表紙)
  const totalMatch = text.match(/請求額合計\s*[￥¥]([\d,]+)/);
  if (totalMatch) {
    result.declared_net_amount = parseInt(totalMatch[1].replace(/,/g, ""), 10);
    result.declared_total_claim = result.declared_net_amount;
  }

  if (result.member_number && result.issue_date) {
    result.document_number = `${result.member_number}-${result.issue_date.replace(/-/g, "")}`;
  }

  let declaredListingFee = 0;
  const listingFeeMatch = text.match(/出品ご利用額（①）\s*[￥¥]([\d,]+)/);
  if (listingFeeMatch) {
    declaredListingFee = parseInt(listingFeeMatch[1].replace(/,/g, ""), 10);
  }

  // 2. 動的明細抽出
  const pages = text.split(/--\s*\d+\s+of\s+\d+\s*--/);

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageText = pages[pageIdx];
    const pageNumber = pageIdx + 1;

    // A. 諸経費等明細 (通常3P)
    if (pageText.includes("諸経費等 明細") || pageText.includes("諸経費等")) {
      const feeMatches = pageText.matchAll(/G\s+([^\s]+)\s+([^\s]+)\s+(\d+)\s+[￥¥]([\d,]+)/g);
      for (const fm of feeMatches) {
        const itemType = fm[1];
        const category = fm[2];
        const count = parseInt(fm[3], 10);
        const fee = parseInt(fm[4].replace(/,/g, ""), 10);
        const feeTax = Math.round(fee * 0.1);
        const total = fee + feeTax;

        result.lines.push({
          line_number: result.lines.length + 1,
          page_number: pageNumber,
          reception_number_raw: null,
          reception_number_normalized: null,
          lot_number: null,
          branch_number: null,
          item_name_raw: `${itemType} (${category})`,
          brand_name_raw: null,
          transaction_type: "other_expense",
          item_amount: 0,
          tax_amount: 0,
          fee_amount: fee,
          fee_tax_amount: feeTax,
          total_line_amount: total,
          notes: `${itemType} ${category} ${count}点`,
        });
      }
    }

    // B. ご購入商品明細 (通常4P)
    if (pageText.includes("ご購入商品明細")) {
      const rawLines = pageText.split("\n").map((l) => l.trim()).filter(Boolean);
      const headerIdx = rawLines.findIndex((l) => l.includes("ご購入商品明細") || l.includes("ロットNo."));
      const topSlice = headerIdx !== -1 ? rawLines.slice(0, headerIdx) : rawLines;
      const bottomSlice = headerIdx !== -1 ? rawLines.slice(headerIdx) : [];

      const items: Array<{ no: number; lot: string; itemName: string; amount: number }> = [];
      for (let i = 0; i < topSlice.length; i++) {
        const l = topSlice[i];
        const noMatch = l.match(/^(\d+)\s+(\d+-\d+)$/);
        if (noMatch) {
          const no = parseInt(noMatch[1], 10);
          const lot = noMatch[2];
          let itemName = "";
          let amount = 0;

          for (let j = i + 1; j < topSlice.length; j++) {
            const nextL = topSlice[j];
            if (nextL.match(/^(\d+)\s+(\d+-\d+)$/)) break;

            const amtM = nextL.match(/([\d,]+)$/);
            if (amtM) {
              const val = parseInt(amtM[1].replace(/,/g, ""), 10);
              if (val >= 10000) {
                amount = val;
                const namePart = nextL.slice(0, amtM.index).replace(/\d+\s*$/, "").trim();
                if (namePart) itemName = namePart;
              }
            } else if (!itemName) {
              itemName = nextL;
            }
          }

          items.push({ no, lot, itemName: itemName || "落札商品", amount });
        }
      }

      const feeDetails: number[] = [];
      for (let i = 0; i < bottomSlice.length; i++) {
        const l = bottomSlice[i];
        const directFee = l.match(/(\d+)\s*\(\d+\.\d+%\)/);
        if (directFee) {
          feeDetails.push(parseInt(directFee[1], 10));
          continue;
        }
        if (i + 1 < bottomSlice.length && bottomSlice[i + 1].match(/^\(\d+\.\d+%\)$/)) {
          const m = l.match(/(\d+)\s*$/);
          if (m) {
            feeDetails.push(parseInt(m[1], 10));
          }
        }
      }

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const fee = feeDetails[idx] || 0;
        const taxAmount = Math.round(item.amount * 0.1);
        const feeTaxAmount = Math.round(fee * 0.1);
        const totalLineAmount = item.amount + taxAmount + fee + feeTaxAmount;
        const lotParts = item.lot.split("-");

        result.lines.push({
          line_number: result.lines.length + 1,
          page_number: pageNumber,
          reception_number_raw: item.lot,
          reception_number_normalized: item.lot,
          lot_number: lotParts[0] || null,
          branch_number: lotParts[1] || null,
          item_name_raw: item.itemName,
          brand_name_raw: null,
          transaction_type: "purchase",
          item_amount: item.amount,
          tax_amount: taxAmount,
          fee_amount: fee,
          fee_tax_amount: feeTaxAmount,
          total_line_amount: totalLineAmount,
          notes: `ロットNo: ${item.lot} (手数料${fee.toLocaleString()}円)`,
        });
      }
    }
  }

  // C. 出品利用額がある場合 (出品取消手数料など)
  if (declaredListingFee > 0) {
    const feeWithoutTax = Math.round(declaredListingFee / 1.1);
    const feeTax = declaredListingFee - feeWithoutTax;
    result.lines.push({
      line_number: result.lines.length + 1,
      page_number: 1,
      reception_number_raw: null,
      reception_number_normalized: null,
      lot_number: null,
      branch_number: null,
      item_name_raw: "出品利用手数料 (取消/作業)",
      brand_name_raw: null,
      transaction_type: "commission",
      item_amount: 0,
      tax_amount: 0,
      fee_amount: feeWithoutTax,
      fee_tax_amount: feeTax,
      total_line_amount: declaredListingFee,
      notes: `出品利用額（①）`,
    });
  }

  // 3. 金額検算 (明細合算と原本公称純請求額の照合)
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

