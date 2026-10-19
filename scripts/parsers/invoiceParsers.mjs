/**
 * invoiceParsers.mjs
 * 仕入書類パーサー実装 (オークネット / KOMEHYO / ネットジャパン)
 */

// 1. オークネット パーサー
export function parseAucnetInvoice(text) {
  const result = {
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

  const rawLines = text.split("\n").map(l => l.trim()).filter(Boolean);

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

  const payMatch = text.match(/お支払の部\(税込合計\)[\s\S]*?[￥¥]([\d,]+)/);
  if (payMatch) {
    result.declared_total_payment = parseInt(payMatch[1].replace(/,/g, ""), 10);
  }

  const claimMatch = text.match(/ご請求の部\(税込合計\)[\s\S]*?[￥¥]([\d,]+)/);
  if (claimMatch) {
    result.declared_total_claim = parseInt(claimMatch[1].replace(/,/g, ""), 10);
  }

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
  const linesStartIdx = rawLines.findIndex(l => l.includes("受付番号") || l.includes("セリ順"));
  if (linesStartIdx !== -1) {
    const targetSlice = rawLines.slice(linesStartIdx + 1);
    let currentLine = null;
    const itemBlocks = [];

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
          tokens: []
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
          notes: note
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

        const summaryLine = b.tokens.find(t => t.includes(" ") && /^[\d,\s]+$/.test(t));
        if (summaryLine) {
          const sNums = summaryLine.split(/\s+/).map(p => parseInt(p.replace(/,/g, ""), 10));
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
          notes: isSale ? `支払の部 (売却代金${(itemAmt + itemTax).toLocaleString()}円 - 出品手数料${(feeAmt + feeTax).toLocaleString()}円)` : "落札商品 (本体+手数料)"
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
export function parseKomehyoInvoice(text) {
  const result = {
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
          notes: `${itemType} ${category} ${count}点`
        });
      }
    }

    // B. ご購入商品明細 (通常4P)
    if (pageText.includes("ご購入商品明細")) {
      const rawLines = pageText.split("\n").map(l => l.trim()).filter(Boolean);
      const headerIdx = rawLines.findIndex(l => l.includes("ご購入商品明細") || l.includes("ロットNo."));
      const topSlice = headerIdx !== -1 ? rawLines.slice(0, headerIdx) : rawLines;
      const bottomSlice = headerIdx !== -1 ? rawLines.slice(headerIdx) : [];

      const items = [];
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

      const feeDetails = [];
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
          notes: `ロットNo: ${item.lot} (手数料${fee.toLocaleString()}円)`
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
      notes: `出品利用額（①）`
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

// 3. 最大剰余方式 (ハミルトン方式) による消費税端数配分関数
export function allocateTaxByLargestRemainder(lines, totalTax) {
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

  // 端数(小数部)の大きい順にソート (同一なら本体金額の大きい順)
  const sorted = [...items].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return b.absNet - a.absNet;
  });

  // 不足する端数分を1円ずつ加算
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

// 4. ネットジャパン (NJ) パーサー
export function parseNjInvoice(text) {
  const result = {
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
  const extractSectionPageNumber = (rawText, sectionIndex) => {
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

    const rawBuyLines = [];
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

    const rawSaleLines = [];
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

// 4. 統合ルーティングパーサー
export function parseInvoiceDocument(text, forcedSupplier = null) {
  const normText = text || "";
  let supplier = forcedSupplier || "";

  if (!supplier) {
    if (normText.includes("オークネット") || normText.includes("AUC NET")) {
      supplier = "オークネット";
    } else if (normText.includes("コメ兵") || normText.includes("KOMEHYO") || normText.includes("T2180001141237")) {
      supplier = "KOMEHYO";
    } else if (normText.includes("ネットジャパン") || normText.includes("T1010401168038")) {
      supplier = "ネットジャパン";
    }
  }

  switch (supplier) {
    case "オークネット":
      return parseAucnetInvoice(normText);
    case "KOMEHYO":
      return parseKomehyoInvoice(normText);
    case "ネットジャパン":
    case "NJ":
      return parseNjInvoice(normText);
    default:
      return {
        supplier_name: supplier || "UNKNOWN",
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
        has_text_layer: Boolean(normText && normText.trim().length > 50),
        needs_review_reasons: ["UNKNOWN_SUPPLIER_FORMAT"]
      };
  }
}
