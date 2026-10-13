import { useState } from "react";
import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
import type {
  AdminProductDetail,
  SquarePaymentLinkResponse,
  SquareProductImageSyncResponse,
  SquareProductInventorySyncResponse,
  SquareProductionProductResponse,
} from "@/pages/products/types";

type SquareSyncState = "idle" | "saving" | "success" | "error";
type SquareSyncStep = "idle" | "product" | "image" | "inventory" | "paymentLink";

// Square Production（本番環境）用のバックエンド action 名。
// GAS側の実装名に合わせて、この1箇所だけ変更すればOK。
const SQUARE_PRODUCTION_ACTIONS = {
  createProduct: "create_square_production_product",
  syncImage: "sync_square_production_image",
  syncInventory: "sync_square_production_inventory",
  createPaymentLink: "create_square_payment_link",
} as const;

interface SquarePostResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

async function postSquareAction<T>(
  body: Record<string, string>
): Promise<SquarePostResult<T>> {
  const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  let data: T | null = null;
  try {
    data = (await response.json()) as T;
  } catch {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
}

function formatPrice(value: number | null | undefined): string {
  if (!value || value <= 0) return "価格未設定";
  return `¥${value.toLocaleString("ja-JP")}`;
}

interface SquareIntegrationSectionProps {
  product: AdminProductDetail;
  onRefreshed: () => Promise<void>;
}

export default function SquareIntegrationSection({
  product,
  onRefreshed,
}: SquareIntegrationSectionProps) {
  const [prodSyncState, setProdSyncState] = useState<SquareSyncState>("idle");
  const [prodSyncStep, setProdSyncStep] = useState<SquareSyncStep>("idle");
  const [prodMessage, setProdMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isProdConfirmOpen, setIsProdConfirmOpen] = useState(false);

  const [paymentLinkState, setPaymentLinkState] =
    useState<SquareSyncState>("idle");
  const [paymentLinkMessage, setPaymentLinkMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [checkoutCopyFeedback, setCheckoutCopyFeedback] = useState("");

  // Production（本番環境）連携状態
  const hasProdItemId = Boolean(product.square_item_id);
  const hasProdVariationId = Boolean(product.square_variation_id);
  const hasProdCheckoutUrl = Boolean(product.square_checkout_url);
  const isProdLinked = hasProdVariationId;
  const isProdLinkInvalid = hasProdItemId !== hasProdVariationId;
  const isProdReflectDisabled = product.record_status !== "active";
  const isPaymentLinkDisabled =
    product.inventory_status === "sold" ||
    product.record_status !== "active" ||
    product.publish_status !== "published";
  const paymentLinkDisabledReason =
    product.inventory_status === "sold"
      ? "売却済み商品のため決済リンクを生成できません"
      : product.record_status !== "active"
        ? "アーカイブ済みの商品は決済リンクを生成できません"
        : product.publish_status !== "published"
          ? "公開中の商品のみ決済リンクを生成できます"
          : "";

  const handleSyncSquareProduction = async () => {
    if (prodSyncState === "saving") return;
    // 本番連携済み（variation IDあり）の場合は二重登録しない
    if (product.square_variation_id) return;
    // アーカイブ済みは本番反映不可
    if (product.record_status !== "active") return;

    setProdSyncState("saving");
    setProdMessage(null);

    let imageResult: "success" | "existing" | "webp" | "noimage" = "success";

    try {
      // 1. 商品情報（Catalog Item / Variation）
      setProdSyncStep("product");
      const productRes =
        await postSquareAction<SquareProductionProductResponse>({
          action: SQUARE_PRODUCTION_ACTIONS.createProduct,
          product_id: product.product_id,
        });
      if (
        !productRes.ok ||
        !productRes.data ||
        productRes.data.success !== true
      ) {
        setProdMessage({
          type: "error",
          text: "Square本番連携に失敗しました",
        });
        console.error("square production product failed:", productRes.data?.error);
        return;
      }

      // 2. メイン画像同期
      setProdSyncStep("image");
      const imageRes = await postSquareAction<SquareProductImageSyncResponse>({
        action: SQUARE_PRODUCTION_ACTIONS.syncImage,
        product_id: product.product_id,
      });
      const imageError = imageRes.data?.error ?? "";
      if (!imageRes.ok || !imageRes.data || imageRes.data.success !== true) {
        if (imageError.includes("already has a Square image")) {
          imageResult = "existing";
        } else if (imageError.includes("does not support WebP")) {
          imageResult = "webp";
        } else if (imageError.includes("main image not found")) {
          imageResult = "noimage";
        } else {
          setProdMessage({
            type: "error",
            text: "Square本番連携に失敗しました（画像同期でエラー）",
          });
          console.error("square production image failed:", imageError);
          return;
        }
      }

      // 3. 在庫同期
      setProdSyncStep("inventory");
      const inventoryRes =
        await postSquareAction<SquareProductInventorySyncResponse>({
          action: SQUARE_PRODUCTION_ACTIONS.syncInventory,
          product_id: product.product_id,
        });
      if (
        !inventoryRes.ok ||
        !inventoryRes.data ||
        inventoryRes.data.success !== true
      ) {
        setProdMessage({
          type: "error",
          text: "Square本番連携に失敗しました（在庫同期でエラー）",
        });
        console.error(
          "square production inventory failed:",
          inventoryRes.data?.error
        );
        return;
      }

      // 4. 決済リンク生成（Payment Link）
      //    - すでに Checkout URL がある場合は再生成しない（冪等性維持）
      //    - 未公開 / 売却済みの商品は GAS 側で弾かれるため、
      //      Catalog・画像・在庫を反映したうえで決済リンクのみスキップする
      let paymentLinkResult: "generated" | "existing" | "skipped" = "generated";
      let paymentLinkSkipNote = "";
      if (product.square_checkout_url) {
        // 既存の Checkout URL を尊重し、再生成しない
        paymentLinkResult = "existing";
      } else if (product.publish_status !== "published") {
        // 未公開商品は決済リンクを生成できない（GAS側制約）。
        // 反映済みの Catalog・画像・在庫は作り直さず、決済リンクだけスキップする。
        paymentLinkResult = "skipped";
        paymentLinkSkipNote =
          "商品が未公開のため決済リンクは生成していません。公開後に「決済リンクを生成」を実行してください。";
      } else if (product.inventory_status === "sold") {
        // 売却済み商品も決済リンクを生成できない
        paymentLinkResult = "skipped";
        paymentLinkSkipNote =
          "商品が売却済みのため決済リンクは生成していません。";
      } else {
        setProdSyncStep("paymentLink");
        const linkRes = await postSquareAction<SquarePaymentLinkResponse>({
          action: SQUARE_PRODUCTION_ACTIONS.createPaymentLink,
          product_id: product.product_id,
        });
        if (!linkRes.ok || !linkRes.data || linkRes.data.success !== true) {
          // Catalog・画像・在庫は作成済みなので作り直さず、既存IDを維持する。
          // 再取得して復旧用「決済リンクを生成」ボタンを表示できるようにする。
          setIsProdConfirmOpen(false);
          setProdMessage({
            type: "error",
            text: "Square本番への商品反映は完了しましたが、決済リンクの生成に失敗しました。再度「決済リンクを生成」を実行してください。",
          });
          console.error(
            "square production payment link failed:",
            linkRes.data?.error
          );
          await onRefreshed();
          return;
        }
      }

      setIsProdConfirmOpen(false);
      const reflectedParts = ["商品情報"];
      if (imageResult === "success") {
        reflectedParts.push("画像");
      }
      reflectedParts.push("在庫");
      let successText = `Square本番環境へ${reflectedParts.join("・")}を反映しました`;
      if (imageResult === "existing") {
        successText += "（画像は既に登録済みです）";
      } else if (imageResult === "webp") {
        successText += "（WebP画像は同期されていません）";
      } else if (imageResult === "noimage") {
        successText += "（メイン画像がないため画像同期をスキップしました）";
      }
      if (paymentLinkResult === "generated") {
        successText += "。決済リンクを生成しました。";
      } else if (paymentLinkResult === "skipped") {
        successText += `。${paymentLinkSkipNote}`;
      } else {
        successText += "。決済リンクは生成済みです。";
      }
      setProdMessage({ type: "success", text: successText });

      await onRefreshed();
    } catch (err) {
      setProdMessage({
        type: "error",
        text: "Square本番連携に失敗しました",
      });
      console.error("square production sync failed:", err);
    } finally {
      setProdSyncState("idle");
      setProdSyncStep("idle");
    }
  };

  const handleGenerateSquarePaymentLink = async () => {
    if (paymentLinkState === "saving") return;
    // variation IDが無い場合は生成しない
    if (!product.square_variation_id) return;
    // すでに生成済みの場合は再生成しない
    if (product.square_checkout_url) return;
    if (product.inventory_status === "sold") {
      setPaymentLinkMessage({
        type: "error",
        text: "売却済み商品のため決済リンクを生成できません",
      });
      return;
    }
    if (product.record_status !== "active") return;
    if (product.publish_status !== "published") return;

    setPaymentLinkState("saving");
    setPaymentLinkMessage(null);

    try {
      const res = await postSquareAction<SquarePaymentLinkResponse>({
        action: SQUARE_PRODUCTION_ACTIONS.createPaymentLink,
        product_id: product.product_id,
      });
      if (!res.ok || !res.data || res.data.success !== true) {
        setPaymentLinkMessage({
          type: "error",
          text: "決済リンクの生成に失敗しました",
        });
        console.error("square payment link failed:", res.data?.error);
        return;
      }

      setPaymentLinkMessage({
        type: "success",
        text: "決済リンクを生成しました",
      });

      await onRefreshed();
    } catch (err) {
      setPaymentLinkMessage({
        type: "error",
        text: "決済リンクの生成に失敗しました",
      });
      console.error("square payment link failed:", err);
    } finally {
      setPaymentLinkState("idle");
    }
  };

  const handleCopyCheckoutUrl = async (url: string) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCheckoutCopyFeedback("コピーしました");
    } catch {
      setCheckoutCopyFeedback("コピーに失敗しました");
    }
    window.setTimeout(() => setCheckoutCopyFeedback(""), 2000);
  };

  return (
    <div className="mt-4 rounded-lg border border-background-200 bg-white p-4 md:p-5">
      <h2 className="text-[15px] font-semibold text-foreground-950">Square連携</h2>

      {/*
        Sandbox（MVPでは無効化）
        MVPではUI上非表示。ロジック・表示内容は保持しておきたいためコメントアウトで残す。
        復元する場合はこのブロックのコメントを外すだけでよい。
      */}
      {/*
      <div className="mt-3 rounded-lg border border-background-200 bg-background-50 p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-bold text-foreground-700">Sandbox</p>
          <span className="whitespace-nowrap rounded-full bg-secondary-100 px-2 py-0.5 text-[11px] font-medium text-secondary-800">
            MVPでは無効化
          </span>
        </div>
        <p className="mt-1 text-xs text-foreground-500">
          現在MVPでは無効化されています
        </p>
      </div>
      */}

      {/* 本番環境（Production） */}
      <div className="mt-3 rounded-lg border border-background-200 bg-background-50 p-3 md:p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold text-foreground-700">本番環境</p>
            {isProdLinked && (
              <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-md bg-primary-100 px-2 text-[11px] font-medium leading-none text-primary-500">
                本番連携済み
              </span>
            )}
            {hasProdCheckoutUrl && (
              <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-md bg-accent-100 px-2 text-[11px] font-medium leading-none text-accent-900">
                決済リンク生成済み
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-foreground-500">
            状態：
            <span className="font-medium text-foreground-900">
              {isProdLinked ? "連携済み" : "未連携"}
            </span>
          </p>
          <p className="mt-1 text-xs text-foreground-500">
            Production Item ID：{" "}
            <span className="break-all font-mono text-foreground-900">
              {product.square_item_id || "—"}
            </span>
          </p>
          <p className="mt-1 text-xs text-foreground-500">
            Production Variation ID：{" "}
            <span className="break-all font-mono text-foreground-900">
              {product.square_variation_id || "—"}
            </span>
          </p>
          <p className="mt-1 text-xs text-foreground-500">
            Payment Link ID：{" "}
            <span className="break-all font-mono text-foreground-900">
              {product.square_payment_link_id || "—"}
            </span>
          </p>
        </div>

        {/* 復元後は Square が停止したままである旨の注意（自動再開はされない） */}
        {product.record_status === "active" && isProdLinked && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-background-200 bg-background-50 px-3 py-2 text-xs leading-relaxed text-foreground-600">
            <i className="ri-information-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
            <span>
              アーカイブから復元した商品は、Square側が停止したままです（復元では自動再開されません）。Squareで再開・再連携してください。
            </span>
          </p>
        )}

        {/* Checkout URL */}
        {hasProdCheckoutUrl && (
          <div className="mt-3">
            <p className="text-xs text-foreground-500">Checkout URL：</p>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                readOnly
                value={product.square_checkout_url}
                className="min-w-0 flex-1 rounded-lg border border-background-300 bg-background-50 px-3 py-2 font-mono text-xs text-foreground-900"
              />
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleCopyCheckoutUrl(product.square_checkout_url)
                  }
                  className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-xs font-medium text-foreground-700 transition-colors hover:bg-background-100"
                >
                  <i className="ri-file-copy-line w-4 h-4 flex items-center justify-center"></i>
                  コピー
                </button>
                <a
                  href={product.square_checkout_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-3 py-2 text-xs font-bold text-background-50 transition-colors hover:bg-primary-600"
                >
                  <i className="ri-external-link-line w-4 h-4 flex items-center justify-center"></i>
                  新しいタブで開く
                </a>
              </div>
            </div>
            {checkoutCopyFeedback && (
              <p className="mt-1 text-xs font-medium text-primary-700">
                {checkoutCopyFeedback}
              </p>
            )}
          </div>
        )}

        {/* アクション */}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {!hasProdVariationId && (
            <button
              type="button"
              onClick={() => {
                setProdMessage(null);
                setIsProdConfirmOpen(true);
              }}
              disabled={prodSyncState === "saving" || isProdReflectDisabled}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="ri-store-2-line w-4 h-4 flex items-center justify-center"></i>
              Square本番へ反映
            </button>
          )}

          {hasProdVariationId && !hasProdCheckoutUrl && (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={handleGenerateSquarePaymentLink}
                disabled={paymentLinkState === "saving" || isPaymentLinkDisabled}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {paymentLinkState === "saving" ? (
                  <>
                    <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                    生成中...
                  </>
                ) : (
                  <>
                    <i className="ri-link w-4 h-4 flex items-center justify-center"></i>
                    決済リンクを生成
                  </>
                )}
              </button>
              <p className="text-xs text-foreground-500">
                決済リンクが未生成です。復旧用に生成できます。
              </p>
            </div>
          )}
        </div>

        {!hasProdVariationId && isProdReflectDisabled && (
          <p className="mt-2 text-xs text-foreground-400">
            アーカイブ済みの商品は本番反映できません
          </p>
        )}

        {hasProdVariationId &&
          !hasProdCheckoutUrl &&
          paymentLinkDisabledReason && (
            <p className="mt-2 text-xs text-foreground-400">
              {paymentLinkDisabledReason}
            </p>
          )}

        {isProdLinkInvalid && (
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600">
            <i className="ri-error-warning-line w-4 h-4 flex items-center justify-center"></i>
            Square本番連携情報が不完全です
          </p>
        )}

        {prodMessage && (
          <p
            className={`mt-3 text-sm font-medium ${
              prodMessage.type === "success" ? "text-primary-700" : "text-red-600"
            }`}
          >
            {prodMessage.text}
          </p>
        )}

        {paymentLinkMessage && (
          <p
            className={`mt-3 text-sm font-medium ${
              paymentLinkMessage.type === "success"
                ? "text-primary-700"
                : "text-red-600"
            }`}
          >
            {paymentLinkMessage.text}
          </p>
        )}
      </div>

      {/* Square本番反映確認ダイアログ */}
      {isProdConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-background-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <i className="ri-error-warning-line w-5 h-5 flex items-center justify-center text-red-600"></i>
              <h3 className="text-base font-bold text-foreground-950">
                Square本番環境へ商品を反映
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-foreground-700">
              Square本番環境へ商品を反映します。
              <br />
              <br />
              商品名：{product.product_name}
              <br />
              価格：{formatPrice(product.planned_sale_price)}
              <br />
              <br />
              この操作は実際の販売環境に反映されます。
            </p>

            <div className="mt-3 rounded-lg bg-background-100 px-3 py-2">
              <p className="text-[11px] text-foreground-600">
                反映対象：Catalog Item / Variation・メイン画像・在庫・決済リンク
              </p>
            </div>

            {prodSyncState === "saving" && (
              <div className="mt-3 rounded-lg bg-background-100 px-3 py-2">
                <div className="flex items-center gap-2">
                  <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center text-primary-600"></i>
                  <span className="text-xs font-bold text-foreground-700">
                    Square本番環境へ反映中...
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium text-foreground-600">
                  {prodSyncStep === "product" && "1/4 商品を登録しています"}
                  {prodSyncStep === "image" && "2/4 画像を同期しています"}
                  {prodSyncStep === "inventory" && "3/4 在庫を同期しています"}
                  {prodSyncStep === "paymentLink" && "4/4 決済リンクを生成しています"}
                </p>
              </div>
            )}

            {prodMessage && prodMessage.type === "error" && (
              <p className="mt-3 text-sm font-medium text-red-600">
                {prodMessage.text}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsProdConfirmOpen(false)}
                disabled={prodSyncState === "saving"}
                className="whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSyncSquareProduction}
                disabled={prodSyncState === "saving"}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {prodSyncState === "saving" ? (
                  <>
                    <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                    反映中...
                  </>
                ) : (
                  "本番へ反映する"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}