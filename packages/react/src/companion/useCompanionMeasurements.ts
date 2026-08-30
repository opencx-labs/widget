import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DOCK_FALLBACK_WIDTH,
  PANEL_HORIZONTAL_MARGIN,
  type Region,
} from './companion-geometry.utils';

const FALLBACK_VIEWPORT: Region = { width: 1440, height: 900 };

function getViewportSize(): Region {
  if (typeof window === 'undefined') return FALLBACK_VIEWPORT;
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Owns every DOM measurement used by the companion shell. Callers only need
 * the current viewport, the resolved dock width, and the ref that measures the
 * dock's real content.
 */
export function useCompanionMeasurements() {
  const [region, setRegion] = useState<Region>(getViewportSize);
  const [dockContentWidth, setDockContentWidth] = useState<number | null>(null);
  const dockObserverRef = useRef<ResizeObserver | null>(null);

  const dockContentRef = useCallback((node: HTMLDivElement | null) => {
    dockObserverRef.current?.disconnect();
    dockObserverRef.current = null;
    if (!node) return;

    const observer = new ResizeObserver(() => {
      setDockContentWidth(node.offsetWidth);
    });
    observer.observe(node);
    dockObserverRef.current = observer;
  }, []);

  useEffect(() => {
    function handleResize() {
      setRegion(getViewportSize());
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(
    () => () => {
      dockObserverRef.current?.disconnect();
      dockObserverRef.current = null;
    },
    [],
  );

  const dockWidth = Math.min(
    dockContentWidth ?? DOCK_FALLBACK_WIDTH,
    Math.max(0, region.width - PANEL_HORIZONTAL_MARGIN),
  );

  return { region, dockWidth, dockContentRef };
}
