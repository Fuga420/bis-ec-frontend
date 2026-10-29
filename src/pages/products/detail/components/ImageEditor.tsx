import { useEffect, useRef, useState } from "react";
import type { AdminProductImage } from "@/pages/products/types";

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGES = 20;

export interface ImageOrderItem {
  source: "existing" | "new";
  id: string;
}

export interface NewImageFile {
  client_id: string;
  file: File;
}

export interface ImageSavePayload {
  image_order: ImageOrderItem[];
  newImages: NewImageFile[];
}

type UnifiedImage =
  | {
      source: "existing";
      id: string;
      image: AdminProductImage;
      preview_url: string;
    }
  | {
      source: "new";
      id: string;
      file: File;
      preview_url: string;
    };

function generateClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface ImageEditorProps {
  existingImages: AdminProductImage[];
  saving: boolean;
  error: string;
  onSave: (payload: ImageSavePayload) => void;
  onCancel: () => void;
  // AI解析に使う画像（Driveのfile_id）。最大3枚。空配列は指定解除。
  aiSelectedFileIds?: string[];
  aiSelectionSaving?: boolean;
  aiSelectionError?: string;
  aiSelectionMessage?: string;
  onToggleAiImage?: (fileId: string) => void;
  onSaveAiSelection?: (fileIds: string[]) => void;
}

const MAX_AI_IMAGES = 3;

export default function ImageEditor({
  existingImages,
  saving,
  error,
  onSave,
  onCancel,
  aiSelectedFileIds,
  aiSelectionSaving = false,
  aiSelectionError = "",
  aiSelectionMessage = "",
  onToggleAiImage,
  onSaveAiSelection,
}: ImageEditorProps) {
  // AI解析用の選択は親が保持する（保存→再取得で検証するため）
  const aiSelectionEnabled =
    Array.isArray(aiSelectedFileIds) &&
    typeof onToggleAiImage === "function" &&
    typeof onSaveAiSelection === "function";
  const selectedAiIds = aiSelectedFileIds ?? [];
  const inputRef = useRef<HTMLInputElement>(null);
  const blobUrlsRef = useRef<string[]>([]);

  const [items, setItems] = useState<UnifiedImage[]>(() =>
    existingImages.map((img) => ({
      source: "existing",
      id: img.file_id,
      image: img,
      preview_url: img.display_url,
    }))
  );
  const [localError, setLocalError] = useState("");
  const [showZeroConfirm, setShowZeroConfirm] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const totalCount = items.length;

  // 保存済み（Driveのfile_id がある）画像だけがAI解析用に選べる。
  const selectableImages = items.filter(
    (item): item is Extract<UnifiedImage, { source: "existing" }> =>
      item.source === "existing" && Boolean(item.image.file_id)
  );

  useEffect(() => {
    const urls = blobUrlsRef.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const createBlobUrl = (file: File): string => {
    const url = URL.createObjectURL(file);
    blobUrlsRef.current.push(url);
    return url;
  };

  const revokeBlobUrl = (url: string) => {
    URL.revokeObjectURL(url);
    blobUrlsRef.current = blobUrlsRef.current.filter((u) => u !== url);
  };

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    setLocalError("");

    const candidates = Array.from(fileList).filter((f) =>
      ALLOWED_IMAGE_TYPES.includes(f.type)
    );

    if (candidates.length === 0) {
      setLocalError(
        "対応していない画像形式が含まれています（JPG / JPEG / PNG / WEBP のみ）"
      );
      return;
    }

    const remaining = MAX_IMAGES - totalCount;
    if (remaining <= 0) {
      setLocalError("商品画像は最大20枚までです");
      return;
    }

    const oversized = candidates.find((f) => f.size > MAX_IMAGE_SIZE);
    if (oversized) {
      setLocalError("1枚あたり5MBを超える画像は登録できません");
      return;
    }

    const toAdd = candidates.slice(0, remaining).map((file) => ({
      source: "new" as const,
      id: generateClientId(),
      file,
      preview_url: createBlobUrl(file),
    }));
    setItems((prev) => [...prev, ...toAdd]);
    if (candidates.length > remaining) {
      setLocalError("商品画像は最大20枚までです");
    }
  };

  const move = (from: number, to: number) => {
    setItems((prev) => {
      if (from === to || from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const setAsMain = (index: number) => {
    if (index === 0) return;
    move(index, 0);
  };

  const moveLeft = (index: number) => {
    if (index === 0) return;
    move(index, index - 1);
  };

  const moveRight = (index: number) => {
    if (index >= totalCount - 1) return;
    move(index, index + 1);
  };

  const removeAt = (index: number) => {
    setItems((prev) => {
      const item = prev[index];
      if (item?.source === "new") {
        revokeBlobUrl(item.preview_url);
      }
      return prev.filter((_, i) => i !== index);
    });
    setShowZeroConfirm(false);
  };

  const onDragStart = (index: number) => {
    setDragIndex(index);
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const onDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      move(dragIndex, index);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const onDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleSave = () => {
    setLocalError("");
    if (totalCount > MAX_IMAGES) {
      setLocalError("商品画像は最大20枚までです");
      return;
    }
    if (totalCount === 0) {
      if (!showZeroConfirm) {
        setShowZeroConfirm(true);
        return;
      }
    }
    onSave({
      image_order: items.map((item) => ({
        source: item.source,
        id: item.id,
      })),
      newImages: items
        .filter((item): item is Extract<UnifiedImage, { source: "new" }> =>
          item.source === "new"
        )
        .map((item) => ({
          client_id: item.id,
          file: item.file,
        })),
    });
  };

  const handleCancel = () => {
    setShowZeroConfirm(false);
    onCancel();
  };

  return (
    <div className="rounded-lg border border-background-200 bg-white p-4 md:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-foreground-950">商品画像の編集</h2>
        <span className="text-xs text-foreground-500">{totalCount}/20</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item, idx) => {
          const isNew = item.source === "new";
          const isDragging = dragIndex === idx;
          const isDragOver = dragOverIndex === idx && dragIndex !== idx;
          return (
            <div
              key={item.id}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragOver={(e) => onDragOver(e, idx)}
              onDrop={(e) => onDrop(e, idx)}
              onDragEnd={onDragEnd}
              className={`group relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border bg-background-100 transition-opacity ${
                isNew ? "border-primary-300" : "border-background-300"
              } ${isDragging ? "opacity-40" : ""} ${
                isDragOver ? "ring-2 ring-primary-400" : ""
              }`}
            >
              <ImageThumb
                src={item.preview_url}
                alt={`商品画像 ${idx + 1}`}
                isNew={isNew}
              />

              {/* バッジ */}
              {idx === 0 && (
                <span className="absolute left-0.5 top-0.5 rounded bg-accent-500 px-1 py-0 text-[9px] font-bold text-background-50">
                  メイン
                </span>
              )}
              {isNew && (
                <span
                  className={`absolute left-0.5 rounded bg-primary-500 px-1 py-0 text-[9px] font-bold text-background-50 ${
                    idx === 0 ? "top-4" : "top-0.5"
                  }`}
                >
                  新規
                </span>
              )}
              <span className="absolute right-0.5 top-0.5 rounded bg-black/50 px-1 py-0 text-[9px] font-medium text-background-50">
                {idx + 1}
              </span>

              {/* 操作バー（常時表示） */}
              <div className="absolute inset-x-0 bottom-0 flex h-6 items-stretch bg-black/60">
                <button
                  type="button"
                  onClick={() => moveLeft(idx)}
                  disabled={idx === 0}
                  title="前へ"
                  className="flex flex-1 items-center justify-center text-background-50 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <i className="ri-arrow-left-s-line text-sm"></i>
                </button>
                <button
                  type="button"
                  onClick={() => moveRight(idx)}
                  disabled={idx === totalCount - 1}
                  title="後ろへ"
                  className="flex flex-1 items-center justify-center text-background-50 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <i className="ri-arrow-right-s-line text-sm"></i>
                </button>
                <button
                  type="button"
                  onClick={() => setAsMain(idx)}
                  disabled={idx === 0}
                  title="メイン画像に設定"
                  className="flex flex-1 items-center justify-center text-background-50 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <i className="ri-star-line text-sm"></i>
                </button>
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  title="削除"
                  className="flex flex-1 items-center justify-center text-background-50 transition-colors hover:bg-white/20"
                >
                  <i className="ri-close-line text-sm"></i>
                </button>
              </div>
            </div>
          );
        })}

        {/* 追加ボタン */}
        {totalCount < MAX_IMAGES && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-background-300 bg-background-50 transition-colors hover:border-primary-400 hover:bg-background-100"
          >
            <i className="ri-add-line text-xl text-foreground-400"></i>
            <span className="text-[10px] text-foreground-500">画像を追加</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <p className="mt-2 text-[11px] text-foreground-400">
        ドラッグ＆ドロップまたは「前へ・後ろへ」で並び替え・1枚目がメイン画像（最大20枚・JPG / JPEG / PNG / WEBP・1枚5MBまで）
      </p>

      {/* AI解析に使う画像（最大3枚）。販売用のメイン画像・並び順は変更しない。 */}
      {aiSelectionEnabled && (
        <div className="mt-4 rounded-lg border border-background-200 bg-background-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground-900">
              <i className="ri-sparkling-line w-4 h-4 flex items-center justify-center text-primary-600"></i>
              AI解析に使う画像
            </p>
            <span className="text-[11px] tabular-nums text-foreground-500">
              {selectedAiIds.length} / {MAX_AI_IMAGES} 枚
            </span>
          </div>

          {selectableImages.length === 0 ? (
            <p className="mt-2 text-[11px] text-foreground-500">
              保存済みの商品画像がありません。画像を保存すると選べるようになります。
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectableImages.map((item) => {
                const order = selectedAiIds.indexOf(item.image.file_id);
                const isSelected = order >= 0;
                const atLimit =
                  !isSelected && selectedAiIds.length >= MAX_AI_IMAGES;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onToggleAiImage?.(item.image.file_id)}
                    disabled={atLimit || aiSelectionSaving}
                    aria-pressed={isSelected}
                    aria-label={
                      isSelected
                        ? `この画像をAI解析対象から外す`
                        : `この画像をAI解析対象にする`
                    }
                    className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                      isSelected
                        ? "border-primary-500"
                        : "border-background-300 hover:border-background-400"
                    } ${atLimit || aiSelectionSaving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  >
                    <img
                      src={item.preview_url}
                      alt="AI解析に使う画像の候補"
                      className="h-full w-full object-cover object-top"
                    />
                    {isSelected && (
                      <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-bl bg-primary-500 px-1 text-[9px] font-bold text-background-50">
                        {order + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <p className="mt-2 text-[11px] leading-relaxed text-foreground-500">
            未選択の場合は先頭3枚を解析に使います。ここでの選択は販売用のメイン画像や画像の並び順を変えません。
          </p>

          {aiSelectionError && (
            <p className="mt-1.5 flex items-start gap-1 text-[11px] font-medium text-red-700">
              <i className="ri-error-warning-line mt-0.5 w-3.5 h-3.5 flex items-center justify-center shrink-0"></i>
              <span className="min-w-0 flex-1">{aiSelectionError}</span>
            </p>
          )}
          {aiSelectionMessage && (
            <p className="mt-1.5 flex items-start gap-1 text-[11px] font-medium text-primary-700">
              <i className="ri-checkbox-circle-line mt-0.5 w-3.5 h-3.5 flex items-center justify-center shrink-0"></i>
              <span className="min-w-0 flex-1">{aiSelectionMessage}</span>
            </p>
          )}

          <button
            type="button"
            onClick={() => onSaveAiSelection?.(selectedAiIds)}
            disabled={aiSelectionSaving || selectableImages.length === 0}
            className="mt-2 inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-white px-3 py-1.5 text-xs font-medium text-foreground-800 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiSelectionSaving ? (
              <>
                <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
                保存中...
              </>
            ) : (
              <>
                <i className="ri-save-line w-3.5 h-3.5 flex items-center justify-center"></i>
                AI解析用の画像を保存
              </>
            )}
          </button>
        </div>
      )}

      {(localError || error) && (
        <p className="mt-2 flex items-center gap-1 text-sm text-accent-600">
          <i className="ri-error-warning-line w-4 h-4 flex items-center justify-center"></i>
          {localError || error}
        </p>
      )}

      {showZeroConfirm && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-accent-300 bg-accent-50 p-3">
          <p className="text-sm font-medium text-foreground-800">
            商品画像が0枚になります。よろしいですか？
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowZeroConfirm(false);
                onSave({ image_order: [], newImages: [] });
              }}
              disabled={saving}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-bold text-background-50 transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              削除して保存
            </button>
            <button
              type="button"
              onClick={() => setShowZeroConfirm(false)}
              disabled={saving}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-background-300 px-3 py-1.5 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
            >
              戻る
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <>
              <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
              保存中...
            </>
          ) : (
            <>
              <i className="ri-save-line w-4 h-4 flex items-center justify-center"></i>
              画像の変更を保存
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function ImageThumb({
  src,
  alt,
  isNew,
}: {
  src: string;
  alt: string;
  isNew: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background-100 pb-6">
        <i className="ri-image-line text-xl text-foreground-300"></i>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className={`h-full w-full object-cover object-top ${isNew ? "" : ""}`}
    />
  );
}