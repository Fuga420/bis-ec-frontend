import { useState } from "react";
import BisImagePlaceholder from "@/components/base/BisImagePlaceholder";

type ThumbnailSize = "sm" | "md" | "lg";

interface ProductThumbnailProps {
  src: string;
  alt: string;
  // sm: 56px / md: 72px（モバイル一覧）/ lg: 64px（デスクトップ一覧の標準サイズ）
  size?: ThumbnailSize;
}

// 画像はサイズ違いでも同じ比率（正方形）で表示し、一覧の世界観を揃える。
// 一覧は情報密度を優先するため、標準表示は 64px・角丸6px（rounded-md）に統一する。
const SIZE_CLASSES: Record<ThumbnailSize, string> = {
  sm: "h-14 w-14 rounded-md",
  md: "h-[72px] w-[72px] rounded-md",
  lg: "h-16 w-16 rounded-md",
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