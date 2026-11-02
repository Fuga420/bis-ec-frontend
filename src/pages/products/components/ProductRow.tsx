import { type MouseEvent } from "react";
import { Link } from "react-router-dom";
import ProductThumbnail from "./ProductThumbnail";
import ProductInlineEditor from "./ProductInlineEditor";
import type { AdminProduct } from "../types";
import { CATEGORY_LABELS, PUBLISH_STATUS_LABELS, INVENTORY_STATUS_LABELS, RECORD_STATUS_LABELS, SQUARE_LINK_LABELS } from "../types";
import { getProductDisplayTitle } from "../lib/productTitle";
import type { InlineEditDraft } from "../lib/inlineEdit";

interface ProductRowProps {
  product: AdminProduct;
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

// 全ステータスバッジ共通の見た目（角丸6px・高さ22px・11px/500・余白を圧縮して統一）
const badgeBase =
  "inline-flex h-[22px] max-w-full items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium leading-none";

// 行右端の操作アイコン共通スタイル（36px のクリック領域・薄いグレー枠線・角丸8px・16pxアイコン）。
// 商品詳細への遷移と編集はどちらもこの見た目で並べ、アイコンとアクセシブル名で区別する。
const actionIconBase =
  "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-background-300 bg-white text-base text-foreground-500 transition-colors hover:border-background-400 hover:bg-background-100 hover:text-foreground-800 focus:outline-none focus-visible:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-background-300 disabled:hover:bg-white";

// 右端の操作列幅（詳細36 + 間隔6 + 別タブ36 + 間隔6 + 編集36 + 右余白16 = 136px）。
// ヘッダー側と合わせて桁を固定する。
export const ACTION_COLUMN_WIDTH = "w-[136px]";

// バッジの色は「意味」で固定する（tone-neutral / tone-success / tone-warning）。
// 公開状態以外の色は使わない。
const statusStyles: Record<string, string> = {
  draft: "tone-neutral",
  published: "tone-success",
  hidden: "tone-neutral",
};

const inventoryStyles: Record<string, string> = {
  in_stock: "tone-success",
  reserved: "tone-warning",
  sold: "tone-neutral",
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
    statusStyles[product.publish_status] ?? "tone-neutral";
  const inventoryLabel =
    INVENTORY_STATUS_LABELS[product.inventory_status] ??
    (product.inventory_status || "—");
  const inventoryClass =
    inventoryStyles[product.inventory_status] ?? "tone-neutral";
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

  // 編集中は行全体をインライン編集UIに差し替える（チェック・詳細リンクは表示しない）。
  if (isEditing) {
    return (
      <ProductInlineEditor
        product={product}
        draft={draft}
        saving={saving}
        error={editError}
        onChange={onDraftChange}
        onSave={() => onSave(product)}
        onCancel={onCancelEdit}
      />
    );
  }

  const statusBadge = (
    <span className={`${badgeBase} ${statusClass}`}>{statusLabel}</span>
  );

  const inventoryBadge = (
    <span className={`${badgeBase} ${inventoryClass}`}>{inventoryLabel}</span>
  );

  const recordStatusLabel =
    RECORD_STATUS_LABELS[product.record_status] ??
    (product.record_status || "—");
  const recordStatusBadge =
    product.record_status === "archived" ? (
      <span className={`${badgeBase} tone-neutral`}>{recordStatusLabel}</span>
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
  // 補助情報バッジ（サイズ）: グリーンはステータス専用のため、通常はニュートラルなグレーで表示する
  const sneakerSizeBadge = isSneaker ? (
    <span
      className={`${badgeBase} ${hasSize ? "tone-neutral" : "tone-warning"}`}
    >
      <i
        className={`${
          hasSize ? "ri-ruler-2-line" : "ri-error-warning-line"
        } w-3 h-3 flex items-center justify-center text-xs`}
      ></i>
      {hasSize ? `サイズ ${sneakerSizeText}` : "サイズ未設定"}
    </span>
  ) : null;

  // 補助情報バッジ（Square連携）: 連携済みはグレー、未連携のみ注意色
  const squareBadge = (
    <span
      className={`${badgeBase} ${isSquareLinked ? "tone-neutral" : "tone-warning"}`}
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

  // ブランドは 12px のグレー文字。未設定なら要素自体を出さず、空行を作らない。
  const brandText = (product.brand ?? "").toString().trim();
  const hasBrand = brandText !== "";

  // 商品の状態（コンディション）。独立した列ではなくメタ情報行に出すので、
  // 未設定のときは「—」ではなく何も表示しない。
  const conditionText = (product.condition ?? "").toString().trim();

  // 商品名の下に置く補助情報バッジ（サイズ・Square連携・アーカイブ状態）。
  // すべて無い場合はバッジ行そのものを描画しない。
  const hasBadges = Boolean(
    sneakerSizeBadge || squareBadge || recordStatusBadge
  );

  // 一覧行の編集（インライン編集）を開くボタン。
  // 権限は従来どおり canEdit（下書き かつ 一括処理中でない）に従う。
  const editButton = canEdit ? (
    <button
      type="button"
      onClick={() => onStartEdit(product)}
      disabled={selectDisabled}
      aria-label={`${name} を編集`}
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
    <div className="border-b border-background-200 last:border-b-0">
      {/* 選択中はごく薄いグリーン系の背景を保持し、ホバー時はその選択色を一段濃くして
          「選択中の背景」と「ホバー」が競合しないようにする（未選択はホバーで薄いニュートラルグレー）。 */}
      <div
        className={`group/row flex items-stretch transition-colors duration-150 ${
          isSelected
            ? "bg-primary-100/60 hover:bg-primary-100"
            : "hover:bg-background-100"
        }`}
      >
        {/* チェックボックスは Link の外に配置し、操作時に詳細へ遷移しないようにする */}
        <div className="flex w-10 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={isSelected}
            disabled={selectDisabled}
            onChange={() => onToggleSelect(product.product_id)}
            aria-label={`${name} を選択`}
            className="h-4 w-4 cursor-pointer accent-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <Link
          to={`/products/${product.product_id}`}
          onClick={handleNavigateToDetail}
          className="block min-w-0 flex-1 cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
        >
          {/* デスクトップ（一覧表）
              画像を主役にするためサムネイルを112pxに拡大し、行の最小高さも画像に合わせる。
              画面幅を1024pxに統一したので、商品ID・商品の状態・登録日時は独立した列をやめ、
              商品名の下の1行（薄いメタ情報）にまとめた。
              視線は「画像 → 商品名 → 価格」の順に流れる。 */}
          <div className="hidden items-center gap-4 px-4 py-4 lg:flex lg:min-h-[152px]">
            <ProductThumbnail
              src={product.main_image_display_url}
              alt={name}
              size="lg"
            />
            {/* 商品情報セル: 商品名 → ブランド → 補助バッジ → メタ情報 の順で整理する。
                幅が足りない場合はセル内で折り返し、隣の列にはみ出さない。 */}
            <div className="min-w-0 flex-1">
              {/* 商品名は最大2行まで表示し、超過分は末尾を省略する。
                  欧文書体（Archivo→Inter）を当てて字間を詰め、見出しとしての密度を出す。 */}
              <p
                className={`admin-title line-clamp-2 text-[16px] font-semibold leading-snug ${
                  isNameMissing
                    ? "text-foreground-400"
                    : "text-foreground-950 group-hover/row:text-primary-600"
                }`}
              >
                {displayName}
              </p>
              {hasBrand && (
                <p className="admin-eyebrow mt-1.5 truncate text-[10px] font-semibold leading-none text-foreground-400">
                  {brandText}
                </p>
              )}
              {hasBadges && (
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                  {sneakerSizeBadge}
                  {squareBadge}
                  {recordStatusBadge}
                </div>
              )}
              {/* 商品ID・商品の状態・登録日時は、視線の主役ではないため一段弱いトーンに落とす */}
              <p className="mt-2 flex min-w-0 items-center gap-2 truncate text-[11px] text-foreground-400">
                <span className="shrink-0 font-mono tabular-nums">
                  {product.product_id}
                </span>
                {conditionText && (
                  <span className="shrink-0 truncate">{conditionText}</span>
                )}
                <span className="shrink-0 tabular-nums">
                  {formatDate(product.created_at)}
                </span>
              </p>
            </div>
            <span className="w-[88px] shrink-0 truncate text-xs text-foreground-500">
              {categoryLabel}
            </span>
            <span
              className={`admin-numeric w-[104px] shrink-0 whitespace-nowrap text-right tracking-tight ${
                hasPrice
                  ? "text-[17px] font-bold text-foreground-950"
                  : "text-[14px] font-medium text-foreground-400"
              }`}
            >
              {priceText}
            </span>
            <span className="flex w-[84px] shrink-0 overflow-hidden">
              {statusBadge}
            </span>
            <span className="flex w-[84px] shrink-0 overflow-hidden">
              {inventoryBadge}
            </span>
          </div>

          {/* モバイル（画像88pxで、デスクトップと同じ階層感を保つ） */}
          <div className="flex items-center gap-3 px-4 py-3 lg:hidden">
            <ProductThumbnail
              src={product.main_image_display_url}
              alt={name}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p
                className={`admin-title line-clamp-2 text-[15px] font-semibold leading-snug ${
                  isNameMissing ? "text-foreground-400" : "text-foreground-950"
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
                {sneakerSizeBadge}
                {statusBadge}
                {inventoryBadge}
                {squareBadge}
                {recordStatusBadge}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p
                className={`admin-numeric whitespace-nowrap tracking-tight ${
                  hasPrice
                    ? "text-base font-bold text-foreground-950"
                    : "text-[13px] font-medium text-foreground-400"
                }`}
              >
                {priceText}
              </p>
              <p className="mt-1 text-xs text-foreground-500">{categoryLabel}</p>
            </div>
          </div>
        </Link>

        {/* 右端の操作列（Link の外に置き、行クリック＝詳細／編集ボタン＝編集で競合させない）。
            デスクトップは「詳細」「別タブ」「編集」の3スロット固定幅。編集不可の行も空スロットを確保し、
            アイコンの左右位置が行ごとにずれないようにする。 */}
        <div
          className={`hidden ${ACTION_COLUMN_WIDTH} shrink-0 items-center justify-end gap-1.5 pr-4 lg:flex`}
        >
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
          {editButton ?? <span className="h-9 w-9 shrink-0" aria-hidden="true"></span>}
        </div>

        {/* モバイルの操作列（行タップ＝詳細のため、編集のみ表示する）。 */}
        <div className="flex w-12 shrink-0 items-center justify-center lg:hidden">
          {editButton}
        </div>
      </div>

      {/* 保存失敗などの理由は、編集を閉じた後も該当行に表示し続ける */}
      {editError && (
        <p className="flex items-start gap-1.5 bg-red-50 px-4 py-2 text-xs font-medium text-red-700">
          <i className="ri-error-warning-line mt-0.5 w-3.5 h-3.5 flex items-center justify-center shrink-0"></i>
          <span className="min-w-0 flex-1">{editError}</span>
        </p>
      )}
    </div>
  );
}