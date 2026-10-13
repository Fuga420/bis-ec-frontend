import { useEffect, useMemo, useRef, useState } from "react";

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGES = 20;

interface ImageUploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  error?: string;
  // AI解析に使用する先頭枚数（バッジ表示用）
  analysisCount?: number;
}

export default function ImageUpload({
  files,
  onChange,
  error,
  analysisCount,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [limitError, setLimitError] = useState("");

  const previews = useMemo(
    () => files.map((f) => URL.createObjectURL(f)),
    [files]
  );

  useEffect(() => {
    const urls = previews;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [previews]);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const accepted = Array.from(fileList).filter((f) =>
      f.type.startsWith("image/")
    );
    if (accepted.length === 0) return;

    const remaining = MAX_IMAGES - files.length;
    if (remaining <= 0) {
      setLimitError("商品画像は最大20枚までです");
      return;
    }

    const next = [...files, ...accepted].slice(0, MAX_IMAGES);
    onChange(next);
    if (accepted.length > remaining) {
      setLimitError("商品画像は最大20枚までです");
    } else {
      setLimitError("");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeImage = (index: number) => {
    setLimitError("");
    onChange(files.filter((_, i) => i !== index));
  };

  const setMainImage = (index: number) => {
    const next = [...files];
    const [target] = next.splice(index, 1);
    next.unshift(target);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex items-start gap-1.5 overflow-x-auto pb-0.5 ${
          isDragging ? "rounded-md ring-2 ring-primary-400" : ""
        }`}
      >
        {files.map((file, index) => (
          <div
            key={`${file.name}-${index}`}
            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-background-300 bg-background-100"
          >
            <img
              src={previews[index]}
              alt={`商品画像 ${index + 1}`}
              className="h-full w-full object-cover object-top"
            />
            {index === 0 && (
              <span className="absolute left-0.5 top-0.5 rounded bg-accent-500 px-1 py-0 text-[8px] font-bold text-background-50">
                メイン
              </span>
            )}
            {typeof analysisCount === "number" && index < analysisCount && (
              <span className="absolute right-0.5 top-0.5 rounded bg-primary-500 px-1 py-0 text-[8px] font-bold text-background-50">
                AI解析
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-end bg-black/40 px-0.5 py-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              {index !== 0 && (
                <button
                  type="button"
                  onClick={() => setMainImage(index)}
                  className="flex h-5 w-5 items-center justify-center rounded text-background-50 hover:bg-white/20"
                  title="メイン画像にする"
                >
                  <i className="ri-star-line text-[10px]"></i>
                </button>
              )}
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="flex h-5 w-5 items-center justify-center rounded text-background-50 hover:bg-white/20"
                title="削除"
              >
                <i className="ri-close-line text-[10px]"></i>
              </button>
            </div>
          </div>
        ))}

        {files.length < MAX_IMAGES && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0 rounded-md border-2 border-dashed border-background-300 bg-background-50 transition-colors hover:border-primary-400 hover:bg-background-100"
          >
            <i className="ri-add-line text-lg text-foreground-400"></i>
            <span className="text-[10px] text-foreground-500">
              {files.length}/{MAX_IMAGES}
            </span>
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
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <p className="text-[11px] text-foreground-400">
        最大20枚・ドラッグ＆ドロップ可・1枚目がメイン画像（JPG / PNG / WEBP・1枚5MBまで）
      </p>
      {(error || limitError) && (
        <p className="flex items-start gap-1 text-xs leading-relaxed text-red-600">
          <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
          <span className="min-w-0 flex-1">{error || limitError}</span>
        </p>
      )}
    </div>
  );
}