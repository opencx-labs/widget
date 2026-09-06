import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clampRectToViewport,
  describeElement,
  elementAt,
  isWidgetOwned,
  rectOf,
  WIDGET_OWNED_SELECTOR,
  type Rect,
} from './page-element';
import {
  createMarkInk,
  MIN_REGION_SIZE_PX,
  type MarkInk,
  type MarkShape,
  type PageMark,
} from './page-mark';
import { usePageMarks } from './PageMarksProvider';
import { beginSnapshotUpload, beginThumbnail } from './mark-thumbnail';

const CURSOR_STYLE_ATTR = 'data-opencx-mark-cursor';
/** Elements a mark carries to the AI. */
const MAX_MARK_ELEMENTS = 5;
/** Hit-test grid across the region (per axis). */
const SAMPLE_GRID = 4;
/** Breathing room around a snapped element. */
const SNAP_PADDING_PX = 6;
/** The region a click on empty page opens with. */
const DEFAULT_REGION = { width: 160, height: 100 };
/** How close to a corner a press counts as grabbing its resize handle. */
const HANDLE_GRAB_PX = 10;

const NOT_WIDGET_OWNED = WIDGET_OWNED_SELECTOR.map(
  (marker) => `:not(${marker}):not(${marker} *)`,
).join('');

/** The corner being dragged; also the handle the cursor is over. */
type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** The live, editable mark — everything the overlay renders. */
export type MarkDraft = {
  /** Viewport rect (state-driven; the ink mirrors it in page coords). */
  rect: Rect;
  shape: MarkShape;
};

/** The element under the cursor while armed and nothing is placed yet. */
export type MarkHover = {
  rect: Rect;
  /** Changes per hovered ELEMENT — the overlay keys the frame on it. */
  key: number;
};

/** What the cursor says the visitor can do right here. */
type MarkCursor = 'crosshair' | 'move' | 'nwse-resize' | 'nesw-resize';

const cornerCursor = (corner: Corner): MarkCursor =>
  corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize';

/**
 * The composer's page-marking tool: while armed, a hover frame tracks the
 * element under the cursor and a CLICK lands a box mark snapped around it.
 * The mark is then an editable object — drag inside to move, drag a corner to
 * resize, switch shapes, type a note — and the cursor says which of those the
 * pointer is currently on. Clicking somewhere else re-places the mark there
 * (pointing at a different thing is the common case, not an accident); Enter
 * attaches it; Esc drops it, and Esc again disarms.
 *
 * All pointer listeners are capture-phase on the HOST document (the widget's
 * React code runs in the host realm), widget-owned nodes are exempt so the
 * editor card stays usable, and the complete pointer/click sequence is
 * swallowed so marking a button never activates it.
 */
export function usePageMarking({
  enabled,
  onAttach,
  uploadSnapshot,
  accentColor,
  zIndex,
}: {
  /** Whether this composer currently exposes page marking. */
  enabled: boolean;
  /** Notification only — the provider owns the mark either way. */
  onAttach?: (mark: PageMark) => void;
  /**
   * Uploads a mark's thumbnail as a message file and resolves its URL (null
   * on failure). Without it, marks are sent text-only after a reload.
   */
  uploadSnapshot?: (file: File) => Promise<string | null>;
  accentColor: string;
  /** Host-page ink layer, normally resolved from the configured widget z-index. */
  zIndex: number;
}) {
  const { isArmed, setArmed, attach: attachPageMark } = usePageMarks();
  // Gate render/listener state immediately. The provider is synchronized below
  // so a hidden tool cannot remain armed across config or viewport changes.
  const isActive = enabled && isArmed;
  const [draft, setDraft] = useState<MarkDraft | null>(null);
  const [hover, setHover] = useState<MarkHover | null>(null);

  const inkRef = useRef<MarkInk | null>(null);
  const draftRef = useRef<MarkDraft | null>(null);
  draftRef.current = draft;

  const dropDraft = useCallback(() => {
    inkRef.current?.undraw();
    inkRef.current = null;
    setDraft(null);
  }, []);

  const disarm = useCallback(() => setArmed(false), [setArmed]);

  const applyRect = useCallback((rect: Rect) => {
    setDraft((prev) => (prev ? { ...prev, rect } : prev));
    inkRef.current?.setRect({
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  const setShape = useCallback((shape: MarkShape) => {
    setDraft((prev) => (prev ? { ...prev, shape } : prev));
    inkRef.current?.setShape(shape);
  }, []);

  useEffect(() => {
    if (!enabled && isArmed) setArmed(false);
  }, [enabled, isArmed, setArmed]);

  useEffect(() => {
    if (!isActive) return;

    // One injected rule, rewritten as the affordance under the pointer
    // changes: the cursor is the only thing telling the visitor that this
    // spot moves the mark, that one resizes it, and out there places a new
    // one. Widget-owned nodes keep their own cursors.
    const style = document.createElement('style');
    style.setAttribute(CURSOR_STYLE_ATTR, '');
    let cursor: MarkCursor | null = null;
    const setCursor = (next: MarkCursor) => {
      if (next === cursor) return;
      cursor = next;
      style.textContent = `*${NOT_WIDGET_OWNED} { cursor: ${next} !important; }`;
    };
    setCursor('crosshair');
    document.head.appendChild(style);

    /** In-flight gesture on the existing draft. */
    let gesture:
      | { kind: 'move'; grabX: number; grabY: number }
      | { kind: 'resize'; corner: Corner }
      | null = null;

    const isWidgetTarget = (e: Event) =>
      e.target instanceof Element && isWidgetOwned(e.target);

    // Claim the full host-page gesture before it reaches the target. Stopping
    // only pointerdown is insufficient: pointerup/click handlers on a host
    // control can still submit, navigate, toggle, or delete independently.
    const claimHostEvent = (e: Event) => {
      if (isWidgetTarget(e)) return false;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return true;
    };

    const cornerAt = (rect: Rect, x: number, y: number): Corner | null => {
      const corners: Array<[Corner, number, number]> = [
        ['nw', rect.x, rect.y],
        ['ne', rect.x + rect.width, rect.y],
        ['sw', rect.x, rect.y + rect.height],
        ['se', rect.x + rect.width, rect.y + rect.height],
      ];
      for (const [corner, cx, cy] of corners) {
        if (Math.hypot(x - cx, y - cy) <= HANDLE_GRAB_PX) return corner;
      }
      return null;
    };

    const isInside = (rect: Rect, x: number, y: number) =>
      x >= rect.x &&
      x <= rect.x + rect.width &&
      y >= rect.y &&
      y <= rect.y + rect.height;

    const placeRegion = (x: number, y: number) => {
      const el = elementAt(x, y);
      // Clamped: an element that runs past the viewport (a full-height nav,
      // a wide table) must still be marked with a box the visitor can SEE —
      // ink drawn off the page reads as a broken border, not as a mark.
      const rect: Rect = clampRectToViewport(
        el
          ? (() => {
              const r = el.getBoundingClientRect();
              return {
                x: r.left - SNAP_PADDING_PX,
                y: r.top - SNAP_PADDING_PX,
                width: r.width + SNAP_PADDING_PX * 2,
                height: r.height + SNAP_PADDING_PX * 2,
              };
            })()
          : {
              x: x - DEFAULT_REGION.width / 2,
              y: y - DEFAULT_REGION.height / 2,
              ...DEFAULT_REGION,
            },
      );
      // Always a BOX: one predictable default, and the chips do the rest.
      const shape: MarkShape = draftRef.current?.shape ?? 'box';
      setHover(null);
      inkRef.current = createMarkInk(
        {
          x: rect.x + window.scrollX,
          y: rect.y + window.scrollY,
          width: rect.width,
          height: rect.height,
        },
        shape,
        accentColor,
        zIndex,
      );
      setDraft({ rect, shape });
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (!claimHostEvent(e)) return;
      // Right/middle clicks are swallowed but do not create or edit a mark.
      if (e.button !== 0) return;
      const current = draftRef.current;
      if (!current) {
        placeRegion(e.clientX, e.clientY);
        return;
      }
      const corner = cornerAt(current.rect, e.clientX, e.clientY);
      if (corner) {
        gesture = { kind: 'resize', corner };
        return;
      }
      if (isInside(current.rect, e.clientX, e.clientY)) {
        gesture = {
          kind: 'move',
          grabX: e.clientX - current.rect.x,
          grabY: e.clientY - current.rect.y,
        };
        return;
      }
      // Somewhere else on the page: re-place. The visitor is pointing at a
      // different thing, and the note they have typed rides along (the editor
      // card is not remounted) — the current shape does too.
      inkRef.current?.undraw();
      inkRef.current = null;
      placeRegion(e.clientX, e.clientY);
    };

    let lastHoverEl: HTMLElement | null = null;
    let hoverKey = 0;
    const handlePointerMove = (e: PointerEvent) => {
      if (!claimHostEvent(e)) return;
      const current = draftRef.current;
      if (!current) {
        // Armed, nothing placed: track the element under the cursor.
        setCursor('crosshair');
        const el = elementAt(e.clientX, e.clientY);
        if (!el) {
          lastHoverEl = null;
          setHover(null);
          return;
        }
        if (el !== lastHoverEl) {
          lastHoverEl = el;
          hoverKey += 1;
        }
        setHover({ rect: clampRectToViewport(rectOf(el)), key: hoverKey });
        return;
      }

      if (!gesture) {
        // Idle over a draft: the cursor advertises move / resize / re-place.
        const corner = cornerAt(current.rect, e.clientX, e.clientY);
        setCursor(
          corner
            ? cornerCursor(corner)
            : isInside(current.rect, e.clientX, e.clientY)
              ? 'move'
              : 'crosshair',
        );
        return;
      }

      const { rect } = current;
      if (gesture.kind === 'move') {
        applyRect({
          ...rect,
          x: e.clientX - gesture.grabX,
          y: e.clientY - gesture.grabY,
        });
        return;
      }
      // Resize: the dragged corner follows the cursor, its opposite stays put.
      const anchorX = gesture.corner.includes('w')
        ? rect.x + rect.width
        : rect.x;
      const anchorY = gesture.corner.includes('n')
        ? rect.y + rect.height
        : rect.y;
      const x1 = Math.min(anchorX, e.clientX);
      const x2 = Math.max(anchorX, e.clientX);
      const y1 = Math.min(anchorY, e.clientY);
      const y2 = Math.max(anchorY, e.clientY);
      applyRect({
        x: x1,
        y: y1,
        width: Math.max(MIN_REGION_SIZE_PX, x2 - x1),
        height: Math.max(MIN_REGION_SIZE_PX, y2 - y1),
      });
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!claimHostEvent(e)) return;
      gesture = null;
    };

    const handlePointerCancel = (e: PointerEvent) => {
      if (!isWidgetTarget(e)) claimHostEvent(e);
      gesture = null;
    };

    // Swallow clicks so marking a link never navigates the host page.
    const swallow = (e: MouseEvent) => {
      claimHostEvent(e);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      gesture = null;
      if (draftRef.current) {
        inkRef.current?.undraw();
        inkRef.current = null;
        setDraft(null);
        setCursor('crosshair');
        return;
      }
      setArmed(false);
    };

    // Ink is anchored in page coordinates; editor chrome is viewport-fixed.
    // Shift the draft by the scroll delta so handles/editor remain glued to
    // the same ink instead of drifting away from it.
    let previousScrollX = window.scrollX;
    let previousScrollY = window.scrollY;
    const handleScroll = () => {
      setHover(null);
      const deltaX = window.scrollX - previousScrollX;
      const deltaY = window.scrollY - previousScrollY;
      previousScrollX = window.scrollX;
      previousScrollY = window.scrollY;
      if (deltaX === 0 && deltaY === 0) return;
      setDraft((current) =>
        current
          ? {
              ...current,
              rect: {
                ...current.rect,
                x: current.rect.x - deltaX,
                y: current.rect.y - deltaY,
              },
            }
          : current,
      );
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointermove', handlePointerMove, true);
    document.addEventListener('pointerup', handlePointerUp, true);
    document.addEventListener('pointercancel', handlePointerCancel, true);
    document.addEventListener('click', swallow, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('scroll', handleScroll, true);

    return () => {
      style.remove();
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointermove', handlePointerMove, true);
      document.removeEventListener('pointerup', handlePointerUp, true);
      document.removeEventListener('pointercancel', handlePointerCancel, true);
      document.removeEventListener('click', swallow, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('scroll', handleScroll, true);
      setHover(null);
    };
  }, [isActive, accentColor, zIndex, applyRect, setArmed]);

  // Disarming with a draft open (toggle, unmount) must not leak its ink.
  useEffect(() => {
    if (!isActive && draftRef.current) dropDraft();
  }, [isActive, dropDraft]);
  // Unmounting releases only the UNATTACHED draft (its editor card is gone
  // with the composer, so it could never be finished). Attached marks belong
  // to the provider and are deliberately left inked on the page.
  useEffect(
    () => () => {
      inkRef.current?.remove();
      inkRef.current = null;
    },
    [],
  );

  /** Attach the draft with the note (empty note = no note). */
  const attach = useCallback(
    (note: string) => {
      if (!enabled) return;
      const current = draftRef.current;
      const ink = inkRef.current;
      if (!current || !ink) return;
      const trimmed = note.trim();
      // Sampled from the FINAL rect — the region may have moved since it was
      // placed, and what is under it now is what the visitor means.
      const sampled = sampleRegion(current.rect);
      const mark: PageMark = {
        shape: current.shape,
        ...(trimmed ? { note: trimmed } : {}),
        pageUrl: window.location.href,
        rect: current.rect,
        elements: sampled.map(describeElement),
      };
      // Thumbnail for the pill: the region's focus element (center-first
      // sampling puts it first). Rides a WeakMap, never the payload.
      if (sampled[0]) {
        beginThumbnail(mark, sampled[0]);
        // Persist the same pixels: uploaded now, not at send, so the send
        // rarely has to wait and a detached mark costs nothing but an orphan.
        if (uploadSnapshot) beginSnapshotUpload(mark, uploadSnapshot);
      }
      inkRef.current = null;
      setDraft(null);
      setArmed(false);
      attachPageMark(mark, ink);
      onAttach?.(mark);
    },
    [attachPageMark, enabled, onAttach, setArmed, uploadSnapshot],
  );

  const toggle = useCallback(() => {
    if (enabled) setArmed(!isArmed);
  }, [enabled, isArmed, setArmed]);

  return {
    isActive,
    draft,
    hover,
    setShape,
    attach,
    /** Esc-equivalent for the editor card's discard affordance. */
    dropDraft,
    disarm,
    toggle,
  };
}

/**
 * Elements inside the region: hit-test the center first (the region's focus
 * element, which the pill thumbnails), then a coarse grid, dedupe in
 * encounter order, cap. Grid sampling beats geometric intersection because it
 * sees exactly what a click there would see — including overlays and stacking.
 * The mark's own ink and editor are widget-owned and pointer-inert, so they
 * never shadow the page.
 */
function sampleRegion(rect: Rect): HTMLElement[] {
  const found = new Set<HTMLElement>();
  const probe = (x: number, y: number) => {
    const el = elementAt(x, y);
    if (el) found.add(el);
  };
  probe(rect.x + rect.width / 2, rect.y + rect.height / 2);
  for (let i = 0; i <= SAMPLE_GRID; i++) {
    for (let j = 0; j <= SAMPLE_GRID; j++) {
      probe(
        rect.x + (rect.width * i) / SAMPLE_GRID,
        rect.y + (rect.height * j) / SAMPLE_GRID,
      );
    }
  }
  return Array.from(found).slice(0, MAX_MARK_ELEMENTS);
}
