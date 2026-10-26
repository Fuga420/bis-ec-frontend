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

// 明細に紐付いた商品（分割紐付けに対応するため複数保持する）。
export interface DocumentLedgerProductLink {
  link_id: string;
  product_id: string;
  // 割当金額（allocated_amount）
  allocated_amount: number | null;
  // 紐付け種別（primary_cost / commission / shipping_cost など）
  link_type: string;
}

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
  // 受付番号（reception_number_raw）。スタッフが明細を探すときの主要キー。
  reception_number?: string;
  // 箱番・枝番・出品番号（原本の補助情報）
  lot_number?: string;
  branch_number?: string;
  auction_bid_number?: string;
  // 商品代金（item_amount・税抜の商品本体価格）
  item_amount?: number | null;
  // 落札手数料（fee_amount）
  fee_amount?: number | null;
  // 商品代金の税額（tax_amount）
  tax_amount?: number | null;
  // 落札手数料の税額（fee_tax_amount）
  fee_tax_amount?: number | null;
  // 備考（notes）
  notes?: string;
  // 紐付け済み商品（分割紐付け対応。未紐付けは空配列）
  links?: DocumentLedgerProductLink[];
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
  // 原本が置かれているDriveフォルダID（documents.drive_folder_id）
  drive_folder_id?: string;
  // DriveのファイルID（documents.drive_file_id）
  drive_file_id?: string;
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
  // 書類番号（documents.document_number）
  document_number?: string;
  // 請求日 / 発行日（documents.issue_date）
  issue_date?: string;
  // 明細行（詳細取得時のみ中身が入る）
  lines: DocumentLedgerLine[];
}

// 受付番号検索の1件（明細単位）。
export interface DocumentLineSearchHit {
  line_id: string;
  document_id: string;
  // 明細番号（document_lines.line_number）
  line_number?: number;
  document_file_name: string;
  supplier_name: string;
  issue_date: string;
  reception_number: string;
  item_name: string;
  // ブランド名（document_lines.brand_name_raw）
  brand_name: string;
  transaction_type: TransactionType;
  item_amount: number | null;
  fee_amount: number | null;
  total_line_amount: number | null;
  // 紐付け済み商品ID（未紐付けは空配列）
  linked_product_ids: string[];
  // 原本PDFリンク（documents.drive_file_url）
  drive_url: string;
}

// 仕入明細の検索条件（受付番号・ことばの両方指定はAND絞り込み）。
export interface DocumentLineSearchParams {
  receptionNumber?: string;
  keyword?: string;
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