import { useState } from "react";

type ThumbnailSize = "sm" | "md" | "lg";

interface ProductThumbnailProps {
  src: string;
  alt: string;
  // sm: 56px（従来サイズ）/ md: 88px（モバイル一覧）/ lg: 112px（デスクトップ一覧の主役サイズ）
  size?: ThumbnailSize;
}

// 画像はサイズ違いでも同じ比率（正方形）で表示し、一覧の世界観を揃える。
const SIZE_CLASSES: Record<ThumbnailSize, string> = {
  sm: "h-14 w-14 rounded-md",
  md: "h-[88px] w-[88px] rounded-lg",
  lg: "h-28 w-28 rounded-lg",
};

const ICON_CLASSES: Record<ThumbnailSize, string> = {
  sm: "w-5 h-5 text-base",
  md: "w-6 h-6 text-lg",
  lg: "w-7 h-7 text-xl",
};

export default function ProductThumbnail({
  src,
  alt,
  size = "sm",
}: ProductThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src || failed;
  const sizeClass = SIZE_CLASSES[size];

  if (showPlaceholder) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center bg-background-100 ${sizeClass}`}
      >
        <i
          className={`ri-image-line flex items-center justify-center text-foreground-300 ${ICON_CLASSES[size]}`}
        ></i>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className={`shrink-0 border border-background-200 bg-background-100 object-cover object-top ${sizeClass}`}
    />
  );
}