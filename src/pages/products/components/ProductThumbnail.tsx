import { useState } from "react";

interface ProductThumbnailProps {
  src: string;
  alt: string;
}

export default function ProductThumbnail({ src, alt }: ProductThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src || failed;

  if (showPlaceholder) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-background-100">
        <i className="ri-image-line w-5 h-5 flex items-center justify-center text-foreground-300"></i>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="h-14 w-14 shrink-0 rounded-md object-cover object-top"
    />
  );
}