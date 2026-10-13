import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
import type {
  AdminProduct,
  AdminProductDetail,
  AdminProductDetailResponse,
  AdminProductImage,
  AdminProductListResponse,
  ProductDocument,
  ProductImagesUpdateResponse,
  PublishStatusUpdateResponse,
  ProductUpdateResponse,
  InventoryStatusUpdateResponse,
  RecordStatusUpdateResponse,
  DeleteProductResponse,
  SquarePaymentLinkResponse,
  SquareProductionDetailsSyncResponse,
} from "../types";
import { CATEGORY_LABELS, PUBLISH_STATUS_LABELS, RECORD_STATUS_LABELS } from "../types";
import {
  extractAiDraftPrice,
  getAiProductDraft,
} from "@/pages/register/lib/aiProduct";
import EditForm from "./components/EditForm";
import ImageEditor, { type ImageSavePayload } from "./components/ImageEditor";
import ImageLightbox from "./components/ImageLightbox";
import ProductTranslationSection from "./components/ProductTranslationSection";
import SquareIntegrationSection from "./components/SquareIntegrationSection";
import ProductDocumentPanel from "./components/ProductDocumentPanel";

type LoadState = "loading" | "success" | "error";
type SaveState = "idle" | "saving";

const PUBLISH_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "draft", label: "下書き" },
  { value: "published", label: "公開中" },
  { value: "hidden", label: "非公開" },
];

const INVENTORY_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "in_stock", label: "在庫あり" },
  { value: "reserved", label: "取り置き / 商談中" },
  { value: "sold", label: "売却済み" },
];

const RECORD_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "active", label: RECORD_STATUS_LABELS.active },
  { value: "archived", label: RECORD_STATUS_LABELS.archived },
];

const statusStyles: Record<string, string> = {
  draft: "bg-background-100 text-foreground-600",
  published: "bg-primary-100 text-primary-500",
  hidden: "bg-background-100 text-foreground-600",
};

function formatPrice(value: number | null | undefined): string {
  if (!value || value <= 0) return "価格未設定";
  return `¥${value.toLocaleString("ja-JP")}`;
}

// 一覧API（mode=admin）の商品情報から、詳細画面表示に必要な最小限の情報を組み立てる。
// 詳細API（mode=admin&product_id=...）が取得できない商品でも、
// 一覧APIに情報があれば商品名・価格などの取得できた情報を表示するためのフォールバック。
// 詳細APIにしか無い項目（説明・備考・カテゴリ固有項目・AI下書き等）は空のまま返す。
function mapListProductToDetail(product: AdminProduct): AdminProductDetail {
  const images: AdminProductImage[] = product.main_image_display_url
    ? [{ file_id: "", display_url: product.main_image_display_url }]
    : [];
  return {
    product_id: product.product_id,
    category: product.category ?? "",
    brand: product.brand ?? "",
    product_name: product.product_name ?? "",
    condition: product.condition ?? "",
    purchase_price: product.purchase_price ?? null,
    planned_sale_price: product.planned_sale_price ?? 0,
    storage_location: product.storage_location ?? "",
    sneaker_sku: product.sneaker_sku ?? "",
    sneaker_size: product.sneaker_size ?? null,
    publish_status: product.publish_status ?? "draft",
    inventory_status: product.inventory_status ?? "",
    record_status: product.record_status ?? "active",
    square_item_id: product.square_item_id ?? "",
    square_variation_id: product.square_variation_id ?? "",
    square_payment_link_id: product.square_payment_link_id ?? "",
    square_checkout_url: product.square_checkout_url ?? "",
    images,
  };
}

// スニーカーのサイズが入力済みか判定する（未入力・0 は未入力扱い）
function hasSneakerSize(value: number | null | undefined): boolean {
  if (value == null) return false;
  const text = String(value).trim();
  return text !== "" && text !== "0";
}

// バックエンドが返す安全なエラー情報を表示用に整形する（秘密値は含まない）
function extractBackendError(
  data: { error?: string; message?: string; error_code?: string } | null,
  fallback: string
): string {
  if (!data) return fallback;
  const message = (data.message ?? data.error ?? "").toString().trim();
  const code = (data.error_code ?? "").toString().trim();
  if (message && code) return `${message}（コード: ${code}）`;
  if (message) return message;
  return fallback;
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

function InfoRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  const hasValue = Boolean(value && value.trim());
  return (
    <div className="flex items-start gap-4 border-b border-background-100 py-2.5 last:border-b-0">
      <span className="w-28 shrink-0 whitespace-nowrap pt-0.5 text-xs text-foreground-500">
        {label}
      </span>
      <span
        className={`min-w-0 flex-1 break-words text-[13px] ${
          !hasValue
            ? "text-foreground-300"
            : emphasize
              ? "font-semibold text-foreground-950"
              : "font-medium text-foreground-900"
        }`}
      >
        {hasValue ? value : "—"}
      </span>
    </div>
  );
}

function DescriptionBlock({ label, value }: { label: string; value: string }) {
  const hasValue = Boolean(value && value.trim());
  return (
    <div className="mt-3 first:mt-0">
      <p className="text-xs text-foreground-500">{label}</p>
      <p
        className={`mt-1 max-w-full whitespace-pre-wrap break-words text-[13px] leading-relaxed ${
          hasValue ? "text-foreground-800" : "text-foreground-300"
        }`}
      >
        {hasValue ? value : "—"}
      </p>
    </div>
  );
}

// 管理パネル（公開状態・在庫状態・英語翻訳）で共通利用する保存結果メッセージ。
// success / error / warning の3種を、全パネルで同一の見た目に揃える。
function PanelMessage({
  type,
  text,
}: {
  type: "success" | "error" | "warning";
  text: string;
}) {
  if (type === "warning") {
    return (
      <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
        <i className="ri-error-warning-line w-4 h-4 flex items-center justify-center shrink-0"></i>
        <span className="min-w-0 flex-1">{text}</span>
      </div>
    );
  }
  const success = type === "success";
  return (
    <p
      className={`mt-3 flex items-center gap-1.5 text-sm font-medium ${
        success ? "text-primary-700" : "text-red-600"
      }`}
    >
      <i
        className={`${
          success ? "ri-checkbox-circle-line" : "ri-error-warning-line"
        } w-4 h-4 flex items-center justify-center shrink-0`}
      ></i>
      <span className="min-w-0 flex-1">{text}</span>
    </p>
  );
}

// 公開ステータスバッジのスタイル（現在保存されている状態の可視化用）
const PUBLISH_BADGE_STYLES: Record<string, string> = {
  draft: "bg-background-100 text-foreground-600",
  published: "bg-primary-100 text-primary-700",
  hidden: "bg-background-100 text-foreground-600",
};

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [product, setProduct] = useState<AdminProductDetail | null>(null);
  // 詳細APIで取得できず、一覧APIの情報で表示しているか（部分表示の案内用）
  const [isPartialLoad, setIsPartialLoad] = useState(false);
  // AIドラフト（get_ai_product_draft）の candidate.price。
  // 本票(planned_sale_price)が未設定のときの編集初期値としてのみ使う。
  const [aiDraftPrice, setAiDraftPrice] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  const [selectedInventoryStatus, setSelectedInventoryStatus] = useState<string>("");
  const [inventorySaveState, setInventorySaveState] = useState<SaveState>("idle");
  const [inventoryMessage, setInventoryMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [recordSaveState, setRecordSaveState] = useState<SaveState>("idle");
  const [recordMessage, setRecordMessage] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);
  const [restoreRegenerateLink, setRestoreRegenerateLink] = useState(false);

  const [deleteSaveState, setDeleteSaveState] = useState<SaveState>("idle");
  const [deleteMessage, setDeleteMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editSaveState, setEditSaveState] = useState<SaveState>("idle");
  const [editMessage, setEditMessage] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  const [isImageEditing, setIsImageEditing] = useState(false);
  const [imageSaveState, setImageSaveState] = useState<SaveState>("idle");
  const [imageMessage, setImageMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // メイン画像エリアに表示するサムネイルの選択インデックス（表示専用・保存はしない）
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // メイン画像の拡大表示（ライトボックス）の開閉（表示専用・保存はしない）
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const loadProduct = useCallback(async (): Promise<AdminProductDetail> => {
    const url = `${GOOGLE_SHEETS_WEBHOOK_URL}?mode=admin&product_id=${encodeURIComponent(
      id ?? ""
    )}`;
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as AdminProductDetailResponse;
    if (!data || data.success !== true || !data.product) {
      throw new Error("Invalid response");
    }
    return data.product;
  }, [id]);

  // 詳細APIが取得できない商品のフォールバック。
  // 一覧API（mode=admin）から同じ product_id を探し、取得できた情報だけを返す。
  const loadProductListFallback = useCallback(
    async (): Promise<AdminProductDetail | null> => {
      try {
        const response = await fetch(`${GOOGLE_SHEETS_WEBHOOK_URL}?mode=admin`, {
          method: "GET",
        });
        if (!response.ok) return null;
        const data = (await response.json()) as AdminProductListResponse;
        if (!data || data.success !== true || !Array.isArray(data.products)) {
          return null;
        }
        const found = data.products.find((p) => p.product_id === id);
        return found ? mapListProductToDetail(found) : null;
      } catch {
        return null;
      }
    },
    [id]
  );

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setMessage(null);
    setIsPartialLoad(false);

    loadProduct()
      .then((p) => {
        if (cancelled) return;
        setProduct(p);
        setSelectedStatus(p.publish_status);
        setSelectedInventoryStatus(p.inventory_status);
        setLoadState("success");
      })
      .catch(async () => {
        // 詳細APIが失敗しても、一覧APIに情報があれば商品情報を表示する（フォールバック）。
        // これにより、詳細APIだけがエラーを返す商品でも詳細画面を開ける。
        const fallback = await loadProductListFallback();
        if (cancelled) return;
        if (fallback) {
          setProduct(fallback);
          setSelectedStatus(fallback.publish_status);
          setSelectedInventoryStatus(fallback.inventory_status);
          setIsPartialLoad(true);
          setLoadState("success");
        } else {
          setLoadState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadProduct, loadProductListFallback]);

  // 既存の get_ai_product_draft（中継経由）で最新ドラフトの candidate.price を取得する。
  // 取得できた価格案は、本票の planned_sale_price が未設定のときだけ
  // 商品編集フォームの初期値として提示する（本票価格が入っていれば使わない）。
  useEffect(() => {
    if (loadState !== "success" || !product) return;
    const productId = product.product_id;
    let cancelled = false;
    setAiDraftPrice(null);
    getAiProductDraft(productId)
      .then((lookup) => {
        if (cancelled) return;
        setAiDraftPrice(
          lookup.status === "found" ? extractAiDraftPrice(lookup.draft) : null
        );
      })
      .catch(() => {
        if (!cancelled) setAiDraftPrice(null);
      });
    return () => {
      cancelled = true;
    };
  }, [loadState, product]);

  const refreshProduct = useCallback(async () => {
    try {
      const updated = await loadProduct();
      setProduct(updated);
      setSelectedStatus(updated.publish_status);
      setSelectedInventoryStatus(updated.inventory_status);
    } catch {
      // 反映自体は成功しているため、再取得失敗は無視する
    }
  }, [loadProduct]);

  // 書類（請求書・領収書）の添付結果を受け取る。
  // 添付成功時は応答で得た書類を即時反映し、あわせて書類情報を再取得する。
  const handleDocumentAttached = useCallback(
    async (doc: ProductDocument | null) => {
      if (doc) {
        setProduct((prev) => (prev ? { ...prev, document: doc } : prev));
      }
      // 添付成功後は書類情報を再取得して最新の状態を反映する。
      try {
        const updated = await loadProduct();
        setProduct(updated);
        setSelectedStatus(updated.publish_status);
        setSelectedInventoryStatus(updated.inventory_status);
      } catch {
        // 再取得に失敗しても、応答で得た書類情報があれば表示を維持する
      }
    },
    [loadProduct]
  );

  // 一括AI生成はGAS側で同じ商品の下書きへ自動反映されるため、他タブ等で処理が進んだ後に
  // この画面へ戻ってきたときは最新の商品情報を再取得して表示する。
  // 編集中・保存中はスタッフの入力を上書きしないよう再取得しない。
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (isEditing || isImageEditing) return;
      if (editSaveState === "saving" || imageSaveState === "saving") return;
      void refreshProduct();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [isEditing, isImageEditing, editSaveState, imageSaveState, refreshProduct]);

  // 商品を切り替えたときはメイン画像の選択を先頭（既存のメイン画像）に戻す
  useEffect(() => {
    setSelectedImageIndex(0);
    setIsLightboxOpen(false);
  }, [id]);

  // 画像の追加・削除・並び替えで選択インデックスが範囲外になった場合の安全策
  const imageCount = product?.images?.length ?? 0;
  useEffect(() => {
    setSelectedImageIndex((prev) =>
      imageCount === 0 ? 0 : Math.min(prev, imageCount - 1)
    );
  }, [imageCount]);

  const handleSaveStatus = async () => {
    if (!product || saveState === "saving") return;

    // 公開操作の前にスニーカーサイズを確認する（未入力なら公開しない）。
    // 下書き保存では未入力を許可する。
    if (
      selectedStatus === "published" &&
      product.category === "sneaker" &&
      !hasSneakerSize(product.sneaker_size)
    ) {
      setMessage({
        type: "error",
        text: "公開前にサイズを入力してください。商品情報を編集してサイズを入力してから再度公開してください。",
      });
      return;
    }

    setSaveState("saving");
    setMessage(null);

    try {
      const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "update_publish_status",
          product_id: product.product_id,
          publish_status: selectedStatus,
        }),
      });
      let data: PublishStatusUpdateResponse | null = null;
      try {
        data = (await response.json()) as PublishStatusUpdateResponse;
      } catch {
        data = null;
      }
      if (!response.ok || !data || data.success !== true) {
        throw new Error(
          extractBackendError(data, "公開状態の更新に失敗しました")
        );
      }
      setProduct({ ...product, publish_status: data.publish_status ?? selectedStatus });
      setSelectedStatus(data.publish_status ?? selectedStatus);
      setMessage({ type: "success", text: "公開状態を更新しました" });
    } catch (err) {
      setMessage({
        type: "error",
        text:
          (err instanceof Error && err.message) ||
          "公開状態の更新に失敗しました",
      });
    } finally {
      setSaveState("idle");
    }
  };

  const handleSaveInventoryStatus = async () => {
    if (!product || inventorySaveState === "saving") return;
    setInventorySaveState("saving");
    setInventoryMessage(null);

    try {
      const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "update_inventory_status",
          product_id: product.product_id,
          inventory_status: selectedInventoryStatus,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as InventoryStatusUpdateResponse;
      if (!data || data.success !== true) {
        throw new Error("Invalid response");
      }
      setProduct({
        ...product,
        inventory_status: data.inventory_status ?? selectedInventoryStatus,
      });
      setSelectedInventoryStatus(
        data.inventory_status ?? selectedInventoryStatus
      );
      setInventoryMessage({ type: "success", text: "在庫状態を更新しました" });

      try {
        const updated = await loadProduct();
        setProduct(updated);
        setSelectedStatus(updated.publish_status);
        setSelectedInventoryStatus(updated.inventory_status);
      } catch {
        // 保存自体は成功しているため、再取得失敗は無視する
      }
    } catch {
      setInventoryMessage({
        type: "error",
        text: "在庫状態の更新に失敗しました",
      });
    } finally {
      setInventorySaveState("idle");
    }
  };

  const handleSaveRecordStatus = async (regeneratePaymentLink = false) => {
    if (!product || recordSaveState === "saving") return;
    setRecordSaveState("saving");
    setRecordMessage(null);

    const targetStatus =
      product.record_status === "active" ? "archived" : "active";
    const squareLinked = Boolean(
      product.square_item_id || product.square_variation_id
    );

    try {
      const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "update_record_status",
          product_id: product.product_id,
          record_status: targetStatus,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as RecordStatusUpdateResponse;
      if (!data || data.success !== true) {
        throw new Error("Invalid response");
      }

      setIsArchiveConfirmOpen(false);
      setIsRestoreConfirmOpen(false);

      // 再有効化かつ「決済リンクも再生成する」チェックONの場合のみ、
      // 既存の create_square_payment_link action で決済リンクを再生成する。
      // 順序: record_status更新 → 決済リンク再生成
      // 注意: record_status を active に戻しても Square 側は停止したまま（自動では再開されない）。
      //       Square を再開するには Square 側での再開・再連携が必要。
      let paymentLinkFailed = false;
      if (targetStatus === "active" && regeneratePaymentLink && squareLinked) {
        try {
          const linkResponse = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "text/plain;charset=utf-8",
            },
            body: JSON.stringify({
              action: "create_square_payment_link",
              product_id: product.product_id,
            }),
          });
          const linkData = linkResponse.ok
            ? ((await linkResponse.json()) as SquarePaymentLinkResponse)
            : null;
          if (!linkResponse.ok || !linkData || linkData.success !== true) {
            paymentLinkFailed = true;
            console.error(
              "create_square_payment_link failed:",
              linkData?.error
            );
          }
        } catch (err) {
          // 再有効化自体は成功しているため、決済リンクの失敗はwarning扱いにする
          paymentLinkFailed = true;
          console.error("create_square_payment_link failed:", err);
        }
      }

      if (paymentLinkFailed) {
        setRecordMessage({
          type: "warning",
          text: "商品は再有効化されましたが、決済リンクの再生成に失敗しました。商品詳細画面から再生成してください。",
        });
      } else {
        setRecordMessage({
          type: "success",
          text:
            targetStatus === "archived"
              ? squareLinked
                ? "商品をアーカイブしました。Square側も販売停止・アーカイブ済みです。"
                : "商品をアーカイブしました。"
              : squareLinked
                ? "商品を再有効化しました。Square側は停止したままです（Squareでの再開・再連携が必要です）。"
                : "商品を復元しました",
        });
      }

      try {
        const updated = await loadProduct();
        setProduct(updated);
        setSelectedStatus(updated.publish_status);
        setSelectedInventoryStatus(updated.inventory_status);
      } catch {
        // 保存自体は成功しているため、再取得失敗は無視する
      }
    } catch {
      setRecordMessage({
        type: "error",
        text: "レコード状態の更新に失敗しました",
      });
    } finally {
      setRecordSaveState("idle");
    }
  };

  const handleDeleteProduct = async () => {
    if (!product || deleteSaveState === "saving") return;
    // 商品IDの完全一致が確認できた場合のみ実行
    if (deleteConfirmInput !== product.product_id) return;

    setDeleteSaveState("saving");
    setDeleteMessage(null);

    try {
      const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "delete_product",
          product_id: product.product_id,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as DeleteProductResponse;
      if (!data || data.success !== true) {
        throw new Error(data?.error ?? "Invalid response");
      }

      setIsDeleteConfirmOpen(false);
      setDeleteMessage({ type: "success", text: "商品を完全に削除しました" });

      // 削除済み商品は再取得しない（存在しないため）。
      // アーカイブ済み一覧へ遷移する。
      navigate("/products?record_status=archived", {
        state: { deleteMessage: "商品を完全に削除しました" },
      });
    } catch (err) {
      setDeleteMessage({
        type: "error",
        text: "商品の完全削除に失敗しました",
      });
      // 開発時に確認できるよう、APIのerror内容をコンソールに保持
      console.error("delete_product failed:", err);
    } finally {
      setDeleteSaveState("idle");
    }
  };

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditMessage(null);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditMessage(null);
  };

  const handleStartImageEdit = () => {
    setIsImageEditing(true);
    setImageMessage(null);
  };

  const handleCancelImageEdit = () => {
    setIsImageEditing(false);
    setImageMessage(null);
  };

  const handleSaveImages = async (payload: ImageSavePayload) => {
    if (!product || imageSaveState === "saving") return;
    setImageSaveState("saving");
    setImageMessage(null);

    try {
      const newImages = await Promise.all(
        payload.newImages.map(async ({ client_id, file }) => ({
          client_id,
          file_name: file.name,
          mime_type: file.type,
          base64: await fileToBase64(file),
        }))
      );

      const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "update_product_images",
          product_id: product.product_id,
          image_order: payload.image_order,
          new_images: newImages,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as ProductImagesUpdateResponse;
      if (!data || data.success !== true) {
        throw new Error("Invalid response");
      }

      setIsImageEditing(false);
      setImageMessage({ type: "success", text: "商品画像を更新しました" });

      try {
        const updated = await loadProduct();
        setProduct(updated);
        setSelectedStatus(updated.publish_status);
        setSelectedInventoryStatus(updated.inventory_status);
      } catch {
        // 保存自体は成功しているため、再取得失敗は無視して編集を終了する
      }
    } catch {
      setImageMessage({ type: "error", text: "商品画像の更新に失敗しました" });
    } finally {
      setImageSaveState("idle");
    }
  };

  const handleSaveEdit = async (payload: Record<string, unknown>) => {
    if (!product || editSaveState === "saving") return;
    setEditSaveState("saving");
    setEditMessage(null);

    try {
      const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          ...payload,
          action: "update_product",
          product_id: product.product_id,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as ProductUpdateResponse;
      if (!data || data.success !== true) {
        throw new Error("Invalid response");
      }
      setIsEditing(false);

      // 下書き自動反映(Auto-Apply)はGAS側の処理として完結するため、
      // ブラウザから confirm_ai_product_draft を商品ごとに連続実行しない。
      // 編集後の確定指紋の同期もバックエンド側で行われる（フロントでは再確定しない）。

      // update_product 成功後、Square連携済み（square_item_id / square_variation_id）なら
      // 既存 action の sync_square_production_details で商品詳細情報を自動同期する。
      // 同期の成否は保存全体の成否には影響させない（update_product 成功は維持）。
      const squareLinkedProduct = Boolean(
        product.square_item_id || product.square_variation_id
      );
      let squareSyncFailed = false;
      if (squareLinkedProduct) {
        try {
          const syncResponse = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "text/plain;charset=utf-8",
            },
            body: JSON.stringify({
              action: "sync_square_production_details",
              product_id: product.product_id,
            }),
          });
          const syncData = syncResponse.ok
            ? ((await syncResponse.json()) as SquareProductionDetailsSyncResponse)
            : null;
          if (!syncResponse.ok || !syncData || syncData.success !== true) {
            squareSyncFailed = true;
            console.error(
              "sync_square_production_details failed:",
              syncData?.error
            );
          }
        } catch (err) {
          // update_product 自体は成功しているため、同期失敗はwarning扱いにする
          squareSyncFailed = true;
          console.error("sync_square_production_details failed:", err);
        }
      }

      // 表示優先順位:
      // 価格warning + Square詳細同期失敗（両方失敗）> 既存の価格変更時Payment Link warning > Square詳細同期結果 > 通常成功
      const bothSyncFailed =
        squareLinkedProduct && Boolean(data.warning) && squareSyncFailed;
      if (bothSyncFailed) {
        setEditMessage({
          type: "warning",
          text: "商品情報は更新されましたが、Square側で一部の同期に失敗しました。決済リンクおよび商品情報を商品詳細画面から再確認してください。",
        });
      } else if (data.warning) {
        setEditMessage({ type: "warning", text: data.warning });
      } else if (squareLinkedProduct) {
        if (squareSyncFailed) {
          setEditMessage({
            type: "warning",
            text: "商品情報は更新されましたが、Squareへの商品情報同期に失敗しました。再度お試しください。",
          });
        } else if (data.payment_link_status === "created") {
          setEditMessage({
            type: "success",
            text: "商品価格を更新しました。Squareにも反映済みです。",
          });
        } else {
          setEditMessage({
            type: "success",
            text: "商品情報を更新しました。Squareにも反映済みです。",
          });
        }
      } else {
        setEditMessage({
          type: "success",
          text: "商品情報を更新しました",
        });
      }

      try {
        const updated = await loadProduct();
        setProduct(updated);
        setSelectedStatus(updated.publish_status);
        setSelectedInventoryStatus(updated.inventory_status);
      } catch {
        // 保存自体は成功しているため、再取得失敗は無視して編集を終了する
      }
    } catch {
      setEditMessage({ type: "error", text: "商品情報の更新に失敗しました" });
    } finally {
      setEditSaveState("idle");
    }
  };

  const isSquareLinked = Boolean(
    product && (product.square_item_id || product.square_variation_id)
  );
  // 決済リンク再生成の可否: 公開中 + 在庫あり + Square連携済み
  const canRegeneratePaymentLink = Boolean(
    product &&
      isSquareLinked &&
      product.publish_status === "published" &&
      product.inventory_status === "in_stock"
  );

  const categoryLabel = product
    ? CATEGORY_LABELS[product.category] ?? (product.category || "—")
    : "—";
  const statusLabel = product
    ? PUBLISH_STATUS_LABELS[product.publish_status] ??
      (product.publish_status || "—")
    : "—";
  const statusClass = product
    ? statusStyles[product.publish_status] ?? "bg-foreground-100 text-foreground-600"
    : "bg-foreground-100 text-foreground-600";
  const inventoryLabel = product
    ? INVENTORY_STATUS_OPTIONS.find(
        (option) => option.value === product.inventory_status
      )?.label ?? (product.inventory_status || "—")
    : "—";
  const thumbnails = product?.images ?? [];
  const safeImageIndex =
    thumbnails.length > 0
      ? Math.min(selectedImageIndex, thumbnails.length - 1)
      : 0;
  const mainImage = thumbnails[safeImageIndex]?.display_url ?? "";
  const imageUrls = thumbnails.map((img) => img.display_url);

  // 本票の販売予定価格が未設定か（0・null は未設定扱い）。
  // 未設定かつAI価格案があるときだけ、編集フォームで価格案を初期値として提示する。
  const plannedSalePriceUnset =
    !product ||
    product.planned_sale_price == null ||
    product.planned_sale_price <= 0;
  const showAiPriceHint = plannedSalePriceUnset && aiDraftPrice != null;

  return (
    <div className="admin-font products-theme min-h-screen bg-background-50">
      <header className="border-b border-background-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3 md:px-6">
          <Link
            to="/products"
            className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-foreground-600 transition-colors hover:text-primary-600"
          >
            <i className="ri-arrow-left-line w-4 h-4 flex items-center justify-center"></i>
            商品一覧に戻る
          </Link>
          <span className="text-sm font-semibold text-foreground-950">商品詳細</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
        {loadState === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i>
            <p className="text-sm text-foreground-500">読み込み中...</p>
          </div>
        )}

        {loadState === "error" && (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <i className="ri-error-warning-line text-2xl text-foreground-400"></i>
            <p className="text-sm text-foreground-700">
              商品情報を取得できませんでした
            </p>
            <Link
              to="/products"
              className="mt-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
            >
              商品一覧に戻る
            </Link>
          </div>
        )}

        {loadState === "success" && isPartialLoad && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <i className="ri-information-line mt-0.5 w-4 h-4 flex items-center justify-center shrink-0 text-amber-600"></i>
            <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-amber-800">
              この商品の詳細情報を完全には取得できなかったため、取得できた商品情報のみを表示しています。説明・備考・カテゴリ固有の詳細項目などは表示されない場合があります。
            </p>
          </div>
        )}

        {loadState === "success" && product && (
          <div className="flex flex-col gap-5 lg:flex-row">
            {/* 画像エリア */}
            <div className="w-full lg:w-[360px] lg:shrink-0">
              {isImageEditing ? (
                <ImageEditor
                  existingImages={product.images ?? []}
                  saving={imageSaveState === "saving"}
                  error={
                    imageMessage?.type === "error" ? imageMessage.text : ""
                  }
                  onSave={handleSaveImages}
                  onCancel={handleCancelImageEdit}
                />
              ) : (
                <>
                  <MainImage
                    src={mainImage}
                    alt={product.product_name}
                    onOpen={() => setIsLightboxOpen(true)}
                  />
                  {thumbnails.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {thumbnails.map((img, idx) => (
                        <Thumbnail
                          key={idx}
                          src={img.display_url}
                          alt={`${product.product_name} ${idx + 1}`}
                          selected={idx === safeImageIndex}
                          onClick={() => setSelectedImageIndex(idx)}
                        />
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleStartImageEdit}
                    className="mt-3 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
                  >
                    <i className="ri-image-edit-line w-4 h-4 flex items-center justify-center"></i>
                    画像を編集
                  </button>
                  {imageMessage && imageMessage.type === "success" && (
                    <p className="mt-2 flex items-center gap-1 text-sm font-medium text-primary-700">
                      <i className="ri-checkbox-circle-line w-4 h-4 flex items-center justify-center"></i>
                      {imageMessage.text}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* 情報エリア */}
            <div className="min-w-0 flex-1">
              {isEditing ? (
                <EditForm
                  product={product}
                  saving={editSaveState === "saving"}
                  error={editMessage?.type === "error" ? editMessage.text : ""}
                  aiPriceSuggestion={aiDraftPrice}
                  onDocumentAttached={handleDocumentAttached}
                  onCancel={handleCancelEdit}
                  onSave={handleSaveEdit}
                />
              ) : (
                <div className="overflow-hidden rounded-[10px] border border-background-200 bg-white">
                  {/* 商品名・商品ID・ステータス */}
                  <div className="border-b border-background-100 p-4 md:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h1 className="break-words text-xl font-semibold leading-snug text-foreground-950">
                          {product.product_name || "（商品名なし）"}
                        </h1>
                        <p className="mt-1 font-mono text-xs text-foreground-500">
                          {product.product_id}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-md px-2 text-[11px] font-medium leading-none ${statusClass}`}
                        >
                          {statusLabel}
                        </span>
                        <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-md bg-background-100 px-2 text-[11px] font-medium leading-none text-foreground-600">
                          {categoryLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 商品情報 */}
                  <div className="px-4 py-1 md:px-5">
                    <InfoRow label="ブランド" value={product.brand} />
                    {/* ポケモンカードは専用の pokemon_card.card_condition を状態として表示するため、
                        共通の商品状態は表示しない（矛盾させない）。 */}
                    {product.category !== "pokemon_card" && (
                      <InfoRow label="商品状態" value={product.condition} />
                    )}
                    <InfoRow
                      label="仕入価格"
                      value={formatPrice(product.purchase_price)}
                    />
                    <InfoRow
                      label="販売予定価格"
                      value={formatPrice(product.planned_sale_price)}
                      emphasize
                    />
                    <InfoRow label="保管場所" value={product.storage_location} />
                    {product.category === "sneaker" && (
                      <>
                        <InfoRow label="SKU" value={product.sneaker_sku ?? ""} />
                        <InfoRow
                          label="サイズ"
                          value={
                            product.sneaker_size != null
                              ? String(product.sneaker_size)
                              : ""
                          }
                        />
                        <InfoRow
                          label="カラー"
                          value={product.sneaker_colorway ?? ""}
                        />
                        <InfoRow
                          label="箱の有無"
                          value={product.sneaker_box ?? ""}
                        />
                        <InfoRow
                          label="付属品"
                          value={product.sneaker_accessories ?? ""}
                        />
                        <InfoRow
                          label="発売年"
                          value={product.sneaker_release_year ?? ""}
                        />
                      </>
                    )}
                    {product.category === "jewelry" && (
                      <>
                        <InfoRow
                          label="種類"
                          value={product.jewelry_type ?? ""}
                        />
                        <InfoRow
                          label="素材"
                          value={product.jewelry_material ?? ""}
                        />
                        <InfoRow label="カラット" value={product.carat ?? ""} />
                        <InfoRow label="シェイプ" value={product.shape ?? ""} />
                        <InfoRow
                          label="カラーグレード"
                          value={product.color_grade ?? ""}
                        />
                        <InfoRow
                          label="クラリティ"
                          value={product.clarity ?? ""}
                        />
                        <InfoRow label="カット" value={product.cut ?? ""} />
                        <InfoRow
                          label="メインストーン"
                          value={product.main_stone ?? ""}
                        />
                        <InfoRow
                          label="サイズ"
                          value={product.jewelry_size ?? ""}
                        />
                        <InfoRow label="重量" value={product.weight_g ?? ""} />
                        <InfoRow
                          label="鑑定書"
                          value={product.certificate_available ?? ""}
                        />
                        <InfoRow
                          label="鑑定書番号"
                          value={product.certificate_number ?? ""}
                        />
                      </>
                    )}
                    {product.category === "pokemon_card" && (
                      <>
                        <InfoRow
                          label="カード名"
                          value={product.pokemon_card?.card_name ?? ""}
                        />
                        <InfoRow
                          label="セット名"
                          value={product.pokemon_card?.set_name ?? ""}
                        />
                        <InfoRow
                          label="カード番号"
                          value={product.pokemon_card?.card_number ?? ""}
                        />
                        <InfoRow
                          label="レアリティ"
                          value={product.pokemon_card?.rarity ?? ""}
                        />
                        <InfoRow
                          label="言語"
                          value={product.pokemon_card?.language ?? ""}
                        />
                        <InfoRow
                          label="鑑定状態"
                          value={
                            product.pokemon_card?.grading_status === "graded"
                              ? "鑑定済み"
                              : product.pokemon_card?.grading_status ===
                                  "ungraded"
                                ? "未鑑定"
                                : ""
                          }
                        />
                        {product.pokemon_card?.grading_status === "graded" ? (
                          <>
                            <InfoRow
                              label="鑑定会社"
                              value={product.pokemon_card?.grader ?? ""}
                            />
                            <InfoRow
                              label="グレード"
                              value={product.pokemon_card?.grade ?? ""}
                            />
                            <InfoRow
                              label="鑑定番号"
                              value={
                                product.pokemon_card?.certification_number ?? ""
                              }
                            />
                          </>
                        ) : (
                          <>
                            <InfoRow
                              label="カード状態"
                              value={product.pokemon_card?.card_condition ?? ""}
                            />
                            {product.pokemon_card?.card_condition === "A" && (
                              <p className="flex items-start gap-1.5 py-2 text-[12px] leading-relaxed text-foreground-500">
                                <i className="ri-information-line mt-0.5 w-3.5 h-3.5 flex items-center justify-center shrink-0"></i>
                                <span className="min-w-0 flex-1">
                                  AはAI生成直後の初期値です（現物確認前）。現物を確認のうえ、必要に応じて「商品情報を編集」からB/Cへ修正してください。
                                </span>
                              </p>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>

                  {/* 商品説明・備考 */}
                  <div className="border-t border-background-100 px-4 py-3 md:px-5">
                    <DescriptionBlock
                      label="商品説明"
                      value={product.description ?? ""}
                    />
                    <DescriptionBlock label="備考" value={product.notes ?? ""} />
                  </div>

                  {/* 書類（請求書・領収書）: 管理画面のみ。未添付の既存商品には後から添付できる。公開ページには表示しない。 */}
                  <div className="border-t border-background-100 px-4 py-3 md:px-5">
                    <ProductDocumentPanel
                      productId={product.product_id}
                      document={product.document}
                      onAttached={handleDocumentAttached}
                    />
                  </div>

                  {/* 商品情報を編集 */}
                  <div className="flex flex-col gap-3 border-t border-background-100 px-4 py-3 md:px-5">
                    {showAiPriceHint && (
                      <div className="flex items-start gap-2 rounded-lg border border-accent-300 bg-accent-50/70 px-3 py-2">
                        <i className="ri-sparkling-line mt-0.5 w-4 h-4 flex items-center justify-center shrink-0 text-accent-600"></i>
                        <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-foreground-700">
                          販売予定価格が未設定ですが、AIの価格案
                          <strong className="mx-1 font-semibold text-foreground-950">
                            ¥{aiDraftPrice?.toLocaleString()}
                          </strong>
                          があります。「商品情報を編集」で初期値として表示され、必要に応じて修正して保存できます。
                        </p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="inline-flex w-fit items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
                    >
                      <i className="ri-edit-line w-4 h-4 flex items-center justify-center"></i>
                      商品情報を編集
                    </button>
                    {editMessage &&
                      (editMessage.type === "success" ||
                        editMessage.type === "warning") &&
                      (editMessage.type === "warning" ? (
                        <div className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                          <i className="ri-error-warning-line w-4 h-4 flex items-center justify-center shrink-0"></i>
                          <span className="min-w-0 flex-1">{editMessage.text}</span>
                        </div>
                      ) : (
                        <p className="flex items-center gap-1 text-sm font-medium text-primary-700">
                          <i className="ri-checkbox-circle-line w-4 h-4 flex items-center justify-center"></i>
                          {editMessage.text}
                        </p>
                      ))}
                  </div>
                </div>
              )}

              {/* 公開状態 */}
              <div className="mt-4 rounded-[10px] border border-background-200 bg-white p-4 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold text-foreground-950">
                      公開状態
                    </h2>
                    <p className="mt-1 text-xs text-foreground-500">
                      公開サイトへの表示状態を設定します
                    </p>
                  </div>
                  <span
                    className={`inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-md px-2 text-[11px] font-medium leading-none ${
                      PUBLISH_BADGE_STYLES[product.publish_status] ??
                      "bg-background-100 text-foreground-600"
                    }`}
                  >
                    {statusLabel}
                  </span>
                </div>

                <div className="mt-4 inline-flex flex-wrap items-center gap-1 rounded-lg bg-background-100 p-1">
                  {PUBLISH_STATUS_OPTIONS.map((option) => {
                    const active = selectedStatus === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setSelectedStatus(option.value);
                          setMessage(null);
                        }}
                        aria-pressed={active}
                        className={`whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                          active
                            ? "bg-white text-foreground-950"
                            : "text-foreground-600 hover:text-foreground-900"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveStatus}
                    disabled={saveState === "saving" || selectedStatus === product.publish_status}
                    className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saveState === "saving" ? (
                      <>
                        <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                        保存中...
                      </>
                    ) : (
                      <>
                        <i className="ri-save-line w-4 h-4 flex items-center justify-center"></i>
                        公開状態を保存
                      </>
                    )}
                  </button>
                  {saveState !== "saving" &&
                    selectedStatus !== product.publish_status && (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-foreground-500">
                        <i className="ri-edit-circle-line w-3.5 h-3.5 flex items-center justify-center"></i>
                        未保存の変更があります
                      </span>
                    )}
                </div>

                {message && <PanelMessage type={message.type} text={message.text} />}
              </div>

              {/* 在庫状態 */}
              <div className="mt-4 rounded-[10px] border border-background-200 bg-white p-4 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold text-foreground-950">
                      在庫状態
                    </h2>
                    <p className="mt-1 text-xs text-foreground-500">
                      現在の在庫・販売状況を設定します
                    </p>
                  </div>
                  <span className="inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-md bg-background-100 px-2 text-[11px] font-medium leading-none text-foreground-600">
                    {inventoryLabel}
                  </span>
                </div>

                <div className="mt-4 inline-flex flex-wrap items-center gap-1 rounded-lg bg-background-100 p-1">
                  {INVENTORY_STATUS_OPTIONS.map((option) => {
                    const active = selectedInventoryStatus === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setSelectedInventoryStatus(option.value);
                          setInventoryMessage(null);
                        }}
                        aria-pressed={active}
                        className={`whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                          active
                            ? "bg-white text-foreground-950"
                            : "text-foreground-600 hover:text-foreground-900"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveInventoryStatus}
                    disabled={
                      inventorySaveState === "saving" ||
                      selectedInventoryStatus === product.inventory_status
                    }
                    className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {inventorySaveState === "saving" ? (
                      <>
                        <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                        保存中...
                      </>
                    ) : (
                      <>
                        <i className="ri-save-line w-4 h-4 flex items-center justify-center"></i>
                        在庫状態を保存
                      </>
                    )}
                  </button>
                  {inventorySaveState !== "saving" &&
                    selectedInventoryStatus !== product.inventory_status && (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-foreground-500">
                        <i className="ri-edit-circle-line w-3.5 h-3.5 flex items-center justify-center"></i>
                        未保存の変更があります
                      </span>
                    )}
                </div>

                {inventoryMessage && (
                  <PanelMessage
                    type={inventoryMessage.type}
                    text={inventoryMessage.text}
                  />
                )}
              </div>

              {/* 英語翻訳（越境EC用） */}
              {product.category !== "pokemon_card" && (
              <div className="mt-4">
                <ProductTranslationSection
                  productId={product.product_id}
                  translation={product.translation}
                  onTranslationChange={(translation) => {
                    setProduct((prev) =>
                      prev ? { ...prev, translation } : prev
                    );
                  }}
                />
              </div>
              )}

              {/* レコード状態 */}
              <div className="mt-4 rounded-lg border border-background-200 bg-white p-4 md:p-5">
                <h2 className="text-[15px] font-semibold text-foreground-950">
                  レコード状態
                </h2>

                {/* 通常管理 / アーカイブ済み を切り替えるセグメント。
                    現在の状態をハイライト表示し、非選択側をクリックすると
                    確認ダイアログを経由してアーカイブ / 復元を実行する。 */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-background-100 p-1">
                    {RECORD_STATUS_OPTIONS.map((option) => {
                      const active = product.record_status === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            if (active || recordSaveState === "saving") return;
                            if (option.value === "archived") {
                              setRecordMessage(null);
                              setIsArchiveConfirmOpen(true);
                            } else if (isSquareLinked) {
                              setRestoreRegenerateLink(false);
                              setRecordMessage(null);
                              setIsRestoreConfirmOpen(true);
                            } else {
                              handleSaveRecordStatus(false);
                            }
                          }}
                          disabled={recordSaveState === "saving"}
                          aria-pressed={active}
                          className={`whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                            active
                              ? "bg-white text-foreground-950"
                              : "text-foreground-600 hover:text-foreground-900"
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {recordSaveState === "saving" && (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-foreground-500">
                      <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
                      処理中...
                    </span>
                  )}
                </div>

                {/* 完全削除はアーカイブ済みのときのみ表示（アーカイブ / 復元は上のセグメントから実行） */}
                {product.record_status !== "active" && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteMessage(null);
                        setDeleteConfirmInput("");
                        setIsDeleteConfirmOpen(true);
                      }}
                      disabled={recordSaveState === "saving"}
                      className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <i className="ri-delete-bin-6-line w-4 h-4 flex items-center justify-center"></i>
                      商品を完全削除
                    </button>
                  </div>
                )}

                {recordMessage &&
                  (recordMessage.type === "warning" ? (
                    <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                      <i className="ri-error-warning-line w-4 h-4 flex items-center justify-center shrink-0"></i>
                      <span className="min-w-0 flex-1">{recordMessage.text}</span>
                    </div>
                  ) : (
                    <p
                      className={`mt-3 text-sm font-medium ${
                        recordMessage.type === "success"
                          ? "text-primary-700"
                          : "text-red-600"
                      }`}
                    >
                      {recordMessage.text}
                    </p>
                  ))}
              </div>

              {/* Square連携 */}
              <SquareIntegrationSection
                product={product}
                onRefreshed={refreshProduct}
              />

              {/* アーカイブ確認ダイアログ */}
              {isArchiveConfirmOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <div className="w-full max-w-md rounded-lg border border-background-200 bg-white p-5">
                    <div className="flex items-center gap-2">
                      <i className="ri-error-warning-line w-5 h-5 flex items-center justify-center text-red-600"></i>
                      <h3 className="text-base font-bold text-foreground-950">
                        商品をアーカイブ
                      </h3>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-foreground-700">
                      この商品をアーカイブしますか？
                      <br />
                      アーカイブすると通常の商品一覧と公開サイトから除外されます。
                      <br />
                      商品データと画像は削除されません。
                    </p>
                    {(product.square_item_id ||
                      product.square_variation_id) && (
                      <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-relaxed font-medium text-amber-800">
                        Square連携済み商品のため、Square側でも在庫停止・決済リンク無効化・商品アーカイブが実行されます。
                      </p>
                    )}
                    <div className="mt-5 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsArchiveConfirmOpen(false)}
                        disabled={recordSaveState === "saving"}
                        className="whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveRecordStatus(false)}
                        disabled={recordSaveState === "saving"}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {recordSaveState === "saving" ? (
                          <>
                            <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                            処理中...
                          </>
                        ) : (
                          "アーカイブする"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 再有効化（復元）確認ダイアログ（Square連携済みのみ） */}
              {isRestoreConfirmOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <div className="w-full max-w-md rounded-lg border border-background-200 bg-white p-5">
                    <div className="flex items-center gap-2">
                      <i className="ri-refresh-line w-5 h-5 flex items-center justify-center text-primary-600"></i>
                      <h3 className="text-base font-bold text-foreground-950">
                        商品を復元
                      </h3>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-foreground-700">
                      この商品を復元しますか？
                      <br />
                      復元すると通常の商品一覧と公開サイトに表示されます。
                    </p>
                    <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-relaxed font-medium text-amber-800">
                      Square連携済み商品ですが、復元してもSquare側は停止したままです（自動では再開されません）。Squareでの再開・再連携が必要です。決済リンクは下のチェックで再生成できます。
                    </p>

                    <label className="mt-4 flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={restoreRegenerateLink}
                        disabled={
                          !canRegeneratePaymentLink ||
                          recordSaveState === "saving"
                        }
                        onChange={(e) =>
                          setRestoreRegenerateLink(e.target.checked)
                        }
                        className="mt-0.5 h-4 w-4 cursor-pointer accent-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <span className="min-w-0 flex-1 text-sm font-medium text-foreground-800">
                        決済リンクも再生成する
                      </span>
                    </label>
                    {!canRegeneratePaymentLink && (
                      <p className="mt-1 text-xs text-foreground-400">
                        商品が未公開または在庫なしのため、決済リンクは再生成できません。
                      </p>
                    )}

                    {recordMessage && recordMessage.type === "error" && (
                      <p className="mt-3 text-sm font-medium text-red-600">
                        {recordMessage.text}
                      </p>
                    )}

                    <div className="mt-5 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsRestoreConfirmOpen(false)}
                        disabled={recordSaveState === "saving"}
                        className="whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleSaveRecordStatus(
                            canRegeneratePaymentLink && restoreRegenerateLink
                          )
                        }
                        disabled={recordSaveState === "saving"}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {recordSaveState === "saving" ? (
                          <>
                            <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                            処理中...
                          </>
                        ) : (
                          "復元する"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 完全削除確認ダイアログ */}
              {isDeleteConfirmOpen && product && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <div className="w-full max-w-md rounded-lg border border-background-200 bg-white p-5">
                    <div className="flex items-center gap-2">
                      <i className="ri-error-warning-line w-5 h-5 flex items-center justify-center text-red-600"></i>
                      <h3 className="text-base font-bold text-foreground-950">
                        商品を完全削除
                      </h3>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-foreground-700">
                      この商品を完全に削除しますか？
                      <br />
                      <br />
                      この操作は取り消せません。
                      <br />
                      Google Sheetsの商品データは削除され、
                      <br />
                      Google Driveの商品フォルダはゴミ箱へ移動します。
                      <br />
                      <br />
                      続行するには、商品IDを入力してください。
                    </p>

                    <div className="mt-4">
                      <label className="text-xs font-medium text-foreground-500">
                        対象商品ID
                      </label>
                      <p className="mt-1 font-mono text-sm font-bold text-foreground-950">
                        {product.product_id}
                      </p>
                      <input
                        type="text"
                        value={deleteConfirmInput}
                        onChange={(e) => setDeleteConfirmInput(e.target.value)}
                        placeholder={product.product_id}
                        disabled={deleteSaveState === "saving"}
                        className="mt-2 w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-sm text-foreground-900 placeholder:text-foreground-300 focus:border-red-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>

                    {deleteMessage && deleteMessage.type === "error" && (
                      <p className="mt-3 text-sm font-medium text-red-600">
                        {deleteMessage.text}
                      </p>
                    )}

                    <div className="mt-5 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsDeleteConfirmOpen(false);
                          setDeleteConfirmInput("");
                        }}
                        disabled={deleteSaveState === "saving"}
                        className="whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteProduct}
                        disabled={
                          deleteSaveState === "saving" ||
                          deleteConfirmInput !== product.product_id
                        }
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deleteSaveState === "saving" ? (
                          <>
                            <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                            削除中...
                          </>
                        ) : (
                          "完全に削除する"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 画像の拡大表示（ライトボックス） */}
              {isLightboxOpen && imageUrls.length > 0 && (
                <ImageLightbox
                  images={imageUrls}
                  index={safeImageIndex}
                  productName={product.product_name}
                  onClose={() => setIsLightboxOpen(false)}
                  onNavigate={setSelectedImageIndex}
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function MainImage({
  src,
  alt,
  onOpen,
}: {
  src: string;
  alt: string;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);

  // 画像が切り替わったらエラー状態をリセットする（表示専用・保存はしない）
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showPlaceholder = !src || failed;

  if (showPlaceholder) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-background-200 bg-background-100">
        <i className="ri-image-line w-10 h-10 flex items-center justify-center text-foreground-300"></i>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${alt} の画像を拡大表示`}
      className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border border-background-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
    >
      <img
        key={src}
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
        className="main-image-fade aspect-square w-full object-cover object-top"
      />
      <span className="pointer-events-none absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-background-50 opacity-0 transition-opacity group-hover:opacity-100">
        <i className="ri-zoom-in-line"></i>
      </span>
    </button>
  );
}

function Thumbnail({
  src,
  alt,
  selected,
  onClick,
}: {
  src: string;
  alt: string;
  selected: boolean;
  onClick: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src || failed;

  // 選択中はグリーン系の2px枠線＋薄いリング、未選択は薄いグレーの2px枠線（サイズは変わらない）
  const stateClass = selected
    ? "border-primary-500 ring-2 ring-primary-100"
    : "border-background-200 hover:border-background-300";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={alt}
      aria-current={selected ? "true" : undefined}
      className={`h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 bg-background-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${stateClass}`}
    >
      {showPlaceholder ? (
        <span className="flex h-full w-full items-center justify-center">
          <i className="ri-image-line w-5 h-5 flex items-center justify-center text-foreground-300"></i>
        </span>
      ) : (
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover object-top"
        />
      )}
    </button>
  );
}