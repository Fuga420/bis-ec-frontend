import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
import type {
  AdminProduct,
  AdminProductDetail,
  AdminProductDetailResponse,
  AdminProductImage,
  AdminProductListResponse,
  ProductImagesUpdateResponse,
  PublishStatusUpdateResponse,
  ProductUpdateResponse,
  InventoryStatusUpdateResponse,
  RecordStatusUpdateResponse,
  DeleteProductResponse,
  SquarePaymentLinkResponse,
  SquareProductionDetailsSyncResponse,
} from "../types";
import { CATEGORY_LABELS, PUBLISH_STATUS_LABELS } from "../types";
import { peekProductListReturnPending } from "../lib/listViewState";
import {
  extractAiDraftPrice,
  getAiProductDraft,
} from "@/pages/register/lib/aiProduct";
import EditForm from "./components/EditForm";
import ProductDetailSkeleton from "./components/ProductDetailSkeleton";
import ImageEditor, { type ImageSavePayload } from "./components/ImageEditor";
import ImageLightbox from "./components/ImageLightbox";
import ProductTranslationSection from "./components/ProductTranslationSection";
import SquareIntegrationSection from "./components/SquareIntegrationSection";
import ProductDocumentSection, {
  hasAttachedDocument,
} from "./components/ProductDocumentSection";
import ProductLedgerSection from "./components/ProductLedgerSection";
import ProductSummaryCard from "./components/ProductSummaryCard";
import ProductSpecPanel from "./components/ProductSpecPanel";
import ProductDetailTabs, {
  type ProductDetailTabKey,
} from "./components/ProductDetailTabs";
import SalesManagementPanel from "./components/SalesManagementPanel";
import ProductDangerDialogs from "./components/ProductDangerDialogs";
import SaveStatusMessage from "@/components/base/SaveStatusMessage";

type LoadState = "loading" | "success" | "error";
type SaveState = "idle" | "saving";

const INVENTORY_STATUS_LABELS: Record<string, string> = {
  in_stock: "在庫あり",
  reserved: "取り置き / 商談中",
  sold: "売却済み",
};

const statusStyles: Record<string, string> = {
  draft: "bg-background-100 text-foreground-600",
  published: "bg-primary-100 text-primary-500",
  hidden: "bg-background-100 text-foreground-600",
};

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

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // 一覧から遷移してきた場合は、戻り先を遷移元と同じタブ（通常／アーカイブ済み）に揃える。
  // 直接アクセス（一覧を経由していない）の場合は既存どおり通常一覧に戻る。
  const [listPath] = useState(() =>
    peekProductListReturnPending(true)
      ? "/products?record_status=archived"
      : "/products"
  );

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

  // 管理タブ（販売管理 / 仕入・書類 / 翻訳・外部連携）の選択状態。
  // 基本情報（商品スペック・説明・備考）はタブから独立して常時表示する。
  // 画面内の表示切り替えのみで、URLやデータ取得には影響しない。
  const [activeTab, setActiveTab] = useState<ProductDetailTabKey>("sales");

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
  // 一覧API（mode=admin）のページ分割モード（v3）で、該当する商品IDをサーバー側検索する。
  // 旧仕様の全件取得（?mode=admin）へは戻らない。
  const loadProductListFallback = useCallback(
    async (): Promise<AdminProductDetail | null> => {
      try {
        const params = new URLSearchParams();
        params.set("mode", "admin");
        params.set("page", "1");
        params.set("page_size", "100");
        params.set("search", id ?? "");
        const response = await fetch(
          `${GOOGLE_SHEETS_WEBHOOK_URL}?${params.toString()}`,
          { method: "GET" }
        );
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

  // 商品を切り替えたときはメイン画像の選択とタブを初期状態に戻す
  useEffect(() => {
    setSelectedImageIndex(0);
    setIsLightboxOpen(false);
    setActiveTab("sales");
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
    ? INVENTORY_STATUS_LABELS[product.inventory_status] ??
      (product.inventory_status || "—")
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
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 md:px-6">
          <Link
            to={listPath}
            className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-foreground-600 transition-colors hover:text-primary-600"
          >
            <i className="ri-arrow-left-line w-4 h-4 flex items-center justify-center"></i>
            商品一覧に戻る
          </Link>
          <span className="text-sm font-semibold text-foreground-950">商品詳細</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
        {loadState === "loading" && <ProductDetailSkeleton />}

        {loadState === "error" && (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <i className="ri-error-warning-line text-2xl text-foreground-400"></i>
            <p className="text-sm text-foreground-700">
              商品情報を取得できませんでした
            </p>
            <Link
              to={listPath}
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
          <>
            {/* 上部サマリー: 商品画像 + 商品名・主要情報・価格・状態・編集 */}
            <div className="flex flex-col gap-5 lg:flex-row">
              <div className="w-full lg:w-[340px] lg:shrink-0">
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
                      className="mt-3 inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
                    >
                      <i className="ri-image-edit-line w-4 h-4 flex items-center justify-center"></i>
                      画像を編集
                    </button>
                    {imageMessage && imageMessage.type === "success" && (
                      <SaveStatusMessage
                        tone="success"
                        text={imageMessage.text}
                        className="mt-2"
                      />
                    )}
                  </>
                )}
              </div>

              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <EditForm
                    product={product}
                    saving={editSaveState === "saving"}
                    error={editMessage?.type === "error" ? editMessage.text : ""}
                    aiPriceSuggestion={aiDraftPrice}
                    onCancel={handleCancelEdit}
                    onSave={handleSaveEdit}
                  />
                ) : (
                  <ProductSummaryCard
                    product={product}
                    categoryLabel={categoryLabel}
                    statusLabel={statusLabel}
                    inventoryLabel={inventoryLabel}
                    statusClass={statusClass}
                    aiPriceHint={{ show: showAiPriceHint, price: aiDraftPrice }}
                    editMessage={editMessage}
                    onStartEdit={handleStartEdit}
                  />
                )}
              </div>
            </div>

            {/* 商品説明・備考はタブから独立して常時表示する（商品スペックは右上カードに集約） */}
            {!isEditing && (
              <div className="mt-4">
                <ProductSpecPanel product={product} />
              </div>
            )}

            {/* 管理タブ（販売管理 / 仕入・書類 / 翻訳・外部連携） */}
            {isEditing ? (
              <p className="mt-4 flex items-start gap-1.5 rounded-lg border border-background-200 bg-white px-3 py-2 text-[12px] leading-relaxed text-foreground-500">
                <i className="ri-information-line mt-0.5 w-4 h-4 flex items-center justify-center shrink-0"></i>
                <span className="min-w-0 flex-1">
                  商品情報を編集中です。保存またはキャンセルすると、商品説明・備考と、販売管理・仕入・書類などの管理タブが表示されます。
                </span>
              </p>
            ) : (
              <div className="mt-4">
                <ProductDetailTabs
                  activeTab={activeTab}
                  onChange={setActiveTab}
                />

                {/* 販売管理 */}
                {activeTab === "sales" && (
                  <div className="mt-4">
                    <SalesManagementPanel
                      publish={{
                        statusLabel,
                        currentStatus: product.publish_status,
                        selectedStatus,
                        saving: saveState === "saving",
                        message,
                        onSelect: (value) => {
                          setSelectedStatus(value);
                          setMessage(null);
                        },
                        onSave: handleSaveStatus,
                      }}
                      inventory={{
                        inventoryLabel,
                        currentStatus: product.inventory_status,
                        selectedStatus: selectedInventoryStatus,
                        saving: inventorySaveState === "saving",
                        message: inventoryMessage,
                        onSelect: (value) => {
                          setSelectedInventoryStatus(value);
                          setInventoryMessage(null);
                        },
                        onSave: handleSaveInventoryStatus,
                      }}
                      record={{
                        recordStatus: product.record_status,
                        saving: recordSaveState === "saving",
                        message: recordMessage,
                        onSelectArchived: () => {
                          setRecordMessage(null);
                          setIsArchiveConfirmOpen(true);
                        },
                        onSelectActive: () => {
                          if (isSquareLinked) {
                            setRestoreRegenerateLink(false);
                            setRecordMessage(null);
                            setIsRestoreConfirmOpen(true);
                          } else {
                            void handleSaveRecordStatus(false);
                          }
                        },
                        onRequestDelete: () => {
                          setDeleteMessage(null);
                          setDeleteConfirmInput("");
                          setIsDeleteConfirmOpen(true);
                        },
                      }}
                    />
                  </div>
                )}

                {/* 仕入・書類 */}
                {activeTab === "purchase" && (
                  <div className="mt-4 flex flex-col gap-4">
                    <ProductLedgerSection
                      productId={product.product_id}
                      productName={product.product_name}
                      plannedSalePrice={product.planned_sale_price}
                    />
                    {hasAttachedDocument(product.document) && (
                      <div className="rounded-[10px] border border-background-200 bg-white px-4 py-4 md:px-5">
                        <ProductDocumentSection doc={product.document} />
                      </div>
                    )}
                  </div>
                )}

                {/* 翻訳・外部連携 */}
                {activeTab === "external" && (
                  <div className="mt-4 flex flex-col gap-4">
                    {product.category !== "pokemon_card" && (
                      <ProductTranslationSection
                        productId={product.product_id}
                        translation={product.translation}
                        onTranslationChange={(translation) => {
                          setProduct((prev) =>
                            prev ? { ...prev, translation } : prev
                          );
                        }}
                      />
                    )}
                    <SquareIntegrationSection
                      product={product}
                      onRefreshed={refreshProduct}
                    />
                  </div>
                )}
              </div>
            )}

            {/* アーカイブ / 復元 / 完全削除の確認ダイアログ */}
            <ProductDangerDialogs
              productId={product.product_id}
              squareLinked={isSquareLinked}
              isArchiveOpen={isArchiveConfirmOpen}
              archiveSaving={recordSaveState === "saving"}
              archiveError={
                recordMessage?.type === "error" ? recordMessage.text : ""
              }
              onCloseArchive={() => setIsArchiveConfirmOpen(false)}
              onConfirmArchive={() => void handleSaveRecordStatus(false)}
              isRestoreOpen={isRestoreConfirmOpen}
              restoreSaving={recordSaveState === "saving"}
              canRegeneratePaymentLink={canRegeneratePaymentLink}
              restoreRegenerateLink={restoreRegenerateLink}
              onToggleRestoreRegenerateLink={setRestoreRegenerateLink}
              onCloseRestore={() => setIsRestoreConfirmOpen(false)}
              onConfirmRestore={() =>
                void handleSaveRecordStatus(
                  canRegeneratePaymentLink && restoreRegenerateLink
                )
              }
              isDeleteOpen={isDeleteConfirmOpen}
              deleteSaving={deleteSaveState === "saving"}
              deleteConfirmInput={deleteConfirmInput}
              deleteError={
                deleteMessage?.type === "error" ? deleteMessage.text : ""
              }
              onChangeDeleteInput={setDeleteConfirmInput}
              onCloseDelete={() => {
                setIsDeleteConfirmOpen(false);
                setDeleteConfirmInput("");
              }}
              onConfirmDelete={() => void handleDeleteProduct()}
            />

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
          </>
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