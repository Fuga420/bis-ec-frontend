/**
 * njParser.ts
 * 株式会社ネットジャパン (NJ) 計算書パーサー
 */

import { ParsedInvoiceResult, ParsedDocumentLine } from "./types";

// 最大剰余方式 (ハミルトン方式) による消費税端数配分関数
export function allocateTaxByLargestRemainder(lines: ParsedDocumentLine[], totalTax: number): ParsedDocumentLine[] {
  if (!lines || lines.length === 0) return [];
  const isNegative = lines.every(l => (l.item_amount || 0) <= 0);
  const sign = isNegative ? -1 : 1;
  const targetTax = Math.abs(totalTax);

  const items = lines.map((line, idx) => {
    const absNet = Math.abs(line.item_amount || 0);
    const rawTax = absNet * 0.1;
    const baseTax = Math.floor(rawTax);
    const remainder = rawTax - baseTax;
    return { idx, baseTax, remainder, absNet, original: line };
  });

  const sumBaseTax = items.reduce((s, it) => s + it.baseTax, 0);
  const diff = targetTax - sumBaseTax;

  const sorted = [...items].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return b.absNet - a.absNet;
  });

  for (let i = 0; i < diff && i < sorted.length; i++) {
    sorted[i].baseTax += 1;
  }

  return items.map(it => {
    const taxAmount = it.baseTax * sign;
    const totalLineAmount = (it.original.item_amount || 0) + taxAmount +
      (it.original.fee_amount || 0) + (it.original.fee_tax_amount || 0);
    return {
      ...it.original,
      tax_amount: taxAmount,
      total_line_amount: totalLineAmount
    };
  });
}

export function parseNjInvoice(text: string): ParsedInvoiceResult {
  const result: ParsedInvoiceResult = {
    supplier_name: "ネットジャパン",
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
    has_text_layer: Boolean(text && text.trim().length > 100),
    needs_review_reasons: []
  };

  if (!result.has_text_layer) {
    result.needs_review_reasons.push("TEXT_LAYER_MISSING_NEEDS_OCR");
    return result;
  }

  // 1. ヘッダー情報抽出
  const regMatch = text.match(/【登録番号】\s*(T\d{13})/);
  if (regMatch) result.invoice_registration_number = regMatch[1];

  const codeMatch = text.match(/お客様コード\s*(\d+)/);
  if (codeMatch) result.member_number = codeMatch[1];

  const issueMatch = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (issueMatch) {
    result.issue_date = `${issueMatch[1]}-${issueMatch[2].padStart(2, "0")}-${issueMatch[3].padStart(2, "0")}`;
  }

  const totalMatch = text.match(/総合計金額\s*([\d,]+)\s*円/);
  if (totalMatch) {
    result.declared_net_amount = parseInt(totalMatch[1].replace(/,/g, ""), 10);
    result.declared_total_claim = result.declared_net_amount;
  }

  if (result.member_number && result.issue_date) {
    result.document_number = `NJ-${result.issue_date.replace(/-/g, "")}-${result.member_number}`;
  }

  // セクションの出現位置からページ番号を動的に判定するヘルパー
  const extractSectionPageNumber = (rawText: string, sectionIndex?: number): number => {
    if (sectionIndex == null || sectionIndex < 0) return 1;
    // 1. 直前の "N/M" ページヘッダーを探す (例: "2/6", "3/6")
    const prefix = rawText.slice(Math.max(0, sectionIndex - 100), sectionIndex);
    const slashMatch = [...prefix.matchAll(/(?:^|\n)\s*(\d+)\s*\/\s*\d+/g)].pop();
    if (slashMatch) return parseInt(slashMatch[1], 10);

    // 2. 直後の "-- N of M --" ページフッターを探す (例: "-- 2 of 6 --")
    const suffix = rawText.slice(sectionIndex, sectionIndex + 3000);
    const dashMatch = suffix.match(/--\s*(\d+)\s+of\s+\d+\s*--/);
    if (dashMatch) return parseInt(dashMatch[1], 10);

    return 1;
  };

  // 原本記載の御買上消費税額および合計額
  const buyTaxMatch = text.match(/御買上金額[\s\S]*?消費税\(10%\)\s*([\d,]+)\s*円/);
  const buyTotalMatch = text.match(/御買上金額[\s\S]*?\(2\)\s*合計\(▲\)\s*([\d,]+)\s*円/);

  // 2. 御買上明細書 (落札購入) の動的抽出
  const buySection = text.match(/御買上明細書[\s\S]*?(?=株式会社ネットジャパン|-- \d+ of \d+ --|$)/);
  if (buySection) {
    const buyPageNumber = extractSectionPageNumber(text, buySection.index);
    const buyText = buySection[0];
    const buyTaxMatch = buyText.match(/消費税\(10%\)\s*([\d,]+)\s*円/);
    const buyTotalTax = buyTaxMatch ? parseInt(buyTaxMatch[1].replace(/,/g, ""), 10) : 0;

    const rawBuyLines: ParsedDocumentLine[] = [];
    const lineRegex = /(\d+)\s+(\d{2}\/\d{2})\s+(\d+-\d+)\s+([\s\S]+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)(?:\r?\n|$)/g;
    let m;
    while ((m = lineRegex.exec(buyText)) !== null) {
      const lotBranch = m[3];
      const detail = m[4].replace(/\s+/g, " ").trim();
      const unitPrice = parseInt(m[5].replace(/,/g, ""), 10);
      const amount = parseInt(m[6].replace(/,/g, ""), 10);
      const fee = parseInt(m[7].replace(/,/g, ""), 10);

      rawBuyLines.push({
        line_number: result.lines.length + rawBuyLines.length + 1,
        page_number: buyPageNumber,
        reception_number_raw: lotBranch,
        reception_number_normalized: lotBranch,
        lot_number: lotBranch.split("-")[0],
        branch_number: lotBranch.split("-")[1],
        item_name_raw: detail,
        brand_name_raw: "ジュエリー",
        transaction_type: "purchase",
        item_amount: amount,
        tax_amount: 0,
        fee_amount: fee,
        fee_tax_amount: 0,
        total_line_amount: 0,
        notes: `落札 (箱ー枝: ${lotBranch}, 単価: ${unitPrice.toLocaleString()})`
      });
    }

    if (rawBuyLines.length > 0) {
      const allocatedBuy = allocateTaxByLargestRemainder(rawBuyLines, buyTotalTax);
      result.lines.push(...allocatedBuy);
    }
  }

  // 3. 売上明細書 (御出品・売却相殺) の動的抽出
  const saleSection = text.match(/売上明細書[\s\S]*?(?=株式会社ネットジャパン|-- \d+ of \d+ --|$)/);
  if (saleSection) {
    const salePageNumber = extractSectionPageNumber(text, saleSection.index);
    const saleText = saleSection[0];
    const saleTaxMatch = saleText.match(/消費税\(10%\)\s*([\d,]+)\s*円/);
    const saleTotalTax = saleTaxMatch ? parseInt(saleTaxMatch[1].replace(/,/g, ""), 10) : 0;

    const rawSaleLines: ParsedDocumentLine[] = [];
    const lineRegex = /(\d+)\s+(\d{2}\/\d{2})\s+(\d+-\d+)\s+([\s\S]+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)(?:\r?\n|$)/g;
    let m;
    while ((m = lineRegex.exec(saleText)) !== null) {
      const lotBranch = m[3];
      const detail = m[4].replace(/\s+/g, " ").trim();
      const unitPrice = parseInt(m[5].replace(/,/g, ""), 10);
      const amount = parseInt(m[6].replace(/,/g, ""), 10);

      rawSaleLines.push({
        line_number: result.lines.length + rawSaleLines.length + 1,
        page_number: salePageNumber,
        reception_number_raw: lotBranch,
        reception_number_normalized: lotBranch,
        lot_number: lotBranch.split("-")[0],
        branch_number: lotBranch.split("-")[1],
        item_name_raw: detail,
        brand_name_raw: "ジュエリー",
        transaction_type: "sale_settlement",
        item_amount: -amount,
        tax_amount: 0,
        fee_amount: 0,
        fee_tax_amount: 0,
        total_line_amount: 0,
        notes: `出品売却相殺 (箱ー枝: ${lotBranch}, 単価: ${unitPrice.toLocaleString()})`
      });
    }

    if (rawSaleLines.length > 0) {
      const allocatedSale = allocateTaxByLargestRemainder(rawSaleLines, saleTotalTax);
      result.lines.push(...allocatedSale);
    }
  }

  // 4. 手数料明細書の動的抽出
  const feeSection = text.match(/手数料明細書[\s\S]*?(?=株式会社ネットジャパン|-- \d+ of \d+ --|$)/);
  if (feeSection) {
    const feePageNumber = extractSectionPageNumber(text, feeSection.index);
    const feeText = feeSection[0];
    const feeNetMatch = feeText.match(/(?:^|\n)\s*課税金額\s*([\d,]+)\s*円/);
    const feeTaxMatch = feeText.match(/消費税\(10%\)\s*([\d,]+)\s*円/);
    const feeTotalMatch = feeText.match(/\(5\)\s*合計\(▲\)\s*([\d,]+)\s*円/);

    if (feeTotalMatch) {
      const feeTotal = parseInt(feeTotalMatch[1].replace(/,/g, ""), 10);
      const feeTax = feeTaxMatch ? parseInt(feeTaxMatch[1].replace(/,/g, ""), 10) : 0;
      const feeNet = feeNetMatch ? parseInt(feeNetMatch[1].replace(/,/g, ""), 10) : (feeTotal - feeTax);

      if (feeTotal > 0) {
        result.lines.push({
          line_number: result.lines.length + 1,
          page_number: feePageNumber,
          reception_number_raw: null,
          reception_number_normalized: null,
          lot_number: null,
          branch_number: null,
          item_name_raw: "手数料 (売上/仕入手数料)",
          brand_name_raw: null,
          transaction_type: "commission",
          item_amount: feeNet,
          tax_amount: feeTax,
          fee_amount: 0,
          fee_tax_amount: 0,
          total_line_amount: feeTotal,
          notes: `手数料明細書 手数料合計 (本体: ${feeNet.toLocaleString()} 円, 税: ${feeTax.toLocaleString()} 円)`
        });
      }
    }
  }

  // 5. 雑費明細書の動的抽出
  const expSectionMatch = text.match(/雑費明細書[\s\S]*?(?=株式会社ネットジャパン|-- \d+ of \d+ --|$)/);
  if (expSectionMatch) {
    const expPageNumber = extractSectionPageNumber(text, expSectionMatch.index);
    const expText = expSectionMatch[0];
    const expenseNetMatch = expText.match(/(?:^|\n)\s*課税金額\s*([\d,]+)\s*円/);
    const expenseTaxMatch = expText.match(/消費税\(10%\)\s*([\d,]+)\s*円/);
    const expenseTotalMatch = expText.match(/\(6\)\s*合計\(▲\)\s*([\d,]+)\s*円/);

    if (expenseTotalMatch) {
      const expTotal = parseInt(expenseTotalMatch[1].replace(/,/g, ""), 10);
      const expTax = expenseTaxMatch ? parseInt(expenseTaxMatch[1].replace(/,/g, ""), 10) : 0;
      const expNet = expenseNetMatch ? parseInt(expenseNetMatch[1].replace(/,/g, ""), 10) : (expTotal - expTax);

      if (expTotal > 0) {
        result.lines.push({
          line_number: result.lines.length + 1,
          page_number: expPageNumber,
          reception_number_raw: null,
          reception_number_normalized: null,
          lot_number: null,
          branch_number: null,
          item_name_raw: "雑費 (参加諸費用)",
          brand_name_raw: null,
          transaction_type: "other_expense",
          item_amount: expNet,
          tax_amount: expTax,
          fee_amount: 0,
          fee_tax_amount: 0,
          total_line_amount: expTotal,
          notes: `雑費明細書 雑費 (本体: ${expNet.toLocaleString()} 円, 税: ${expTax.toLocaleString()} 円)`
        });
      }
    }
  }

  // 6. 金額検算 (明細総額合算と原本公称総合計金額の厳格照合・固定明細フォールバックなし)
  if (result.lines.length > 0) {
    result.calculated_total = result.lines.reduce((s, l) => s + (l.total_line_amount || 0), 0);
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

