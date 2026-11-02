type BisPlaceholderSize = "sm" | "md" | "lg" | "xl";

interface BisImagePlaceholderProps {
  // 文字サイズのみを切り替える（ボックスの寸法は呼び出し側で指定する）
  size?: BisPlaceholderSize;
  className?: string;
}

// サイズごとの「BIS」の文字組み（小さく・字間を開けて、背景に溶け込ませる）
const TEXT_CLASSES: Record<BisPlaceholderSize, string> = {
  sm: "text-[9px] tracking-[0.18em]",
  md: "text-[11px] tracking-[0.2em]",
  lg: "text-[13px] tracking-[0.22em]",
  xl: "text-base tracking-[0.24em]",
};

/**
 * 商品画像が無いときのプレースホルダ。
 * 画像アイコンを並べる代わりに、薄いグレー面にロゴマーク「BIS」だけを透かして置き、
 * 「空の箱」ではなく「ブランドの余白」として見せる。
 */
export default function BisImagePlaceholder({
  size = "md",
  className = "",
}: BisImagePlaceholderProps) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center bg-background-100 ${className}`}
    >
      {/* 透かしなので選択・コピーはさせない */}
      <span
        className={`select-none whitespace-nowrap font-semibold uppercase leading-none text-foreground-300 ${TEXT_CLASSES[size]}`}
      >
        BIS
      </span>
    </div>
  );
}