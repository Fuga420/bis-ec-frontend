import { useEffect, useMemo, useRef, useState } from "react";
import {
  IMPORT_ALLOWED_IMAGE_TYPES,
  IMPORT_MAX_IMAGE_SIZE,
  IMPORT_MAX_IMAGES,
} from "@/pages/import/lib/multiImport";

interface SetImageEditorProps {
  images: File[];
  onChange: (files: File[]) => void;
  // 取り込み中・成功・受付不明のセットは編集させない（再送前に内容を変えないため）。
  disabled?: boolean;
  error?: string;
}

/**
 * 1商品セット分の画像を編集する。
 * 画面の並び順がそのまま送信順になり、先頭がメイン画像になる。
 * 画像0枚のときは広いドロップエリア、追加後はサムネイルのグリッドを表示する。
 * 追加 / 並べ替え / 削除 / メイン画像変更 ができる（検証・上限は従来どおり）。
 */
export default function SetImageEditor({
  images,
  onChange,
  disabled = false,
  error,
}: SetImageEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState("");

  const previews = useMemo(
    () => images.map((f) => URL.createObjectURL(f)),
    [images]
  );

  useEffect(() => {
    const urls = previews;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [previews]);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || disabled) return;
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const wrongType = incoming.filter(
      (f) => !IMPORT_ALLOWED_IMAGE_TYPES.includes(f.type)
    );
    if (wrongType.length > 0) {
      setLocalError(
        "対応していない画像形式があります（JPG / PNG / WEBP のみ）。"
      );
      return;
    }
    const oversize = incoming.filter((f) => f.size > IMPORT_MAX_IMAGE_SIZE);
    if (oversize.length > 0) {
      setLocalError("1枚あたり5MBを超える画像は取り込めません。");
      return;
    }

    const remaining = IMPORT_MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setLocalError(`1セットに取り込める画像は最大${IMPORT_MAX_IMAGES}枚です。`);
      return;
    }

    const next = [...images, ...incoming].slice(0, IMPORT_MAX_IMAGES);
    onChange(next);
    setLocalError(
      incoming.length > remaining
        ? `1セットに取り込める画像は最大${IMPORT_MAX_IMAGES}枚です。`
        : ""
    );
  };

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  };

  const removeImage = (index: number) => {
    if (disabled) return;
    setLocalError("");
    onChange(images.filter((_, i) => i !== index));
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    if (disabled) return;
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };

  const setMainImage = (index: number) => {
    if (disabled || index <= 0) return;
    const next = [...images];
    const [moved] = next.splice(index, 1);
    next.unshift(moved);
    onChange(next);
  };

  const message = error || localError;
  const isEmpty = images.length === 0;
  const canAddMore = !disabled && images.length < IMPORT_MAX_IMAGES;

  const dragHandlers = {
    onDragOver: (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      setIsDragging(true);
    },
    onDragLeave: () => setIsDragging(false),
    onDrop: handleDrop,
  };

  return (
    <div className="flex flex-col gap-2">
      {isEmpty ? (
        // 画像0枚：横幅いっぱいのドロップエリア
        disabled ? (
          <div className="flex min-h-[180px] w-full items-center justify-center rounded-[10px] border-2 border-dashed border-background-300 bg-background-50 text-xs text-foreground-400">
            画像は登録されていません。
          </div>
        ) : (
          <div
            {...dragHandlers}
            onClick={openPicker}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openPicker();
              }
            }}
            className={`flex min-h-[180px] w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[10px] border-2 border-dashed px-4 py-8 text-center transition-colors ${
              isDragging
                ? "border-primary-400 bg-primary-50"
                : "border-background-400 bg-white hover:border-primary-300 hover:bg-background-50"
            }`}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-background-100">
              <i className="ri-image-add-line text-2xl text-foreground-400"></i>
            </span>
            <p className="mt-1 text-sm font-medium text-foreground-800">
              画像をドラッグ＆ドロップ
            </p>
            <p className="text-xs text-foreground-500">
              またはクリックしてファイルを選択
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openPicker();
              }}
              className="mt-2 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-background-400 bg-white px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700"
            >
              <i className="ri-upload-2-line w-4 h-4 flex items-center justify-center"></i>
              画像を選択
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-foreground-400">
              画像1〜{IMPORT_MAX_IMAGES}枚・1枚5MBまで（JPG / PNG / WEBP）
              <br className="hidden sm:block" />
              1枚目がメイン画像になります
            </p>
          </div>
        )
      ) : (
        // 画像追加済み：サムネイルのグリッド
        <div
          {...dragHandlers}
          className={`rounded-[10px] border p-2 transition-colors ${
            isDragging
              ? "border-primary-400 bg-primary-50"
              : "border-transparent"
          }`}
        >
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {images.map((file, index) => (
              <div
                key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                className="group relative aspect-square overflow-hidden rounded-lg border border-background-300 bg-background-100"
              >
                <img
                  src={previews[index]}
                  alt={`商品画像 ${index + 1}`}
                  className="h-full w-full object-cover object-top"
                />
                {index === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-primary-500 px-1.5 py-0.5 text-[10px] font-bold text-background-50">
                    メイン
                  </span>
                )}
                {!disabled && (
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 bg-black/50 px-1 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveImage(index, -1)}
                        disabled={index === 0}
                        className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-background-50 transition-colors hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-30"
                        title="前へ移動"
                      >
                        <i className="ri-arrow-left-s-line text-[12px]"></i>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveImage(index, 1)}
                        disabled={index === images.length - 1}
                        className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-background-50 transition-colors hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-30"
                        title="後へ移動"
                      >
                        <i className="ri-arrow-right-s-line text-[12px]"></i>
                      </button>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setMainImage(index)}
                        disabled={index === 0}
                        className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-background-50 transition-colors hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-30"
                        title="メイン画像にする"
                      >
                        <i className="ri-star-line text-[12px]"></i>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-background-50 transition-colors hover:bg-white/25"
                        title="削除"
                      >
                        <i className="ri-close-line text-[12px]"></i>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {canAddMore && (
              <button
                type="button"
                onClick={openPicker}
                className="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-background-400 bg-white transition-colors hover:border-primary-400 hover:bg-primary-50"
              >
                <i className="ri-add-line text-xl text-foreground-400"></i>
                <span className="text-[10px] text-foreground-500">追加</span>
              </button>
            )}
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {!isEmpty && (
        <p className="text-[11px] text-foreground-400">
          画像 {images.length} / {IMPORT_MAX_IMAGES}枚・ドラッグ＆ドロップ可・
          <span className="text-foreground-500">1枚目がメイン画像</span>
          （JPG / PNG / WEBP・1枚5MBまで）
        </p>
      )}
      {message && (
        <p className="flex items-center gap-1 text-xs text-red-600">
          <i className="ri-error-warning-line w-4 h-4 flex items-center justify-center"></i>
          {message}
        </p>
      )}
    </div>
  );
}