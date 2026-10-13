import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.15;

interface ImageLightboxProps {
  images: string[];
  index: number;
  productName: string;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

/**
 * 商品画像の拡大表示（ライトボックス）。
 * 表示専用で、画像の保存やAPI通信は一切行わない。
 * ホイール / ボタンでズーム、ドラッグでパン（移動）ができる。
 */
export default function ImageLightbox({
  images,
  index,
  productName,
  onClose,
  onNavigate,
}: ImageLightboxProps) {
  const count = images.length;
  const safeIndex = count > 0 ? Math.min(Math.max(index, 0), count - 1) : 0;
  const src = images[safeIndex] ?? "";
  const [failed, setFailed] = useState(false);

  // ズーム倍率と表示位置（表示専用・保存はしない）
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    ox: number;
    oy: number;
  } | null>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  // 画像がはみ出さない範囲に表示位置を制限する
  const clampOffset = useCallback((x: number, y: number, s: number) => {
    const el = imgRef.current;
    if (!el || s <= 1) return { x: 0, y: 0 };
    const maxX = (el.offsetWidth * (s - 1)) / 2;
    const maxY = (el.offsetHeight * (s - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  // 表示する画像が変わったらズーム・位置・エラー状態をリセットする
  useEffect(() => {
    setFailed(false);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragging(false);
    dragRef.current = null;
  }, [src]);

  // Escで閉じる・矢印キーで前後の画像へ移動
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (count <= 1) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onNavigate((safeIndex - 1 + count) % count);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onNavigate((safeIndex + 1) % count);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [count, safeIndex, onClose, onNavigate]);

  // モーダル表示中は背景のスクロールを止める
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // ホイールでカーソル位置を中心にズームする。
  // passive なリスナーだと preventDefault が効かないため、ネイティブで passive:false を指定する。
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const current = scaleRef.current;
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current * factor));
      if (next === current) return;
      const ratio = next / current;
      const nx = dx * (1 - ratio) + ratio * offsetRef.current.x;
      const ny = dy * (1 - ratio) + ratio * offsetRef.current.y;
      setScale(next);
      setOffset(clampOffset(nx, ny, next));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [clampOffset]);

  const resetZoom = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  // 中心を基準にズーム倍率を変更する（ボタン操作用）
  const zoomBy = (factor: number) => {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    if (next === scale) return;
    if (next === 1) {
      resetZoom();
      return;
    }
    const ratio = next / scale;
    setScale(next);
    setOffset(clampOffset(offset.x * ratio, offset.y * ratio, next));
  };

  const handleDoubleClick = () => {
    if (scale > 1) {
      resetZoom();
    } else {
      setScale(2);
      setOffset(clampOffset(0, 0, 2));
    }
  };

  const handlePointerDown = (e: ReactPointerEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
    setDragging(true);
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset(
      clampOffset(
        d.ox + (e.clientX - d.startX),
        d.oy + (e.clientY - d.startY),
        scale
      )
    );
  };

  const handlePointerUp = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const isZoomed = scale > 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${productName} の画像を拡大表示`}
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="拡大表示を閉じる"
        className="absolute right-4 top-4 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-background-50 transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <i className="ri-close-line text-xl"></i>
      </button>

      {count > 1 && (
        <button
          type="button"
          aria-label="前の画像"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate((safeIndex - 1 + count) % count);
          }}
          className="absolute left-3 z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-background-50 transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 md:left-6"
        >
          <i className="ri-arrow-left-s-line text-2xl"></i>
        </button>
      )}

      <div
        ref={stageRef}
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-full max-w-full flex-col items-center"
      >
        <div
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`flex select-none items-center justify-center touch-none ${
            isZoomed
              ? dragging
                ? "cursor-grabbing"
                : "cursor-grab"
              : "cursor-zoom-in"
          }`}
        >
          {src && !failed ? (
            <img
              ref={imgRef}
              src={src}
              alt={`${productName} ${safeIndex + 1}`}
              draggable={false}
              onError={() => setFailed(true)}
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transition: dragging ? "none" : "transform 0.15s ease-out",
              }}
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
            />
          ) : (
            <div className="flex h-[60vh] w-[70vw] max-w-2xl flex-col items-center justify-center gap-2 rounded-lg bg-white/5 text-background-50">
              <i className="ri-image-line w-12 h-12 flex items-center justify-center text-2xl text-white/50"></i>
              <span className="text-sm text-white/70">画像を表示できません</span>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            aria-label="縮小"
            onClick={() => zoomBy(1 / ZOOM_STEP)}
            disabled={!isZoomed}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-background-50 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <i className="ri-subtract-line"></i>
          </button>
          <button
            type="button"
            aria-label="等倍に戻す"
            onClick={resetZoom}
            disabled={!isZoomed}
            className="flex h-9 min-w-[64px] cursor-pointer items-center justify-center whitespace-nowrap rounded-full bg-white/10 px-3 text-xs font-medium text-background-50 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            aria-label="拡大"
            onClick={() => zoomBy(ZOOM_STEP)}
            disabled={scale >= MAX_SCALE}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-background-50 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <i className="ri-add-line"></i>
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {count > 1 && (
            <span className="whitespace-nowrap rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-background-50">
              {safeIndex + 1} / {count}
            </span>
          )}
          <span className="text-[11px] text-white/60">
            ホイール / ダブルクリックでズーム、ドラッグで移動
          </span>
        </div>
      </div>

      {count > 1 && (
        <button
          type="button"
          aria-label="次の画像"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate((safeIndex + 1) % count);
          }}
          className="absolute right-3 z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-background-50 transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 md:right-6"
        >
          <i className="ri-arrow-right-s-line text-2xl"></i>
        </button>
      )}
    </div>
  );
}