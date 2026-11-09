import { type MouseEvent } from "react";
import { Link } from "react-router-dom";
import ProductThumbnail from "./ProductThumbnail";
import ProductInlineEditor from "./ProductInlineEditor";
import LedgerMatchCell from "./LedgerMatchCell";
import type { AdminProduct } from "../types";
import type { LedgerMatchStatus } from "../lib/ledgerMatch";
import { CATEGORY_LABELS, PUBLISH_STATUS_LABELS, INVENTORY_STATUS_LABELS, RECORD_STATUS_LABELS, SQUARE_LINK_LABELS } from "../types";
import { getProductDisplayTitle } from "../lib/productTitle";
import type { InlineEditDraft } from "../lib/inlineEdit";
import {
  ACTION_COLUMN_WIDTH,
  COL_CATEGORY,
  COL_IMAGE,
  COL_INVENTORY,
  COL_LEDGER,
  COL_NAME,
  COL_PRICE,
  COL_PUBLISH,
} from "./productTableColumns";

interface ProductRowProps {
  product: AdminProduct;
  // 仕入照合の状態（対象外・未取得は undefined＝「—」表示）。
  ledgerMatch?: LedgerMatchStatus;
  ledgerMatchLoading: boolean;
  isSelected: boolean;
  onToggleSelect: (productId: string) => void;
  selectDisabled: boolean;
  // インライン編集（下書きのみ）。表示タイトルと販売予定価格をその場で編集する。
  canEdit: boolean;
  isEditing: boolean;
  draft: InlineEditDraft;
  saving: boolean;
  editError?: string;
  onStartEdit: (product: AdminProduct) => void;
  onCancelEdit: () => void;
  onDraftChange: (patch: Partial<InlineEditDraft>) => void;
  onSave: (product: AdminProduct) => void;
  // 商品詳細へ遷移する直前に、一覧の表示状態（検索・ページ・スクロール位置）を残すための通知。
  onNavigateToDetail?: () => void;
}

// 全ステータスバッジ共通の見た目（角丸6px・高さ22px・11px/500）。
// 寸法とドメイン色は index.css の .st-badge / .st-* に集約し、画面ごとに色を作らない。
const badgeBase = "st-badge";

// 行右端の操作アイコン共通スタイル（36px のクリック領域・薄いグレー枠線・角丸8px・16pxアイコン）。
// 商品詳細への遷移と編集はどちらもこの見た目で並べ、アイコンとアクセシブル名で区別する。
const actionIconBase =
  "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-background-300 bg-white text-base text-foreground-500 transition-colors hover:border-background-400 hover:bg-background-100 hover:text-foreground-800 focus:outline-none focus-visible:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-background-300 disabled:hover:bg-white";

// 色は「ドメイン」で固定する（index.css の .st-* を参照）。
// 公開状態 = 緑 / 在庫 = 青グレー / 照合 = 黄 / 連携 = グレー。
// 同じ色を別の意味に使い回さないため、ここでは色を追加しない。
const statusStyles: Record<string, string> = {
  draft: "st-publish-off",
  published: "st-publish",
  hidden: "st-publish-off",
};

const inventoryStyles: Record<string, string> = {
  in_stock: "st-inventory",
  reserved: "st-inventory-soft",
  sold: "st-inventory-off",
};

// スニーカーのサイズが入力済みか判定する（null・空文字・0 は未入力扱い）
function hasSneakerSize(value: number | null | undefined): boolean {
  if (value == null) return false;
  const text = String(value).trim();
  return text !== "" && text !== "0";
}

// 一覧表示用のサイズ表記（例: 27.5cm）。未入力なら空文字を返す。
// GAS側のデータは「27.5cm」のように単位込みで入っていることがあるため、
// 末尾の単位を落としてから付け直す（cmcm の二重表記を防ぐ）。
function formatSneakerSize(value: number | null | undefined): string {
  if (!hasSneakerSize(value)) return "";
  const raw = String(value)
    .trim()
    .replace(/(cm|センチ|㎝)+$/i, "")
    .trim();
  if (raw === "" || raw === "0") return "";
  return `${raw}cm`;
}

function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ProductRow({
  product,
  ledgerMatch,
  ledgerMatchLoading,
  isSelected,
  onToggleSelect,
  selectDisabled,
  canEdit,
  isEditing,
  draft,
  saving,
  editError,
  onStartEdit,
  onCancelEdit,
  onDraftChange,
  onSave,
  onNavigateToDetail,
}: ProductRowProps) {
  const categoryLabel =
    CATEGORY_LABELS[product.category] ?? (product.category || "—");
  const statusLabel =
    PUBLISH_STATUS_LABELS[product.publish_status] ??
    (product.publish_status || "—");
  const statusClass =
    statusStyles[product.publish_status] ?? "st-publish-off";
  const inventoryLabel =
    INVENTORY_STATUS_LABELS[product.inventory_status] ??
    (product.inventory_status || "—");
  const inventoryClass =
    inventoryStyles[product.inventory_status] ?? "st-inventory-off";
  // 価格が未設定の行は「情報が無い」ことが伝わるよう、グレー＋少し小さい文字で控えめに置く。
  const hasPrice = Boolean(
    product.planned_sale_price && product.planned_sale_price > 0
  );
  const priceText = hasPrice
    ? `¥${product.planned_sale_price!.toLocaleString("ja-JP")}`
    : "価格未設定";
  // 先頭の大きな商品タイトルはスニーカーだけ英語タイトル優先
  // （スニーカー: translated_title → product_name、それ以外: product_name → 「商品名なし」）。
  // デスクトップ・モバイルの両表示でこの値を使う。
  const name = getProductDisplayTitle(product);
  // 商品名が未入力の行は、グレーの「（商品名なし）」を並べず、控えめなグレー文字で置く
  const isNameMissing = name === "（商品名なし）";
  const displayName = isNameMissing ? "商品名未入力" : name;

  // 同じタブで商品詳細へ移動する時だけ、一覧の表示状態を残すよう依頼する。
  // 新しいタブで開く操作や修飾キー付きクリックでは、現在の一覧を離れないため何もしない。
  const handleNavigateToDetail = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented) return;
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    onNavigateToDetail?.();
  };

  // 編集中は行を残したまま、その直下にインライン編集フォームを展開する。
  // 行タップで詳細へ移動すると未保存の入力が失われるため、編集中だけ行リンクを無効化する
  // （それ以外の行クリック挙動・詳細遷移は従来どおり）。
  const handleRowLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (isEditing) {
      event.preventDefault();
      return;
    }
    handleNavigateToDetail(event);
  };

  const statusBadge = (
    <span className={`${badgeBase} ${statusClass}`}>{statusLabel}</span>
  );

  const inventoryBadge = (
    <span className={`${badgeBase} ${inventoryClass}`}>{inventoryLabel}</span>
  );

  const recordStatusLabel =
    RECORD_STATUS_LABELS[product.record_status] ??
    (product.record_status || "—");
  const testBadge = product.is_test ? (
    <span className={`${badgeBase} st-muted`}>テスト商品</span>
  ) : null;
  const recordStatusBadge =
    product.record_status === "archived" ? (
      <span className={`${badgeBase} st-muted`}>{recordStatusLabel}</span>
    ) : null;

  // Square連携の有無（Variation/Item ID のどちらかが入っていれば連携済みとみなす）
  const isSquareLinked = Boolean(
    (product.square_variation_id || product.square_item_id || "")
      .toString()
      .trim()
  );
  // スニーカーだけサイズを表示する（未入力は公開できないため、そのことも一目で分かるようにする）
  const isSneaker = product.category === "sneaker";
  const sneakerSizeText = formatSneakerSize(product.sneaker_size);
  const hasSize = sneakerSizeText !== "";
  // 補助情報バッジ（サイズ）: ドメイン色（公開・在庫・照合・連携）は状態専用のため、
  // 補助情報は色を持たせず枠線のグレーで表示する。未設定はアイコンで注意を示す。
  const sneakerSizeBadge = isSneaker ? (
    <span
      className={`${badgeBase} st-muted`}
      title={hasSize ? undefined : "公開にはサイズの入力が必要です"}
    >
      <i
        className={`${
          hasSize ? "ri-ruler-2-line" : "ri-error-warning-line"
        } w-3 h-3 flex items-center justify-center text-xs`}
      ></i>
      {hasSize ? `サイズ ${sneakerSizeText}` : "サイズ未設定"}
    </span>
  ) : null;

  // 連携ドメインのバッジ（Square）: 連携済み＝グレー塗り / 未連携＝グレー枠線。
  // 「未連携」を黄色にしないことで、黄色は照合ドメイン専用に保つ。
  const squareBadge = (
    <span
      className={`${badgeBase} ${isSquareLinked ? "st-link" : "st-link-soft"}`}
    >
      <i
        className={`${
          isSquareLinked ? "ri-link" : "ri-link-unlink"
        } w-3 h-3 flex items-center justify-center text-xs`}
      ></i>
      {isSquareLinked
        ? SQUARE_LINK_LABELS.linked
        : SQUARE_LINK_LABELS.unlinked}
    </span>
  );

  // ブランドは 10px のグレー文字。未設定なら要素自体を出さず、空行を作らない。
  const brandText = (product.brand ?? "").toString().trim();
  const hasBrand = brandText !== "";

  // 商品の状態（コンディション）。独立した列ではなくメタ情報行に出すので、
  // 未設定のときは「—」ではなく何も表示しない。
  const conditionText = (product.condition ?? "").toString().trim();

  // 商品名の下に置く補助情報バッジ（サイズ・Square連携・アーカイブ状態）。
  // すべて無い場合はバッジ行そのものを描画しない。
  const hasBadges = Boolean(
    testBadge || sneakerSizeBadge || squareBadge || recordStatusBadge
  );

  // 一覧行の編集（インライン編集）を開くボタン。
  // 権限は従来どおり canEdit（下書き かつ 一括処理中でない）に従う。
  const editButton = canEdit ? (
    <button
      type="button"
      onClick={() => onStartEdit(product)}
      disabled={selectDisabled}
      aria-label={`${name} を編集`}
      aria-expanded={isEditing}
      title="商品を編集"
      className={actionIconBase}
    >
      <i className="ri-edit-line"></i>
    </button>
  ) : null;

  // 商品詳細を新しいタブで開くボタン（同じ詳細画面を別タブ表示）。
  // 現在のタブは一覧のまま維持したいときに使う。
  const openInNewTabButton = (
    <Link
      to={`/products/${product.product_id}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name} の商品詳細を新しいタブで開く`}
      title="商品詳細を新しいタブで開く"
      className={actionIconBase}
    >
      <i className="ri-external-link-line"></i>
    </Link>
  );

  return (
    <div
      className={`border-b border-background-200 last:border-b-0 ${
        isEditing ? "bg-white" : ""
      }`}
    >
      {/* 行の4状態（通常・ホバー・選択・選択ホバー）は .product-row 側で管理する。
          選択中でも背景はニュートラルなグレーにとどめ、選択の判別はチェックボックスの深緑で行う。
          編集中の行は薄いニュートラル（#F8FAFC 相当）で強調し、編集フォームとつなげる。 */}
      <div
        className={`product-row group/row flex items-stretch ${
          isSelected ? "is-selected" : ""
        } ${isEditing ? "is-editing" : ""}`}
      >
        {/* チェックボックスは Link の外に配置し、操作時に詳細へ遷移しないようにする */}
        <div className="flex w-11 shrink-0 items-center justify-center">
          <label className="product-checkbox">
            <input
              type="checkbox"
              checked={isSelected}
              disabled={selectDisabled}
              onChange={() => onToggleSelect(product.product_id)}
              aria-label={`${name} を選択`}
            />
            <span className="product-checkbox-box" aria-hidden="true">
              <i className="ri-check-line"></i>
            </span>
          </label>
        </div>

        <Link
          to={`/products/${product.product_id}`}
          onClick={handleRowLinkClick}
          className="block min-w-0 flex-1 cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
        >
          {/* デスクトップ（一覧表）
              情報密度を優先し、画像64px・上下余白12pxの行（標準80px前後）に揃える。
              商品ID・ブランド・商品の状態・登録日時・補助バッジは、商品名の下の1行に
              まとめて折り返す。視線は「画像 → 商品名 → 価格」の順に流れる。 */}
          <div className="hidden items-center gap-3 px-4 py-3 lg:flex lg:min-h-[80px]">
            {/* 画像列はヘッダーの「画像」ラベルと同じ幅（64px）に固定する */}
            <span className={`flex items-center ${COL_IMAGE}`}>
              <ProductThumbnail
                src={product.main_image_display_url}
                alt={name}
                size="lg"
              />
            </span>
            {/* 商品情報列は最小320pxを確保しつつ、余剰幅を最も多く受け取る。
                ただし他列にも比率で余剰幅を配分するため、右側の状態列が
                端に寄って詰まることはない（列幅は productTableColumns に集約）。 */}
            <div className={COL_NAME}>
              {/* 商品名は最大2行（13〜14px / 600）。超過分は末尾を省略し、
                  全文は商品詳細で確認できる。行の高さが商品名で伸びすぎないよう行間も詰める。
                  商品名未入力は「情報待ちの下書き」でありエラーではないため、
                  色を薄く・ウェイトを1段落として（500）控えめに置き、通常の商品名を主役にする。 */}
              <p
                className={`admin-title line-clamp-2 text-[13.5px] leading-snug ${
                  isNameMissing
                    ? "font-medium text-foreground-400"
                    : "font-semibold text-foreground-950"
                }`}
              >
                {displayName}
              </p>
              {/* 補助情報（ブランド・商品ID・状態・登録日時・補助バッジ）は1行にまとめ、
                  収まらない場合だけ折り返す。縦の間隔を詰めて行の高さを一定に保つ。 */}
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-none text-foreground-400">
                {hasBrand && (
                  <span className="admin-eyebrow max-w-[160px] shrink-0 truncate text-[10px] font-semibold uppercase">
                    {brandText}
                  </span>
                )}
                <span className="shrink-0 whitespace-nowrap font-mono tabular-nums">
                  {product.product_id}
                </span>
                {conditionText && (
                  <span className="min-w-0 max-w-[160px] truncate">
                    {conditionText}
                  </span>
                )}
                <span className="shrink-0 whitespace-nowrap tabular-nums">
                  {formatDate(product.created_at)}
                </span>
                {hasBadges && (
                  <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                    {/* 並び順は全画面で統一: 公開 → 在庫 → 照合 → 連携 → 補助情報 */}
                    {squareBadge}
                    {testBadge}
                    {recordStatusBadge}
                    {sneakerSizeBadge}
                  </span>
                )}
              </div>
            </div>
            <span className={`${COL_CATEGORY} truncate text-xs text-foreground-500`}>
              {categoryLabel}
            </span>
            {/* 価格未設定は「¥0」ではなく補助テキストとして淡く置く。
                入力済みの価格（15px / 700）との差で、価格の有無が一目で分かる。 */}
            <span
              className={`admin-numeric ${COL_PRICE} whitespace-nowrap text-right tracking-tight ${
                hasPrice
                  ? "text-[15px] font-bold text-foreground-950"
                  : "text-[12.5px] font-normal text-foreground-400"
              }`}
            >
              {priceText}
            </span>
            <span className={`flex ${COL_PUBLISH} overflow-hidden`}>
              {statusBadge}
            </span>
            <span className={`flex ${COL_INVENTORY} overflow-hidden`}>
              {inventoryBadge}
            </span>
            {/* 仕入照合: 紐付け先の仕入書類が照合済みかどうか（一覧表示用） */}
            <span className={`flex ${COL_LEDGER} overflow-hidden`}>
              <LedgerMatchCell
                status={ledgerMatch}
                loading={ledgerMatchLoading}
              />
            </span>
          </div>

          {/* モバイル（画像72pxで、デスクトップと同じ階層感を保つ） */}
          <div className="flex items-center gap-3 px-4 py-3 lg:hidden">
            <ProductThumbnail
              src={product.main_image_display_url}
              alt={name}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p
                className={`admin-title line-clamp-2 text-[15px] leading-snug ${
                  isNameMissing
                    ? "font-medium text-foreground-400"
                    : "font-semibold text-foreground-950"
                }`}
              >
                {displayName}
              </p>
              {hasBrand && (
                <p className="admin-eyebrow mt-1.5 truncate text-[10px] font-semibold leading-none text-foreground-400">
                  {brandText}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-foreground-400">
                  {product.product_id}
                </span>
                {/* 並び順は全画面で統一: 公開 → 在庫 → 照合 → 連携 → 補助情報 */}
                {statusBadge}
                {inventoryBadge}
                <LedgerMatchCell
                  status={ledgerMatch}
                  loading={ledgerMatchLoading}
                />
                {squareBadge}
                {testBadge}
                {recordStatusBadge}
                {sneakerSizeBadge}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p
                className={`admin-numeric whitespace-nowrap tracking-tight ${
                  hasPrice
                    ? "text-base font-bold text-foreground-950"
                    : "text-[12.5px] font-normal text-foreground-400"
                }`}
              >
                {priceText}
              </p>
              <p className="mt-1 text-xs text-foreground-500">{categoryLabel}</p>
            </div>
          </div>
        </Link>

        {/* 右端の操作列（Link の外に置き、行クリック＝詳細／編集ボタン＝編集で競合させない）。
            デスクトップは「詳細」「別タブ」「編集」の3スロット固定幅（128px）。編集不可の行も空スロットを確保し、
            アイコンの左右位置が行ごとにずれないようにする。
            編集中は詳細系の操作を出さず、フォームへ視線を集める（列幅は維持して桁を揃える）。 */}
        <div
          className={`hidden ${ACTION_COLUMN_WIDTH} shrink-0 items-center justify-end gap-1 pr-2 lg:flex`}
        >
          {!isEditing && (
            <>
              <Link
                to={`/products/${product.product_id}`}
                onClick={handleNavigateToDetail}
                aria-label={`${name} の商品詳細を表示`}
                title="商品詳細を表示"
                className={actionIconBase}
              >
                <i className="ri-arrow-right-line"></i>
              </Link>
              {openInNewTabButton}
              {editButton ?? (
                <span className="h-9 w-9 shrink-0" aria-hidden="true"></span>
              )}
            </>
          )}
        </div>

        {/* モバイルの操作列（行タップ＝詳細のため、編集のみ表示する）。 */}
        <div className="flex w-12 shrink-0 items-center justify-center lg:hidden">
          {!isEditing && editButton}
        </div>
      </div>

      {/* 編集フォームは編集対象の行の直下に展開し、行とフォームをヘアライン1本でつなぐ */}
      {isEditing && (
        <ProductInlineEditor
          product={product}
          draft={draft}
          saving={saving}
          error={editError}
          onChange={onDraftChange}
          onSave={() => onSave(product)}
          onCancel={onCancelEdit}
        />
      )}

      {/* 保存失敗などの理由は、編集を閉じた後も該当行に表示し続ける */}
      {!isEditing && editError && (
        <p className="flex items-start gap-1.5 bg-red-50 px-4 py-2 text-xs font-medium text-red-700">
          <i className="ri-error-warning-line mt-0.5 w-3.5 h-3.5 flex items-center justify-center shrink-0"></i>
          <span className="min-w-0 flex-1">{editError}</span>
        </p>
      )}
    </div>
  );
}