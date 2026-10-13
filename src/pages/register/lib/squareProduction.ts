import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
import type {
  SquarePaymentLinkResponse,
  SquareProductImageSyncResponse,
  SquareProductInventorySyncResponse,
  SquareProductionProductResponse,
} from "@/pages/products/types";

// Square Production（本番環境）用のバックエンド action 名。
// GAS側の実装名に合わせて、この1箇所だけ変更すればOK。
export const SQUARE_PRODUCTION_ACTIONS = {
  createProduct: "create_square_production_product",
  syncImage: "sync_square_production_image",
  syncInventory: "sync_square_production_inventory",
  createPaymentLink: "create_square_payment_link",
} as const;

export type SquareProductionStep =
  | "idle"
  | "product"
  | "image"
  | "inventory"
  | "paymentLink";

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

export interface SquareProductionSyncResult {
  status: "success" | "partial" | "error";
  message: string;
  squareVariationId?: string;
  paymentLinkId?: string;
  checkoutUrl?: string;
}

/**
 * 商品登録後の後続処理として Square Production 連携を順番に実行する。
 *  1. Catalog Item / Variation 作成
 *  2. メイン画像同期
 *  3. 在庫同期
 *  4. Payment Link 生成
 * 各ステップが成功した場合のみ次へ進み、途中失敗時はその時点で停止する。
 * BIS（Google Sheets）側の商品登録はロールバックしない前提。
 */
export const runSquareProductionSync = async (
  productId: string,
  onStep: (step: SquareProductionStep) => void
): Promise<SquareProductionSyncResult> => {
  // 1. 商品情報（Catalog Item / Variation）
  onStep("product");
  const productRes = await postSquareAction<SquareProductionProductResponse>({
    action: SQUARE_PRODUCTION_ACTIONS.createProduct,
    product_id: productId,
  });
  if (!productRes.ok || !productRes.data || productRes.data.success !== true) {
    console.error("square production product failed:", productRes.data?.error);
    return {
      status: "error",
      message:
        "商品登録は完了しましたが、Square本番への商品反映に失敗しました。商品詳細画面から再実行できます。",
    };
  }
  const squareVariationId = productRes.data.square_variation_id ?? undefined;

  // 2. メイン画像同期
  onStep("image");
  const imageRes = await postSquareAction<SquareProductImageSyncResponse>({
    action: SQUARE_PRODUCTION_ACTIONS.syncImage,
    product_id: productId,
  });
  if (!imageRes.ok || !imageRes.data || imageRes.data.success !== true) {
    // 既知の非致命的なエラー（画像が既に登録済み / WebP非対応 / メイン画像なし）は許容する
    const imageError = imageRes.data?.error ?? "";
    const isNonFatal =
      imageError.includes("already has a Square image") ||
      imageError.includes("does not support WebP") ||
      imageError.includes("main image not found");
    if (!isNonFatal) {
      console.error("square production image failed:", imageError);
      return {
        status: "error",
        message:
          "商品登録は完了しましたが、Square本番への画像同期に失敗しました。商品詳細画面から再実行できます。",
        squareVariationId,
      };
    }
  }

  // 3. 在庫同期
  onStep("inventory");
  const inventoryRes =
    await postSquareAction<SquareProductInventorySyncResponse>({
      action: SQUARE_PRODUCTION_ACTIONS.syncInventory,
      product_id: productId,
    });
  if (
    !inventoryRes.ok ||
    !inventoryRes.data ||
    inventoryRes.data.success !== true
  ) {
    console.error(
      "square production inventory failed:",
      inventoryRes.data?.error
    );
    return {
      status: "error",
      message:
        "商品登録は完了しましたが、Square本番への在庫同期に失敗しました。商品詳細画面から再実行できます。",
      squareVariationId,
    };
  }

  // 4. Payment Link 生成
  onStep("paymentLink");
  const linkRes = await postSquareAction<SquarePaymentLinkResponse>({
    action: SQUARE_PRODUCTION_ACTIONS.createPaymentLink,
    product_id: productId,
  });
  if (!linkRes.ok || !linkRes.data || linkRes.data.success !== true) {
    console.error("square production payment link failed:", linkRes.data?.error);
    return {
      status: "partial",
      message:
        "商品登録は完了しました。Square決済リンクの生成に失敗しました。商品詳細画面から再実行できます。",
      squareVariationId,
    };
  }

  return {
    status: "success",
    message: "Square本番連携が完了し、決済リンクを生成しました。",
    squareVariationId,
    paymentLinkId: linkRes.data.square_payment_link_id,
    checkoutUrl: linkRes.data.square_checkout_url,
  };
};