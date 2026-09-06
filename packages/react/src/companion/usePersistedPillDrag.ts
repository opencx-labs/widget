import type { WidgetCompanionLayoutU, WidgetCtx } from '@opencx/widget-core';
import { animate, useMotionValue } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clamp, VIEWPORT_EDGE_PADDING } from './companion-geometry';
import { MORPH_SPRING, QUICK_TWEEN } from '../motion';
import type { PanelState } from './types';

type PillOffsetStorage = Pick<
  NonNullable<WidgetCtx['storageCtx']>,
  'getCompanionPillOffsetX' | 'setCompanionPillOffsetX'
>;

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
        // The saved offset is clamped to the CURRENT viewport by the bounds
        // effect below; here it only has to land somewhere sane.
        setPillOffsetX(saved);
        dragX.set(saved);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [dragX, storage]);

  useEffect(() => {
    const settle = shouldReduceMotion ? QUICK_TWEEN : MORPH_SPRING;
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
