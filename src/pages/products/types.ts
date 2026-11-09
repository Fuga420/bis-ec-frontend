export interface AdminProductImage {
  file_id: string;
  name?: string;
  mime_type?: string;
  view_url?: string;
  display_url: string;
}

export interface ProductTranslation {
  product_id: string;
  locale: string;
  translated_title: string;
  translated_description: string;
  translated_condition?: string;
  translated_box?: string;
  translated_accessories?: string;
  translation_status: string;
  generated_at: string;
}

// 管理画面向け商品詳細レスポンスの product.document（請求書・領収書）。
// 管理画面（商品詳細・商品編集）でのみ表示し、公開ページには表示しない。
// 商品画像（images）とは別枠で扱い、サムネイルやAI生成対象画像にはしない。
export interface ProductDocument {
  file_name: string;
  mime_type?: string;
  view_url?: string;
  display_url?: string;
  size?: number | null;
  attached_at?: string;
  product_id?: string;
}

export interface PokemonCardData {
  product_id?: string;
  card_name: string;
  set_name: string;
  card_number: string;
  rarity: string;
  language: string;
  grading_status: "graded" | "ungraded";
  grader: string;
  grade: string;
  certification_number: string;
  card_condition: string;
  created_at?: string;
  updated_at?: string;
}

export interface AdminProductDetail {
  product_id: string;
  category: string;
  brand: string;
  product_name: string;
  // GAS v108: 仕入台帳（オークション等）の商品番号。任意の文字列で、
  // 先頭ゼロ・ハイフンを保持する。未設定は ""。商品ID・メーカー品番・型番とは別項目。
  // 古い応答では項目自体が存在しないことがある（その場合は編集で送らない）。
  auction_item_number?: string;
  condition: string;
  purchase_price: number | null;
  planned_sale_price: number;
  storage_location: string;
  description?: string;
  notes?: string;
  sneaker_sku?: string;
  sneaker_size?: number | null;
  sneaker_colorway?: string;
  sneaker_box?: string;
  sneaker_accessories?: string;
  sneaker_release_year?: string;
  jewelry_type?: string;
  jewelry_material?: string;
  carat?: string;
  shape?: string;
  color_grade?: string;
  clarity?: string;
  cut?: string;
  main_stone?: string;
  jewelry_size?: string;
  weight_g?: string;
  certificate_available?: string;
  certificate_number?: string;
  publish_status: string;
  inventory_status: string;
  record_status: string;
  // Square Production（本番環境）の Square 連携ID
  square_item_id: string;
  square_variation_id: string;
  square_payment_link_id: string;
  square_checkout_url: string;
  images?: AdminProductImage[];
  // AI解析に使う画像（Driveのfile_id）。GAS側の項目名は selected_image_ids /
  // ai_selected_image_ids のどちらかで返るため、両方を任意項目として受ける。
  // 空配列＝指定解除（未選択）。未設定＝従来どおり先頭3枚を使用。
  selected_image_ids?: string[];
  ai_selected_image_ids?: string[];
  translation?: ProductTranslation | null;
  pokemon_card?: PokemonCardData;
  // 添付済みの書類（未添付は null/未設定）。
  document?: ProductDocument | null;
}

export interface AdminProductDetailResponse {
  success: boolean;
  version?: string;
  product: AdminProductDetail;
}

export interface PublishStatusUpdateResponse {
  success: boolean;
  version?: string;
  product_id: string;
  publish_status: string;
  // バックエンドが返す安全なエラー情報（公開拒否などの理由を表示する）
  error?: string;
  error_code?: string;
  message?: string;
}

export interface ProductUpdateResponse {
  success: boolean;
  version?: string;
  product_id: string;
  warning?: string;
  payment_link_status?: "created" | "failed";
}

export interface ProductImagesUpdateResponse {
  success: boolean;
  version?: string;
  product_id: string;
  image_count?: number;
  main_image_url?: string;
  images?: AdminProductImage[];
}

export interface InventoryStatusUpdateResponse {
  success: boolean;
  version?: string;
  product_id: string;
  inventory_status: string;
}

export interface RecordStatusUpdateResponse {
  success: boolean;
  version?: string;
  product_id: string;
  record_status: string;
  // バックエンドが返す安全なエラー情報（アーカイブ拒否などの理由を表示する）
  error?: string;
  error_code?: string;
  message?: string;
}

export interface DeleteProductResponse {
  success: boolean;
  version?: string;
  product_id: string;
  deleted?: boolean;
  error?: string;
}

export interface SquareProductCreateResponse {
  success: boolean;
  version?: string;
  product_id?: string;
  square_item_id?: string;
  square_variation_id?: string;
  sku?: string;
  product_name?: string;
  price_amount?: number;
  currency?: string;
  error?: string;
}

export interface SquareProductUpdateResponse {
  success: boolean;
  version?: string;
  product_id?: string;
  square_item_id?: string;
  square_variation_id?: string;
  product_name?: string;
  variation_name?: string;
  sku?: string;
  price_amount?: number;
  currency?: string;
  error?: string;
}

export interface SquareProductImageSyncResponse {
  success: boolean;
  version?: string;
  product_id?: string;
  square_item_id?: string;
  square_image_id?: string;
  square_image_url?: string;
  drive_file_id?: string;
  drive_file_name?: string;
  mime_type?: string;
  is_primary?: boolean;
  error?: string;
}

export interface SquareProductInventorySyncResponse {
  success: boolean;
  version?: string;
  product_id?: string;
  inventory_status?: string;
  record_status?: string;
  target_quantity?: string;
  previous_square_quantity?: string;
  square_quantity?: string;
  square_item_id?: string;
  square_variation_id?: string;
  location_id?: string;
  error?: string;
}

export interface ProductTranslationGenerateResponse {
  success: boolean;
  version?: string;
  translation?: ProductTranslation;
  save_result?: { data?: ProductTranslation };
  error?: string;
}

export interface ProductTranslationApproveResponse {
  success: boolean;
  version?: string;
  translation?: ProductTranslation;
  save_result?: { data?: ProductTranslation };
  error?: string;
}

export interface SquareProductionProductResponse {
  success: boolean;
  version?: string;
  product_id?: string;
  square_item_id?: string;
  square_variation_id?: string;
  product_name?: string;
  price_amount?: number;
  currency?: string;
  error?: string;
  error_code?: string;
  message?: string;
}

export interface SquarePaymentLinkResponse {
  success: boolean;
  version?: string;
  product_id?: string;
  square_variation_id?: string;
  square_payment_link_id?: string;
  square_checkout_url?: string;
  error?: string;
}

export interface SquareProductionDetailsSyncResponse {
  success: boolean;
  version?: string;
  product_id?: string;
  square_item_id?: string;
  square_variation_id?: string;
  error?: string;
}

export interface AdminProduct {
  created_at: string;
  product_id: string;
  category: string;
  brand: string;
  product_name: string;
  // 一覧API（GAS GET ?mode=admin）が返す保存済みの英語タイトル。
  // 未作成の場合は空文字。スニーカーの先頭タイトル表示・名前順ソートと、
  // 一覧インライン編集（下書きのみ／update_product の translated_title）で使う。
  // 本票の product_name とは別項目（保存時に product_name を書き換えない）。
  translated_title?: string;
  condition: string;
  purchase_price: number | null;
  planned_sale_price: number;
  storage_location: string;
  sneaker_sku?: string;
  sneaker_size?: number | null;
  main_image_display_url: string;
  publish_status: string;
  inventory_status: string;
  record_status: string;
  // Square 連携情報（mode=admin の一覧APIが返す）
  square_item_id?: string;
  square_variation_id?: string;
  square_payment_link_id?: string;
  square_checkout_url?: string;
}

export interface AdminProductListResponse {
  success: boolean;
  version?: string;
  count: number;
  products: AdminProduct[];
  // ページ分割モード（GAS 商品一覧API v3）のレスポンス項目。
  // 旧仕様（admin-product-list-v2）の応答では未設定。
  page?: number;
  page_size?: number;
  total_pages?: number;
  category?: string;
  record_status?: string;
  publish_status?: string;
  inventory_status?: string;
  search?: string;
  sort?: string;
}

// 一括公開の結果ステータス（5種類を独立して扱う）
export type BulkPublishStatus =
  | "success"
  | "partial_success"
  | "already_completed"
  | "skipped"
  | "failed";

export interface BulkPublishResultItem {
  product_id: string;
  product_name: string;
  status: BulkPublishStatus;
  reason?: string;
}

// ===== 一括AI生成（バッチ）: AI_BATCH_API_CONTRACT.md 準拠 =====
// 一括AI生成の受付に渡す最小の商品情報。
// product_items 型（/products の一覧）と、取込で得た product_id（/import）の
// どちらからでも渡せるようにするための軽量な型。
// 受付は product_id のみを使い、product_name は表示用の補助に使う。
export interface AiBatchTarget {
  product_id: string;
  product_name?: string;
}

// バッチ全体ステータス（契約 3.1）
export type AiBatchOverallStatus =
  | "queued"
  | "processing"
  | "completed"
  | "partially_failed"
  | "failed";

// 商品別ステータス（契約 3.2 の item.status）
export type AiBatchItemStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

// 表示用ステータス（pending かつ retry_count>0 を「再試行待ち」として区別する）
// contract_violation: GAS 契約外応答（status:"completed" と error_code の同時返却）。
// 成功表示はしないが、GAS 側は completed のため retry 対象に含まれない可能性がある。
export type AiBatchDisplayStatus =
  | "pending"
  | "retry_wait"
  | "processing"
  | "success"
  | "failed"
  | "contract_violation";

// create_ai_product_draft_batch の応答
export interface AiBatchCreateResponse {
  success: boolean;
  batch_id?: string;
  request_id?: string;
  status?: AiBatchOverallStatus;
  total_count?: number;
  is_reused?: boolean;
  created_at?: string;
  error?: string;
  error_code?: string;
  message?: string;
}

// get_ai_product_draft_batch の items[] 要素
export interface AiBatchItem {
  product_id?: string;
  status?: string;
  draft_id?: string | null;
  draft_version?: number | null;
  model_name?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  retry_count?: number;
  // GAS v102以降: 提案価格・価格根拠（candidate.price_note）・解析に使った画像
  proposed_price?: number | null;
  price_note?: string | null;
  // GAS v103: 価格根拠の種別。"cost_markup_floor" は「原価上乗せ下限」を採用したことを示す。
  price_basis?: string | null;
  source_image_ids?: string[];
}

// get_ai_product_draft_batch の応答
export interface AiBatchProgressResponse {
  success: boolean;
  batch_id?: string;
  request_id?: string;
  status?: AiBatchOverallStatus;
  total_count?: number;
  completed_count?: number;
  failed_count?: number;
  processing_count?: number;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  items?: AiBatchItem[];
  error?: string;
  error_code?: string;
  message?: string;
}

// retry_ai_product_draft_batch の応答（契約 2.3）
export interface AiBatchRetryResponse {
  success: boolean;
  batch_id?: string;
  request_id?: string;
  status?: AiBatchOverallStatus;
  total_count?: number;
  retried_count?: number;
  completed_count?: number;
  failed_count?: number;
  is_reused?: boolean;
  updated_at?: string;
  error?: string;
  error_code?: string;
  message?: string;
}

// 画面表示用の商品別アイテム
export interface AiBatchDisplayItem {
  product_id: string;
  product_name: string;
  status: AiBatchItemStatus;
  retry_count: number;
  error_code: string | null;
  error_message: string | null;
  // 契約の商品別応答（get_ai_product_draft_batch）に完了時に返る draft 識別子。
  // 進捗表示・商品詳細への導線の補助に使う（表示名の生成には使わない）。
  draft_id?: string | null;
  draft_version?: number | null;
  // GAS が返す提案価格と価格根拠（相場より原価上乗せ下限を優先した場合の理由も含む）
  proposed_price?: number | null;
  price_note?: string | null;
  // GAS v103: 価格根拠の種別（"cost_markup_floor" = 原価上乗せ下限を採用）
  price_basis?: string | null;
}

export const CATEGORY_LABELS: Record<string, string> = {
  sneaker: "スニーカー",
  jewelry: "ジュエリー",
  pokemon_card: "ポケモンカード",
  apparel: "アパレル",
  fashion_goods: "ファッション小物",
  other: "その他",
};

export const PUBLISH_STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  published: "公開中",
  hidden: "非公開",
};

export const INVENTORY_STATUS_LABELS: Record<string, string> = {
  in_stock: "在庫あり",
  reserved: "取り置き",
  sold: "売却済み",
};

export const RECORD_STATUS_LABELS: Record<string, string> = {
  active: "通常管理",
  archived: "アーカイブ済み",
};

// Square連携の有無（一覧で一目で分かるように表示する）
export const SQUARE_LINK_LABELS = {
  linked: "Square連携済み",
  unlinked: "Square未連携",
} as const;