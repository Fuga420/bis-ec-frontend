/**
 * index.ts
 * 仕入書類パーサー統合モジュール
 */

import { ParsedInvoiceResult } from "./types";
import { parseAucnetInvoice } from "./aucnetParser";
import { parseKomehyoInvoice } from "./komehyoParser";
import { parseNjInvoice } from "./njParser";

export * from "./types";
export * from "./aucnetParser";
export * from "./komehyoParser";
export * from "./njParser";

export function parseInvoiceDocument(text: string, forcedSupplier?: string): ParsedInvoiceResult {
  const normText = text || "";

  // 1. 仕入先の判定
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

  // 2. 該当パーサーの実行
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
        has_text_layer: normText.trim().length > 50,
        needs_review_reasons: ["UNKNOWN_SUPPLIER_FORMAT"]
      };
  }
}
