import { useState } from "react";
import BisImagePlaceholder from "@/components/base/BisImagePlaceholder";

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

// 画像が無いときは画像アイコンではなく、薄いグレーに「BIS」を透かしたプレースホルダにする。
const PLACEHOLDER_SIZE: Record<ThumbnailSize, "sm" | "md" | "lg"> = {
  sm: "sm",
  md: "md",
  lg: "lg",
};

export default function ProductThumbnail({
  src,
  alt,
  size = "sm",
}: ProductThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src || failed;
  const sizeClass = SIZE_CLASSES[size];

  // 画像が切り替わったときに、前の画像の読み込み失敗を引きずらないようにする
  const [prevSrc, setPrevSrc] = useState(src);
  if (prevSrc !== src) {
    setPrevSrc(src);
    if (failed) setFailed(false);
  }

  if (showPlaceholder) {
    return (
      <BisImagePlaceholder
        size={PLACEHOLDER_SIZE[size]}
        className={`shrink-0 border border-background-200 ${sizeClass}`}
      />
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