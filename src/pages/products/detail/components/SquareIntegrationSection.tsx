import { useState } from "react";
import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
import { syncProductToReadDb } from "@/config/productsApi";
import type {
  AdminProductDetail,
  SquarePaymentLinkResponse,
  SquareProductImageSyncResponse,
  SquareProductInventorySyncResponse,
  SquareProductionProductResponse,
} from "@/pages/products/types";
import SaveStatusMessage from "@/components/base/SaveStatusMessage";
import CatalogueSubHeading from "./CatalogueSubHeading";
import DetailDisclosure from "./DetailDisclosure";

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
  // 技術情報のIDごとのコピー完了表示（キーのみ保持）
  const [copiedKey, setCopiedKey] = useState("");
  const [techOpen, setTechOpen] = useState(false);

  // Production（本番環境）連携状態
  const hasProdItemId = Boolean(product.square_item_id);
  const hasProdVariationId = Boolean(product.square_variation_id);
  const hasProdCheckoutUrl = Boolean(product.square_checkout_url);
  const isTestProduct = Boolean(product.is_test);
  const isProdLinked = hasProdVariationId;
  const isProdLinkInvalid = hasProdItemId !== hasProdVariationId;
  const isProdReflectDisabled =
    product.record_status !== "active" || isTestProduct;
  const isPaymentLinkDisabled =
    isTestProduct ||
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
    if (product.is_test) return;
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
          await syncProductToReadDb(product.product_id);
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

      await syncProductToReadDb(product.product_id);
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
    if (product.is_test) return;
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

      await syncProductToReadDb(product.product_id);
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

  const handleCopyValue = async (key: string, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
    } catch {
      setCopiedKey("");
    }
    window.setTimeout(() => setCopiedKey(""), 2000);
  };

  // 技術情報（ID）は値があるものだけ並べる。すべて空なら折りたたみ自体を出さない。
  const techIds = [
    { key: "item", label: "商品ID（本番）", value: product.square_item_id },
    {
      key: "variation",
      label: "バリエーションID（本番）",
      value: product.square_variation_id,
    },
    {
      key: "paymentLink",
      label: "決済リンクID",
      value: product.square_payment_link_id,
    },
  ].filter((item) => Boolean(item.value));
  const hasTechInfo = techIds.length > 0 || hasProdCheckoutUrl;

  // 連携に必要な条件（済／未済を一目で分かるようにする）
  const requirements = [
    {
      key: "published",
      label: "公開中である",
      met: product.publish_status === "published",
    },
    {
      key: "active",
      label: "レコードが有効（アーカイブでない）",
      met: product.record_status === "active",
    },
    {
      key: "image",
      label: "商品画像が1枚以上ある",
      met: (product.images?.length ?? 0) > 0,
    },
  ];

  return (
    <div>
      {/* サービス単位の小見出し（将来メルカリShops・スニダン等を追加する場合も同じ体裁で並べる） */}
      <CatalogueSubHeading
        title="Square 連携"
        right={
          isProdLinked ? (
            <span className="st-badge st-publish">
              <i className="ri-check-line text-[11px] leading-none"></i>
              連携済み
            </span>
          ) : (
            <span className="st-badge st-muted">
              <i className="ri-error-warning-line text-[11px] leading-none"></i>
              未連携
            </span>
          )
        }
      />

      <p className="mt-1.5 text-[12px] leading-relaxed text-foreground-500">
        本番環境の商品情報・在庫・決済リンクを連携します。
      </p>

      {isTestProduct && (
        <p className="mt-3 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-900">
          <i className="ri-flask-line mt-0.5 w-3.5 h-3.5 shrink-0 flex items-center justify-center text-amber-700"></i>
          <span>
            テスト商品のため、本番Squareへの反映および決済リンク生成は無効化されています。
          </span>
        </p>
      )}

      {/* 未連携のときは、何が揃えば連携できるかをチェックリストで示す */}
      {!isProdLinked && (
        <div className="mt-3 rounded-md bg-background-50 px-3 py-2.5">
          <p className="text-[11px] font-medium text-foreground-600">
            連携に必要な条件
          </p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {requirements.map((req) => (
              <li
                key={req.key}
                className="flex items-baseline gap-2 text-[12px] leading-relaxed"
              >
                <i
                  className={`${
                    req.met ? "ri-check-line" : "ri-subtract-line"
                  } w-3.5 h-3.5 flex shrink-0 items-center justify-center text-[12px] ${
                    req.met ? "text-primary-700" : "text-foreground-400"
                  }`}
                  aria-hidden="true"
                ></i>
                <span
                  className={
                    req.met
                      ? "text-foreground-600"
                      : "font-medium text-foreground-900"
                  }
                >
                  {req.label}
                </span>
                <span
                  className={`whitespace-nowrap text-[11px] font-medium ${
                    req.met ? "text-primary-700" : "text-amber-700"
                  }`}
                >
                  {req.met ? "済" : "未済"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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

      {hasProdCheckoutUrl && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="st-badge st-publish">
            <i className="ri-secure-payment-line text-[11px] leading-none"></i>
            決済リンク生成済み
          </span>
        </div>
      )}

        {/* 復元後は Square が停止したままである旨の注意（自動再開はされない） */}
        {product.record_status === "active" && isProdLinked && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-background-50 px-3 py-2 text-[11.5px] leading-relaxed text-foreground-600">
            <i className="ri-information-line mt-0.5 w-3.5 h-3.5 flex items-center justify-center"></i>
            <span>
              アーカイブから復元した商品は、Square側が停止したままです（復元では自動再開されません）。Squareで再開・再連携してください。
            </span>
          </p>
        )}

        {/* アクション */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {!hasProdVariationId && (
            <button
              type="button"
              onClick={() => {
                setProdMessage(null);
                setIsProdConfirmOpen(true);
              }}
              disabled={prodSyncState === "saving" || isProdReflectDisabled}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary-500 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-background-200 disabled:text-foreground-400"
            >
              <i className="ri-store-2-line w-3.5 h-3.5 flex items-center justify-center"></i>
              Square本番へ反映
            </button>
          )}

          {hasProdVariationId && !hasProdCheckoutUrl && (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={handleGenerateSquarePaymentLink}
                disabled={paymentLinkState === "saving" || isPaymentLinkDisabled}
                className="inline-flex min-w-[140px] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-primary-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-primary-700 transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:border-background-300 disabled:bg-white disabled:text-foreground-400"
              >
                {paymentLinkState === "saving" ? (
                  <>
                    <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
                    生成中...
                  </>
                ) : (
                  <>
                    <i className="ri-link w-3.5 h-3.5 flex items-center justify-center"></i>
                    決済リンクを生成
                  </>
                )}
              </button>
              <p className="text-[11px] leading-relaxed text-foreground-500">
                決済リンクが未生成です。復旧用に生成できます。
              </p>
            </div>
          )}
        </div>

        {!hasProdVariationId && isProdReflectDisabled && (
          <p className="mt-2 text-[11px] text-foreground-500">
            アーカイブ済みの商品は本番反映できません
          </p>
        )}

        {hasProdVariationId &&
          !hasProdCheckoutUrl &&
          paymentLinkDisabledReason && (
            <p className="mt-2 text-[11px] text-foreground-500">
              {paymentLinkDisabledReason}
            </p>
          )}

        {isProdLinkInvalid && (
          <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-amber-700">
            <i className="ri-error-warning-line w-3.5 h-3.5 flex items-center justify-center"></i>
            Square本番連携情報が不完全です
          </p>
        )}

        {prodMessage && (
          <SaveStatusMessage
            tone={prodMessage.type === "success" ? "success" : "error"}
            text={prodMessage.text}
            className="mt-3"
          />
        )}

        {paymentLinkMessage && (
          <SaveStatusMessage
            tone={paymentLinkMessage.type === "success" ? "success" : "error"}
            text={paymentLinkMessage.text}
            className="mt-3"
          />
        )}

      {/* 技術的なIDと決済リンクは折りたたみ（通常は状態と操作だけを見せる） */}
      {!hasTechInfo ? (
        <p className="mt-3 border-t border-background-200 pt-2 text-[11px] leading-relaxed text-foreground-500">
          未連携のため、該当する情報はない
        </p>
      ) : (
        <DetailDisclosure
          open={techOpen}
          onToggle={() => setTechOpen((open) => !open)}
          label="技術情報（Square）"
          count={techIds.length}
          className="mt-3"
        >
          <div>
            <dl className="flex flex-col gap-1.5">
              {techIds.map((item) => (
                <div key={item.key} className="flex items-center gap-2">
                  <dt className="w-[132px] shrink-0 text-[11px] text-foreground-500">
                    {item.label}
                  </dt>
                  <dd className="admin-numeric min-w-0 flex-1 truncate text-[11px] text-foreground-800">
                    {item.value}
                  </dd>
                  <button
                    type="button"
                    onClick={() => handleCopyValue(item.key, item.value)}
                    aria-label={`${item.label}をコピー`}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 whitespace-nowrap rounded border border-background-300 bg-white px-1.5 py-0.5 text-[10.5px] text-foreground-600 transition-colors hover:bg-background-100"
                  >
                    <i className="ri-file-copy-line w-3 h-3 flex items-center justify-center"></i>
                    {copiedKey === item.key ? "コピー済" : "コピー"}
                  </button>
                </div>
              ))}
            </dl>

            {hasProdCheckoutUrl && (
              <div className="mt-2">
                <p className="text-[11px] text-foreground-500">
                  決済リンク（Checkout URL）
                </p>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    readOnly
                    value={product.square_checkout_url}
                    className="min-w-0 flex-1 rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-[11px] text-foreground-800"
                  />
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyCheckoutUrl(product.square_checkout_url)
                      }
                      className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-foreground-600 transition-colors hover:bg-background-100"
                    >
                      <i className="ri-file-copy-line w-3.5 h-3.5 flex items-center justify-center"></i>
                      コピー
                    </button>
                    <a
                      href={product.square_checkout_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary-500 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-primary-600"
                    >
                      <i className="ri-external-link-line w-3.5 h-3.5 flex items-center justify-center"></i>
                      開く
                    </a>
                  </div>
                </div>
                {checkoutCopyFeedback && (
                  <p className="mt-1 text-[11px] font-medium text-primary-700">
                    {checkoutCopyFeedback}
                  </p>
                )}
              </div>
            )}
          </div>
        </DetailDisclosure>
      )}

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
              <SaveStatusMessage tone="error" text={prodMessage.text} className="mt-3" />
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
                className="inline-flex min-w-[124px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
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