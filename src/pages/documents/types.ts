// 書類台帳の表示用の型。
//
// documents-relay（Readdy Backend Edge Function）の応答を、画面表示用に写像した形。
// 明細金額は「未入力 = null」「明示的な0円 = 0」を区別するため number | null で扱う。

// 書類の照合状態（未照合・一部照合・照合済み）
export type DocumentMatchStatus = "unmatched" | "partial" | "matched";

// 書類のファイル種別（MVP: PDF / JPG / PNG）
export type DocumentFileKind = "pdf" | "jpg" | "png";

// 明細の取引種別（バックエンドの transaction_type 値）。
export type TransactionType =
  | "purchase"
  | "commission"
  | "fee_only"
  | "participation_fee"
  | "shipping"
  | "other_expense"
  | "unsold_fee"
  | "cancel"
  | "refund"
  | "discount"
  | "sale_settlement"
  | "other";

export const TRANSACTION_TYPE_OPTIONS: Array<{
  value: TransactionType;
  label: string;
}> = [
  { value: "purchase", label: "仕入" },
  { value: "commission", label: "手数料" },
  { value: "fee_only", label: "手数料のみ" },
  { value: "participation_fee", label: "参加費" },
  { value: "shipping", label: "送料" },
  { value: "other_expense", label: "その他経費" },
  { value: "unsold_fee", label: "売れ残り手数料" },
  { value: "cancel", label: "キャンセル" },
  { value: "refund", label: "返金" },
  { value: "discount", label: "値引き" },
  { value: "sale_settlement", label: "売上精算" },
  { value: "other", label: "その他" },
];

// 手動で追加・修正する明細行（1書類に複数）。
export interface DocumentLedgerLine {
  // 画面上の安定キー（保存済みはサーバーID、未保存はローカルID）
  line_id: string;
  // document_lines.id（保存済みのときのみ）
  server_id?: string;
  // 明細番号（document_lines.line_number。保存時に採番される）
  line_number?: number;
  // 品目（item_name_raw。新規明細は必須）
  description: string;
  // 明細金額（total_line_amount。未入力は null、明示的な0円は 0）
  amount: number | null;
  // 取引種別（transaction_type）
  transaction_type: TransactionType;
  // 紐付け商品ID（未紐付けは空文字）
  product_id?: string;
  // 表示用の商品名（紐付け後に使用）
  product_name?: string;
  // document_product_links.id（紐付け済みのときのみ）
  link_id?: string;
  // 割当金額（allocated_amount）
  allocated_amount?: number | null;
  // 商品代金税込（item_amount_tax_included）
  item_amount_tax_included?: number | null;
  // 落札手数料税込（fee_amount_tax_included）
  fee_amount_tax_included?: number | null;
  // 受付番号（receipt_number）
  receipt_number?: string | null;
  // 紐付け履歴・内訳一覧（商品代・手数料の複数リンク管理用）
  links?: Array<{
    id: string;
    product_id: string;
    link_type: string;
    allocated_amount: number | null;
    status: string;
    is_deleted?: boolean;
  }>;
}

// 書類1件（原本は Drive に保管、構造化データは台帳に保存する想定）。
export interface DocumentLedgerDocument {
  document_id: string;
  // 原本ファイル名
  file_name: string;
  file_kind: DocumentFileKind;
  mime_type: string;
  // Drive原本を開くリンク（未取得時は空文字）
  drive_url: string;
  // 原本に印字された合計額（原本合計 = documents.total_amount）
  original_total: number;
  // アップロード日時
  uploaded_at: string;
  // 仕入先名（documents.supplier_name）
  supplier_name?: string;
  // バックエンドの生ステータス（pending / fully_matched など）
  status_text?: string;
  // 明細数（一覧APIが返す集計値）
  line_count?: number;
  // 明細合計（一覧APIが返す集計値）
  line_total?: number;
  // 照合状態。バックエンドの status から写像する。
  match_status?: DocumentMatchStatus;
  // 明細行（詳細取得時のみ中身が入る）
  lines: DocumentLedgerLine[];
}

export const DOCUMENT_MATCH_STATUS_LABELS: Record<DocumentMatchStatus, string> =
  {
    unmatched: "未照合",
    partial: "一部照合",
    matched: "照合済み",
  };

export const DOCUMENT_FILE_KIND_LABELS: Record<DocumentFileKind, string> = {
  pdf: "PDF",
  jpg: "JPG",
  png: "PNG",
};

// ファイル名の拡張子から種別を推定する（PDF以外は画像）。
export function resolveFileKind(fileName: string): DocumentFileKind {
  const name = (fileName || "").toLowerCase();
  if (name.endsWith(".png")) return "png";
  if (name.endsWith(".pdf")) return "pdf";
  return "jpg";
}

// バックエンドの status（＋監査差額）から画面表示用の照合状態を写像する。
export function mapMatchStatus(
  status: string | undefined,
  hasDiscrepancy = false
): DocumentMatchStatus {
  const s = (status ?? "").toLowerCase();
  if (s === "fully_matched" || s === "matched") return "matched";
  if (s === "partially_matched" || s === "partial") return "partial";
  if (s === "lines_registered" && hasDiscrepancy) return "partial";
  return "unmatched";
}