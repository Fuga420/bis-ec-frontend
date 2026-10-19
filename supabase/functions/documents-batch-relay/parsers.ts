/**
 * parsers.ts - Supabase Edge Function 用 仕入書類パーサー集約モジュール
 *
 * 厳格原則:
 * - オークネット (466935) および KOMEHYO (2764) は代表原本に厳格限定。
 * - 別日書類は固定明細を流用せず、必ず is_balanced: false (要確認) として扱う。
 * - ネットジャパン (NJ) は複合票・単票ともにセクション動的抽出および最大剰余方式税額配分を適用。
 */

export interface ParsedLine {
  line_number: number;
  page_number: number;
  reception_number_raw: string | null;
  reception_number_normalized: string | null;
  lot_number: string | null;
  branch_number: string | null;
  auction_bid_number: string | null;
  item_name_raw: string;
  brand_name_raw: string | null;
  transaction_type: "purchase" | "commission" | "shipping_cost" | "other_expense" | "refund" | "sale_settlement";
  item_amount: number;
  tax_amount: number;
  fee_amount: number;
  fee_tax_amount: number;
  total_line_amount: number;
  notes: string | null;
}

export interface ParseResult {
  supplier_name: "オークネット" | "KOMEHYO" | "NET JAPAN" | "UNKNOWN";
  document_number: string | null;
  member_number: string | null;
  issue_date: string | null;
  accounting_date: string | null;
  invoice_registration_number: string | null;
  declared_total_claim: number;
  declared_total_payment: number;
  declared_net_amount: number;
  lines: ParsedLine[];
  calculated_total: number;
  discrepancy: number;
  is_balanced: boolean;
  has_text_layer: boolean;
  needs_review_reasons: string[];
}

/**
 * 最大剰余方式（ハミルトン方式）による一括消費税の端数配分
 */
export function allocateTaxByLargestRemainder(lines: ParsedLine[], targetTaxTotal: number): number[] {
  if (lines.length === 0) return [];
  const taxRate = 0.10;
  const isTargetNegative = targetTaxTotal < 0;
  const targetAbs = Math.abs(targetTaxTotal);

  const items = lines.map((l, index) => {
    const amountAbs = Math.abs(l.item_amount);
    const exactTax = amountAbs * taxRate;
    const floorTax = Math.floor(exactTax);
    const remainder = exactTax - floorTax;
    return { index, floorTax, remainder, isNegative: l.item_amount < 0 };
  });

  const sumFloor = items.reduce((s, it) => s + it.floorTax, 0);
  let diff = targetAbs - sumFloor;

  const sorted = [...items].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < diff && i < sorted.length; i++) {
    sorted[i].floorTax += 1;
  }

  const result = new Array(lines.length);
  for (const it of items) {
    result[it.index] = (it.isNegative || isTargetNegative) ? -it.floorTax : it.floorTax;
  }
  return result;
}

// 1. オークネット パーサー
export function parseAucnetInvoice(text: string): ParseResult {
  const result: ParseResult = {
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
    has_text_layer: Boolean(text && text.trim().length > 50),
    needs_review_reasons: []
  };

  if (!result.has_text_layer) {
    result.needs_review_reasons.push("TEXT_LAYER_MISSING_NEEDS_OCR");
    return result;
  }

  const regMatch = text.match(/登録番号[：:]\s*(T\d{13})/);
  if (regMatch) result.invoice_registration_number = regMatch[1];

  const calcNumMatch = text.match(/計算書番号\s*([0-9A-Za-z]+)/);
  if (calcNumMatch) result.document_number = calcNumMatch[1];

  const issueMatch = text.match(/発行日[：:]\s*(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (issueMatch) {
    result.issue_date = `${issueMatch[1]}-${issueMatch[2].padStart(2, "0")}-${issueMatch[3].padStart(2, "0")}`;
  }

  const claimMatch = text.match(/ご請求の部\(税込合計\)[\s\S]*?[￥¥]([\d,]+)/);
  if (claimMatch) result.declared_total_claim = parseInt(claimMatch[1].replace(/,/g, ""), 10);

  const payMatch = text.match(/お支払の部\(税込合計\)[\s\S]*?[￥¥]([\d,]+)/);
  if (payMatch) result.declared_total_payment = parseInt(payMatch[1].replace(/,/g, ""), 10);

  const netClaimMatch = text.match(/今回ご請求額[\s\S]*?[￥¥]([\d,]+)/);
  if (netClaimMatch) {
    result.declared_net_amount = parseInt(netClaimMatch[1].replace(/,/g, ""), 10);
  } else {
    const netPayMatch = text.match(/オークネットからのお支払額[\s\S]*?[￥¥]([\d,]+)/);
    if (netPayMatch) {
      result.declared_net_amount = -parseInt(netPayMatch[1].replace(/,/g, ""), 10);
    }
  }

  // 動的明細抽出 (落札・配送費・出品売却相殺)
  const rawLines = text.split("\n").map((l) => l.trim()).filter(Boolean);
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

// 2. KOMEHYO パーサー
export function parseKomehyoInvoice(text: string): ParseResult {
  const result: ParseResult = {
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
    has_text_layer: Boolean(text && text.trim().length > 50),
    needs_review_reasons: []
  };

  if (!result.has_text_layer) {
    result.needs_review_reasons.push("TEXT_LAYER_MISSING_NEEDS_OCR");
    return result;
  }

  const regMatch = text.match(/登録番号[：:]\s*(T\d{13})/);
  if (regMatch) result.invoice_registration_number = regMatch[1];

  const memMatch = text.match(/【(\d+)】/);
  if (memMatch) result.member_number = memMatch[1];

  const issueMatch = text.match(/発行日[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (issueMatch) {
    result.issue_date = `${issueMatch[1]}-${issueMatch[2].padStart(2, "0")}-${issueMatch[3].padStart(2, "0")}`;
  }

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

  // 動的明細抽出
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
          auction_bid_number: null,
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
          auction_bid_number: null,
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
      auction_bid_number: null,
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

// 3. ネットジャパン (NJ) パーサー（動的抽出）
export function parseNjInvoice(text: string): ParseResult {
  const result: ParseResult = {
    supplier_name: "NET JAPAN",
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
    has_text_layer: Boolean(text && text.trim().length > 50),
    needs_review_reasons: []
  };

  if (!result.has_text_layer) {
    result.needs_review_reasons.push("TEXT_LAYER_MISSING_NEEDS_OCR");
    return result;
  }

  const regMatch = text.match(/登録番号\s*(T\d{13})/);
  if (regMatch) result.invoice_registration_number = regMatch[1];

  const memMatch = text.match(/お客様コード\s*([0-9A-Za-z]+)/);
  if (memMatch) result.member_number = memMatch[1];

  const issueMatch = text.match(/発行日\s*(\d{4})[./年](\d{1,2})[./月](\d{1,2})/);
  if (issueMatch) {
    result.issue_date = `${issueMatch[1]}-${issueMatch[2].padStart(2, "0")}-${issueMatch[3].padStart(2, "0")}`;
  }

  const totalMatch = text.match(/(?:総合計金額|合計金額|ご請求金額)\s*[￥¥]?\s*([-\d,]+)/);
  if (totalMatch) {
    result.declared_net_amount = parseInt(totalMatch[1].replace(/,/g, ""), 10);
    result.declared_total_claim = result.declared_net_amount;
  }

  // ページマーカーから各セクションのページ番号を動的に推定
  function findSectionPage(sectionHeader: string): number {
    const headerIdx = text.indexOf(sectionHeader);
    if (headerIdx < 0) return 1;
    const textBefore = text.slice(0, headerIdx);
    const matches = [...textBefore.matchAll(/(?:--\s*(\d+)\s+of\s+\d+\s*--|(\d+)\s*\/\s*\d+)/g)];
    if (matches.length > 0) {
      const last = matches[matches.length - 1];
      const page = parseInt(last[1] || last[2], 10);
      if (!isNaN(page) && page > 0) return page;
    }
    return 1;
  }

  const allLines: ParsedLine[] = [];
  let lineNumber = 1;

  // セクション1: 御買上明細書
  const buySectionIdx = text.indexOf("御買上明細書");
  if (buySectionIdx >= 0) {
    const buyPage = findSectionPage("御買上明細書");
    const nextSecMatch = text.slice(buySectionIdx).match(/(?:売上明細書|手数料明細書|雑費明細書|消費税計算書)/);
    const buyEnd = nextSecMatch && nextSecMatch.index ? buySectionIdx + nextSecMatch.index : text.length;
    const buyText = text.slice(buySectionIdx, buyEnd);

    const buyTaxMatch = buyText.match(/消費税\s*([0-9,]+)/);
    const buyTaxTotal = buyTaxMatch ? parseInt(buyTaxMatch[1].replace(/,/g, ""), 10) : 0;

    const rowRegex = /(\d+-\d+)\s+([^\n\r]+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/g;
    let match;
    const buyLines: ParsedLine[] = [];
    while ((match = rowRegex.exec(buyText)) !== null) {
      const rec = match[1];
      const name = match[2].trim();
      const amount = parseInt(match[5].replace(/,/g, ""), 10);
      const parts = rec.split("-");

      buyLines.push({
        line_number: lineNumber++,
        page_number: buyPage,
        reception_number_raw: rec,
        reception_number_normalized: rec,
        lot_number: parts[0] || null,
        branch_number: parts[1] || null,
        auction_bid_number: null,
        item_name_raw: name,
        brand_name_raw: null,
        transaction_type: "purchase",
        item_amount: amount,
        tax_amount: 0,
        fee_amount: 0,
        fee_tax_amount: 0,
        total_line_amount: 0,
        notes: `買上明細 (${rec})`
      });
    }

    if (buyLines.length > 0 && buyTaxTotal > 0) {
      const allocated = allocateTaxByLargestRemainder(buyLines, buyTaxTotal);
      buyLines.forEach((l, i) => {
        l.tax_amount = allocated[i];
        l.total_line_amount = l.item_amount + l.tax_amount;
      });
    } else {
      buyLines.forEach(l => { l.total_line_amount = l.item_amount; });
    }
    allLines.push(...buyLines);
  }

  // セクション2: 売上明細書 (相殺額: 負数)
  const saleSectionIdx = text.indexOf("売上明細書");
  if (saleSectionIdx >= 0) {
    const salePage = findSectionPage("売上明細書");
    const nextSecMatch = text.slice(saleSectionIdx).match(/(?:御買上明細書|手数料明細書|雑費明細書|消費税計算書)/);
    const saleEnd = nextSecMatch && nextSecMatch.index ? saleSectionIdx + nextSecMatch.index : text.length;
    const saleText = text.slice(saleSectionIdx, saleEnd);

    const saleTaxMatch = saleText.match(/消費税\s*([0-9,]+)/);
    const saleTaxTotal = saleTaxMatch ? parseInt(saleTaxMatch[1].replace(/,/g, ""), 10) : 0;

    const rowRegex = /(\d+-\d+)\s+([^\n\r]+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/g;
    let match;
    const saleLines: ParsedLine[] = [];
    while ((match = rowRegex.exec(saleText)) !== null) {
      const rec = match[1];
      const name = match[2].trim();
      const amount = parseInt(match[5].replace(/,/g, ""), 10);
      const parts = rec.split("-");

      saleLines.push({
        line_number: lineNumber++,
        page_number: salePage,
        reception_number_raw: rec,
        reception_number_normalized: rec,
        lot_number: parts[0] || null,
        branch_number: parts[1] || null,
        auction_bid_number: null,
        item_name_raw: name,
        brand_name_raw: null,
        transaction_type: "sale_settlement",
        item_amount: -amount,
        tax_amount: 0,
        fee_amount: 0,
        fee_tax_amount: 0,
        total_line_amount: 0,
        notes: `売上相殺 (${rec})`
      });
    }

    if (saleLines.length > 0 && saleTaxTotal > 0) {
      const allocated = allocateTaxByLargestRemainder(saleLines, -saleTaxTotal);
      saleLines.forEach((l, i) => {
        l.tax_amount = allocated[i];
        l.total_line_amount = l.item_amount + l.tax_amount;
      });
    } else {
      saleLines.forEach(l => { l.total_line_amount = l.item_amount; });
    }
    allLines.push(...saleLines);
  }

  // セクション3: 手数料明細書
  const feeSectionIdx = text.indexOf("手数料明細書");
  if (feeSectionIdx >= 0) {
    const feePage = findSectionPage("手数料明細書");
    const feeMatch = text.slice(feeSectionIdx).match(/手数料合計\s*([\d,]+)[\s\S]*?消費税\s*([\d,]+)[\s\S]*?総合計\s*([\d,]+)/);
    if (feeMatch) {
      const feeNet = parseInt(feeMatch[1].replace(/,/g, ""), 10);
      const feeTax = parseInt(feeMatch[2].replace(/,/g, ""), 10);
      const feeTotal = parseInt(feeMatch[3].replace(/,/g, ""), 10);
      allLines.push({
        line_number: lineNumber++,
        page_number: feePage,
        reception_number_raw: null,
        reception_number_normalized: null,
        lot_number: null,
        branch_number: null,
        auction_bid_number: null,
        item_name_raw: "手数料",
        brand_name_raw: null,
        transaction_type: "commission",
        item_amount: 0,
        tax_amount: 0,
        fee_amount: feeNet,
        fee_tax_amount: feeTax,
        total_line_amount: feeTotal,
        notes: "手数料明細書 総合計"
      });
    }
  }

  // セクション4: 雑費明細書
  const miscSectionIdx = text.indexOf("雑費明細書");
  if (miscSectionIdx >= 0) {
    const miscPage = findSectionPage("雑費明細書");
    const miscMatch = text.slice(miscSectionIdx).match(/(?:雑費合計|御買上合計|総合計)\s*([\d,]+)/);
    if (miscMatch) {
      const miscTotal = parseInt(miscMatch[1].replace(/,/g, ""), 10);
      allLines.push({
        line_number: lineNumber++,
        page_number: miscPage,
        reception_number_raw: null,
        reception_number_normalized: null,
        lot_number: null,
        branch_number: null,
        auction_bid_number: null,
        item_name_raw: "雑費",
        brand_name_raw: null,
        transaction_type: "other_expense",
        item_amount: 0,
        tax_amount: 0,
        fee_amount: miscTotal,
        fee_tax_amount: 0,
        total_line_amount: miscTotal,
        notes: "雑費明細書 総合計"
      });
    }
  }

  result.lines = allLines;

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

// 総合仕入書類判定・パーサーディスパッチ
export function parseInvoiceDocument(text: string): ParseResult {
  if (!text || text.trim().length <= 50) {
    return {
      supplier_name: "UNKNOWN",
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
      has_text_layer: false,
      needs_review_reasons: ["TEXT_LAYER_MISSING_NEEDS_OCR"]
    };
  }

  if (text.includes("オークネット") || text.includes("AUCNET") || text.includes("落札・手数料計算書")) {
    return parseAucnetInvoice(text);
  }
  if (text.includes("コメ兵") || text.includes("KOMEHYO") || text.includes("ご精算書")) {
    return parseKomehyoInvoice(text);
  }
  if (text.includes("ネットジャパン") || text.includes("NET JAPAN") || text.includes("御買上明細書") || text.includes("貴金属相殺計算書")) {
    return parseNjInvoice(text);
  }

  return {
    supplier_name: "UNKNOWN",
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
    has_text_layer: true,
    needs_review_reasons: ["UNKNOWN_SUPPLIER_FORMAT"]
  };
}

