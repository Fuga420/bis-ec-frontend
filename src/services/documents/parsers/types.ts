/**
 * types.ts
 * 仕入書類パーサー共通型定義
 */

export type TransactionType =
  | "purchase"
  | "commission"
  | "shipping_cost"
  | "participation_fee"
  | "other_expense"
  | "refund"
  | "sale_settlement";

export interface ParsedDocumentLine {
  line_number: number;
  page_number: number;
  reception_number_raw: string | null;
  reception_number_normalized: string | null;
  lot_number: string | null;
  branch_number: string | null;
  auction_bid_number?: string | null;
  item_name_raw: string;
  brand_name_raw: string | null;
  item_rank_raw?: string | null;
  accessory_raw?: string | null;
  transaction_type: TransactionType;
  item_amount: number;
  tax_amount: number;
  fee_amount: number;
  fee_tax_amount: number;
  other_expense_amount?: number;
  total_line_amount: number;
  notes?: string | null;
}

export interface ParsedInvoiceResult {
  supplier_name: "オークネット" | "KOMEHYO" | "ネットジャパン" | string;
  document_number: string | null;
  member_number: string | null;
  issue_date: string | null;
  accounting_date: string | null;
  invoice_registration_number: string | null;
  declared_total_claim: number;    // ご請求の部(税込) または 落札利用額(税込)
  declared_total_payment: number;  // お支払の部(税込) または 出品利用額(税込)
  declared_net_amount: number;      // 差引請求額 (公称純請求額)
  lines: ParsedDocumentLine[];
  calculated_total: number;        // 明細全行の合算金額
  discrepancy: number;             // declared_net_amount - calculated_total (差額)
  is_balanced: boolean;            // discrepancy === 0
  has_text_layer: boolean;         // テキストPDFか否か (falseの場合はOCR必須)
  needs_review_reasons: string[];
}

