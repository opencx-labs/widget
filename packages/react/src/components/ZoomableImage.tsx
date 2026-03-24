import React, { useCallback, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { cn } from './lib/utils/cn';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.5;
const CLICK_ZOOM_SCALE = 2.5;

type Point = { x: number; y: number };

function clampTranslate(
  translate: Point,
  scale: number,
  container: HTMLDivElement | null,
  image: HTMLImageElement | null,
): Point {
  if (!container || !image || scale <= 1) return { x: 0, y: 0 };

  const containerRect = container.getBoundingClientRect();
  const imgW = image.offsetWidth;
  const imgH = image.offsetHeight;

  const maxX = Math.max(0, (imgW * scale - containerRect.width) / (2 * scale));
  const maxY = Math.max(
    0,
    (imgH * scale - containerRect.height) / (2 * scale),
  );

  return {
    x: Math.min(maxX, Math.max(-maxX, translate.x)),
    y: Math.min(maxY, Math.max(-maxY, translate.y)),
  };
}

export function ZoomableImage({
  src,
  alt,
}: {
  src: string;
  alt?: string;
}) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<Point>({ x: 0, y: 0 });
  const translateStart = useRef<Point>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const pointerMovedRef = useRef(false);

  const clampScale = (s: number) =>
    Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const reset = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const zoomIn = useCallback(() => {
    setScale((s) => clampScale(s + ZOOM_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => {
      const next = clampScale(prev - ZOOM_STEP);
      if (next <= 1) setTranslate({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setScale((prev) => {
      const next = clampScale(prev + delta);
      if (next <= 1) setTranslate({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      pointerMovedRef.current = false;
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      translateStart.current = { ...translate };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [translate],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        pointerMovedRef.current = true;
      }
      if (scale <= 1) return;
      const raw = {
        x: translateStart.current.x + dx / scale,
        y: translateStart.current.y + dy / scale,
      };
      setTranslate(
        clampTranslate(raw, scale, containerRef.current, imgRef.current),
      );
    },
    [isDragging, scale],
  );

  const handlePointerUp = useCallback(() => {
    const didDrag = pointerMovedRef.current;
    setIsDragging(false);
    if (didDrag) return;

    setScale((prev) => {
      if (prev > 1) {
        setTranslate({ x: 0, y: 0 });
        return 1;
      }
      return CLICK_ZOOM_SCALE;
    });
  }, []);

  const isZoomed = scale > 1;

  return (
    <div
      className="relative size-full flex items-center justify-center select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        ref={containerRef}
        className={cn(
          'overflow-hidden max-h-full max-w-full rounded-2xl flex items-center justify-center',
          isZoomed && 'size-full',
        )}
        // onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          cursor: isDragging ? 'grabbing' : isZoomed ? 'grab' : 'zoom-in',
          touchAction: 'none',
        }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className="block max-w-full object-contain pointer-events-none"
          draggable={false}
          style={{
            maxHeight: '100vh',
            transform: `scale(${scale}) translate(${translate.x}px, ${translate.y}px)`,
            transformOrigin: 'center center',
            // transition: isDragging ? 'none' : 'all 0.2s ease-out',
          }}
        />
      </div>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-1.5 py-1 transition opacity-50 hover:opacity-100">
        <ControlButton onClick={zoomOut} label="Zoom out" disabled={scale <= MIN_SCALE}>
          <ZoomOut className="size-3.5" />
        </ControlButton>
        <span className="text-white text-xs font-medium min-w-[3ch] text-center tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <ControlButton onClick={zoomIn} label="Zoom in" disabled={scale >= MAX_SCALE}>
          <ZoomIn className="size-3.5" />
        </ControlButton>
        {isZoomed && (
          <>
            <div className="w-px h-4 bg-white/30 mx-0.5" />
            <ControlButton onClick={reset} label="Reset zoom">
              <RotateCcw className="size-3.5" />
            </ControlButton>
          </>
        )}
      </div>
    </div>
  );
}

function ControlButton({
  onClick,
  label,
  children,
  disabled,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className="text-white/80 hover:text-white disabled:text-white/30 disabled:hover:bg-transparent p-1.5 rounded-full hover:bg-white/15 transition-colors"
    >
      {children}
    </button>
  );
}
