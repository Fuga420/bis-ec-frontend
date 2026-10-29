import {
  fetchProductImageSelection,
  MAX_AI_SELECTED_IMAGES,
} from "@/pages/register/lib/aiProduct";
import { saveProductAiSelectedImages } from "@/pages/products/lib/aiBatch";

/**
 * 「画像から登録」で選んだ AI 解析用画像（最大3枚）を、商品ID発行後に保存する。
 *
 * 画面の画像の並び順＝送信順＝商品の画像順なので、選んだ画像の位置から
 * 同じ位置の Drive file_id を商品詳細APIで取得して保存する。
 * 販売用のメイン画像・画像の並び順は一切変更しない。
 *
 * 保存が成功したと断定できない場合は ok:false を返し、呼び出し側が
 * AI生成を進めないようにできるようにする（成功扱いにしない）。
 */
export interface SaveImportAiSelectionResult {
  ok: boolean;
  // 保存した（または保存を要求した）Drive の file_id
  selectedIds: string[];
  // スタッフ向けのメッセージ（失敗理由・確認結果）
  message?: string;
  // 再取得して選択内容まで一致したか
  verified?: boolean;
}

export async function saveImportAiSelection(params: {
  productId: string;
  // 送信した画像（商品の画像順と同じ）
  images: File[];
  // スタッフが選んだ画像（images 内の File 参照）
  selectedFiles: File[];
}): Promise<SaveImportAiSelectionResult> {
  const { productId, images, selectedFiles } = params;

  if (selectedFiles.length === 0) {
    // 未選択は「保存しない」＝ GAS 側の従来動作（先頭3枚）に委ねる。
    return { ok: true, selectedIds: [] };
  }
  if (selectedFiles.length > MAX_AI_SELECTED_IMAGES) {
    return {
      ok: false,
      selectedIds: [],
      message: `AI解析に使う画像は最大${MAX_AI_SELECTED_IMAGES}枚です。`,
    };
  }

  // 選んだ画像の位置（商品の画像順）を求める。位置が特定できなければ保存しない。
  const indexes = selectedFiles.map((file) => images.indexOf(file));
  if (indexes.some((i) => i < 0)) {
    return {
      ok: false,
      selectedIds: [],
      message:
        "選択した画像が登録画像に見つかりませんでした。画像を選び直してください。",
    };
  }

  let fileIds: string[];
  try {
    const snapshot = await fetchProductImageSelection(productId);
    fileIds = snapshot.fileIds;
  } catch {
    return {
      ok: false,
      selectedIds: [],
      message:
        "商品画像（Driveのfile_id）を取得できなかったため、AI解析用の画像を保存できませんでした。",
    };
  }

  const ids = indexes.map((index) => fileIds[index] ?? "");
  if (ids.some((id) => id === "")) {
    return {
      ok: false,
      selectedIds: [],
      message:
        "選択した画像のDrive file_idを特定できませんでした。AI解析用の画像は保存されていません。",
    };
  }
  // 重複しないようにしつつ、選択した順序を保つ。
  const uniqueIds = Array.from(new Set(ids));

  try {
    await saveProductAiSelectedImages({
      productId,
      selectedImageIds: uniqueIds,
    });
  } catch (err) {
    return {
      ok: false,
      selectedIds: [],
      message:
        err instanceof Error && err.message
          ? `AI解析用の画像の保存に失敗しました: ${err.message}`
          : "AI解析用の画像の保存に失敗しました。",
    };
  }

  // 保存後に再取得して、選択が残っていることを確認する。
  try {
    const after = await fetchProductImageSelection(productId);
    if (after.selectedIds === null) {
      // 商品詳細APIが選択項目を返さない場合は再取得では検証できない。
      return {
        ok: true,
        selectedIds: uniqueIds,
        verified: false,
        message:
          "AI解析用の画像を保存しました（再取得では選択内容を確認できませんでした）。",
      };
    }
    const expected = [...uniqueIds].sort().join("|");
    const actual = [...after.selectedIds].sort().join("|");
    if (expected !== actual) {
      return {
        ok: false,
        selectedIds: after.selectedIds,
        verified: false,
        message:
          "保存は受け付けられましたが、再取得した選択内容が一致しませんでした。保存状況を確認してください。",
      };
    }
    return {
      ok: true,
      selectedIds: after.selectedIds,
      verified: true,
      message: "AI解析用の画像を保存しました（再取得して確認済み）。",
    };
  } catch {
    return {
      ok: false,
      selectedIds: [],
      message:
        "保存後の再取得に失敗したため、AI解析用の画像が保存されたか確認できませんでした。",
    };
  }
}