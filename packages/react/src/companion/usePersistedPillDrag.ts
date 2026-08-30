import type { WidgetCompanionLayoutU, WidgetCtx } from '@opencx/widget-core';
import { animate, useMotionValue } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PILL_SIZE, VIEWPORT_EDGE_PADDING } from './companion-geometry.utils';
import { EASE_OUT, MORPH_SPRING } from './materials';
import type { PanelState } from './types';

const PILL_SETTLE_TRANSITION = { duration: 0.15, ease: EASE_OUT } as const;

type PillOffsetStorage = Pick<
  NonNullable<WidgetCtx['storageCtx']>,
  'getCompanionPillOffsetX' | 'setCompanionPillOffsetX'
>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function currentViewportWidth(): number {
  return typeof window === 'undefined' ? 1440 : window.innerWidth;
}

/**
 * Owns the launcher pill's motion value, persisted resting offset, viewport
 * clamping, and drag/click arbitration.
 */
export function usePersistedPillDrag({
  storage,
  state,
  layout,
  viewportWidth,
  currentWidth,
  restingWidth,
  shouldReduceMotion,
}: {
  storage: PillOffsetStorage | undefined;
  state: PanelState;
  layout: WidgetCompanionLayoutU;
  viewportWidth: number;
  currentWidth: number;
  restingWidth: number;
  shouldReduceMotion: boolean | null;
}) {
  const [pillOffsetX, setPillOffsetX] = useState(0);
  const dragX = useMotionValue(0);
  const wasDraggingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!storage) return;

    void storage
      .getCompanionPillOffsetX()
      .then((saved) => {
        if (cancelled || saved === null) return;
        const bound = Math.max(
          0,
          currentViewportWidth() / 2 - PILL_SIZE / 2 - VIEWPORT_EDGE_PADDING,
        );
        const offset = clamp(saved, -bound, bound);
        setPillOffsetX(offset);
        dragX.set(offset);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [dragX, storage]);

  useEffect(() => {
    const settle = shouldReduceMotion ? PILL_SETTLE_TRANSITION : MORPH_SPRING;
    if (state === 'pill') {
      const bound = Math.max(
        0,
        viewportWidth / 2 - restingWidth / 2 - VIEWPORT_EDGE_PADDING,
      );
      animate(dragX, clamp(pillOffsetX, -bound, bound), settle);
      return;
    }

    if (state === 'chat' && (layout === 'fullscreen' || layout === 'sidebar')) {
      animate(dragX, 0, settle);
      return;
    }

    const maxOffset = Math.max(
      0,
      viewportWidth / 2 - currentWidth / 2 - VIEWPORT_EDGE_PADDING,
    );
    animate(dragX, clamp(pillOffsetX, -maxOffset, maxOffset), settle);
  }, [
    currentWidth,
    dragX,
    layout,
    pillOffsetX,
    restingWidth,
    shouldReduceMotion,
    state,
    viewportWidth,
  ]);

  const restingBound = Math.max(
    0,
    viewportWidth / 2 - restingWidth / 2 - VIEWPORT_EDGE_PADDING,
  );
  const dragConstraints = useMemo(
    () => ({ left: -restingBound, right: restingBound, top: 0, bottom: 0 }),
    [restingBound],
  );

  const onDragStart = useCallback(() => {
    wasDraggingRef.current = true;
  }, []);

  const onDragEnd = useCallback(() => {
    const offset = dragX.get();
    setPillOffsetX((previous) => (previous === offset ? previous : offset));
    void storage?.setCompanionPillOffsetX(offset).catch(() => {});
    requestAnimationFrame(() => {
      wasDraggingRef.current = false;
    });
  }, [dragX, storage]);

  const shouldIgnoreLaunch = useCallback(() => wasDraggingRef.current, []);

  return {
    dragX,
    dragConstraints,
    onDragStart,
    onDragEnd,
    shouldIgnoreLaunch,
  };
}
