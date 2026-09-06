import type {
  WidgetCompanionLayoutU,
  WidgetConfig,
  WidgetCtx,
  WidgetSidebarModeU,
  WidgetSidebarSideResolvedU,
} from '@opencx/widget-core';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { mountAppFrame, type AppFrameLease } from './app-frame';
import {
  clamp,
  DEFAULT_SIDEBAR_WIDTH,
  effectiveSidebarWidth,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  type Region,
  SIDEBAR_CANVAS,
} from './companion-geometry';
import { lockHostScroll } from './host-scroll-lock';
import type { PanelState } from './types';

type SidebarWidthStorage = Pick<
  NonNullable<WidgetCtx['storageCtx']>,
  'getCompanionSidebarWidth' | 'setCompanionSidebarWidth'
>;

function readCssVar(
  vars: Readonly<Record<string, string>>,
  name: string,
): string {
  return vars[name] ?? '';
}

/**
 * Owns every effect that mutates the host page: persisted sidebar sizing,
 * pointer/keyboard resize, optional app-frame mounting, and fullscreen scroll
 * locking. The shell receives only the current width and ready-to-spread
 * separator props.
 */
export function useCompanionHostEffects({
  companion,
  layout,
  state,
  region,
  sidebarSide,
  sidebarMode,
  cssVars,
  storage,
  resizeLabel,
}: {
  companion: WidgetConfig['companion'];
  layout: WidgetCompanionLayoutU;
  state: PanelState;
  region: Region;
  /**
   * Already resolved from config + host dir (and the visitor's own pick) by
   * the layout context — everything here works in PHYSICAL terms so an
   * explicit side beats the host document's direction.
   */
  sidebarSide: WidgetSidebarSideResolvedU;
  sidebarMode: WidgetSidebarModeU;
  cssVars: Readonly<Record<string, string>>;
  storage: SidebarWidthStorage | undefined;
  resizeLabel: string;
}) {
  const minSidebarWidth = Math.max(
    0,
    companion?.sidebar?.minWidth ?? MIN_SIDEBAR_WIDTH,
  );
  const maxSidebarWidth = Math.max(
    minSidebarWidth,
    companion?.sidebar?.maxWidth ?? MAX_SIDEBAR_WIDTH,
  );
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    clamp(
      companion?.sidebar?.width ?? DEFAULT_SIDEBAR_WIDTH,
      minSidebarWidth,
      maxSidebarWidth,
    ),
  );
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const frameLeaseRef = useRef<AppFrameLease | null>(null);

  useEffect(() => {
    setSidebarWidth((current) =>
      clamp(
        companion?.sidebar?.width ?? current,
        minSidebarWidth,
        maxSidebarWidth,
      ),
    );
  }, [companion?.sidebar?.width, maxSidebarWidth, minSidebarWidth]);

  useEffect(() => {
    let cancelled = false;
    if (!storage || companion?.sidebar?.width !== undefined) return;

    void storage
      .getCompanionSidebarWidth()
      .then((saved) => {
        if (cancelled || saved === null) return;
        setSidebarWidth(clamp(saved, minSidebarWidth, maxSidebarWidth));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [companion?.sidebar?.width, maxSidebarWidth, minSidebarWidth, storage]);

  // The handle is on the panel's inner edge, so the width is the distance
  // from the pointer to the panel's OWN viewport edge.
  const widthFromPointer = useCallback(
    (clientX: number) =>
      clamp(
        sidebarSide === 'left' ? clientX : window.innerWidth - clientX,
        minSidebarWidth,
        maxSidebarWidth,
      ),
    [maxSidebarWidth, minSidebarWidth, sidebarSide],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setSidebarResizing(true);
      frameLeaseRef.current?.setAnimated(false);
    },
    [],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      setSidebarWidth(widthFromPointer(event.clientX));
    },
    [widthFromPointer],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const finalWidth = widthFromPointer(event.clientX);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setSidebarWidth(finalWidth);
      setSidebarResizing(false);
      frameLeaseRef.current?.setAnimated(true);
      void storage?.setCompanionSidebarWidth(finalWidth).catch(() => {});
    },
    [storage, widthFromPointer],
  );

  const onPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setSidebarResizing(false);
      frameLeaseRef.current?.setAnimated(true);
    },
    [],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      let next: number | null = null;
      if (event.key === 'Home') next = minSidebarWidth;
      if (event.key === 'End') next = maxSidebarWidth;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        // Growing means moving the handle AWAY from the panel's edge: left
        // for a right-side panel, right for a left-side one.
        const grows =
          event.key === (sidebarSide === 'left' ? 'ArrowRight' : 'ArrowLeft');
        next = clamp(
          sidebarWidth + (grows ? 16 : -16),
          minSidebarWidth,
          maxSidebarWidth,
        );
      }
      if (next === null) return;
      event.preventDefault();
      setSidebarWidth(next);
      void storage?.setCompanionSidebarWidth(next).catch(() => {});
    },
    [maxSidebarWidth, minSidebarWidth, sidebarSide, sidebarWidth, storage],
  );

  const isSidebar = layout === 'sidebar';
  const isDocked = sidebarMode === 'docked';
  const frameWidth = effectiveSidebarWidth(region, sidebarWidth);
  const canvas = companion?.sidebar?.canvasColor ?? SIDEBAR_CANVAS;
  const pageBackground = `hsl(${readCssVar(cssVars, '--opencx-background')})`;
  const frameStateRef = useRef({
    open: state !== 'pill',
    width: frameWidth,
  });
  frameStateRef.current = { open: state !== 'pill', width: frameWidth };

  useEffect(() => {
    if (!isSidebar || !isDocked) return;
    const lease = mountAppFrame({ canvas, side: sidebarSide, pageBackground });
    frameLeaseRef.current = lease;
    lease.setWidth(frameStateRef.current.width);
    lease.setOpen(frameStateRef.current.open);
    return () => {
      if (frameLeaseRef.current === lease) frameLeaseRef.current = null;
      lease.release();
    };
  }, [canvas, isDocked, isSidebar, pageBackground, sidebarSide]);

  useEffect(() => {
    if (isSidebar && isDocked) frameLeaseRef.current?.setWidth(frameWidth);
  }, [frameWidth, isDocked, isSidebar]);

  useEffect(() => {
    if (isSidebar && isDocked) {
      frameLeaseRef.current?.setOpen(state !== 'pill');
    }
  }, [isDocked, isSidebar, state]);

  const isFullscreenModal = state === 'chat' && layout === 'fullscreen';
  const lockFullscreenScroll = companion?.fullscreen?.lockScroll !== false;
  useEffect(() => {
    if (!isFullscreenModal || !lockFullscreenScroll) return;
    return lockHostScroll();
  }, [isFullscreenModal, lockFullscreenScroll]);

  const resizeHandleProps = useMemo(
    () => ({
      role: 'separator' as const,
      tabIndex: 0,
      'aria-orientation': 'vertical' as const,
      'aria-label': resizeLabel,
      'aria-valuemin': minSidebarWidth,
      'aria-valuemax': maxSidebarWidth,
      'aria-valuenow': sidebarWidth,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onKeyDown,
    }),
    [
      maxSidebarWidth,
      minSidebarWidth,
      onKeyDown,
      onPointerDown,
      onPointerMove,
      onPointerCancel,
      onPointerUp,
      resizeLabel,
      sidebarWidth,
    ],
  );

  return { sidebarWidth, sidebarResizing, resizeHandleProps };
}
