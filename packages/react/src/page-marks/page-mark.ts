import { annotate, type Annotation } from '@shardsui/notation';
import type { MarkedElement, Rect } from './page-element';

/**
 * A mark the visitor put on the host page to ask about: a hand-drawn shape
 * around a region, an optional note, and the elements it covers.
 *
 * Every mark on the page — the visitor's here, the agent's in `agent-mark.ts`
 * — is drawn by the same pen (`@shardsui/notation`), so the conversation has
 * one visual language.
 */

/**
 * The mark shapes the visitor can choose. The full notation set: a mark can
 * point at a thing (`arrow`), enclose it (`box`, `circle`, `bracket`),
 * emphasize a line of text (`underline`, `highlight`), or say it is wrong
 * (`strike-through`, `crossed-off`) — all of which are real things people
 * mean when they mark up a page to ask about it.
 *
 * `highlight` is safe here (it is not on the agent's pen) because a visitor
 * mark is anchored to the widget's OWN placeholder, never to a customer
 * element — the one type that writes `position`/`z-index` onto its target
 * can only ever write them onto ours.
 */
export const MARK_SHAPES = [
  'box',
  'circle',
  'arrow',
  'bracket',
  'underline',
  'highlight',
  'strike-through',
  'crossed-off',
] as const;

export type MarkShape = (typeof MARK_SHAPES)[number];

/**
 * Serialized as `clientContext.page_marks` on the send payload — every field
 * must be JSON-safe and meaningful to the LLM. The ink handle stays in the
 * Widget-scoped page-mark provider and the pill thumbnail in a WeakMap,
 * never in the payload.
 */
export type PageMark = {
  /** The shape the visitor chose (boxed it / circled it / struck it out). */
  shape: MarkShape;
  /** The visitor's note, when they wrote one. */
  note?: string;
  /** Page URL at mark time. */
  pageUrl: string;
  /** Viewport bounding box of the marked region. */
  rect: Rect;
  /** Elements inside the region (deduped, focus element first, capped). */
  elements: MarkedElement[];
};

/** A region can never be resized smaller than this, per side. */
export const MIN_REGION_SIZE_PX = 20;
/** Frozen-timeline backstop (hidden tab): never leak nodes forever. */
const UNDRAW_BACKSTOP_MS = 4000;

/**
 * Post-`show()` dressing for notation's sibling-inserted SVGs: mark them
 * widget-owned (no mark may ever target the widget's own ink) and keep the
 * stroke legible over any host page — the faint white drop-shadow is what
 * saves a near-black theme color on a dark page.
 */
export function adoptNotationInk(target: Element, zIndex: number) {
  for (
    let node = target.nextElementSibling;
    node instanceof SVGSVGElement && node.classList.contains('notation');
    node = node.nextElementSibling
  ) {
    node.setAttribute('data-opencx-overlay', '');
    node.style.zIndex = String(zIndex);
    node.style.filter = 'drop-shadow(0 0 1px rgb(255 255 255 / 0.85))';
  }
}

export type MarkInk = {
  /**
   * Re-anchor the mark to a new PAGE rect (live move/resize). Notation
   * redraws with the mark's stable seed — same hand, new place.
   */
  setRect(pageRect: Rect): void;
  /** Switch the mark shape in place. */
  setShape(shape: MarkShape): void;
  /** Reverse-plays the mark off the page, then releases it. */
  undraw(): void;
  /** Immediate teardown. */
  remove(): void;
};

/**
 * Ink a region as a hand-drawn mark, anchored to a widget-owned PLACEHOLDER
 * positioned at the region's page coordinates. Notation needs a target
 * element and a bare region has none — the placeholder gives it one without
 * touching a single node of the customer's DOM, and because it lives in page
 * coordinates the mark scrolls with the content for free.
 *
 * Never throws: a mark is decoration, and a draw failure must not break the
 * composer.
 */
export function createMarkInk(
  pageRect: Rect,
  shape: MarkShape,
  color: string,
  zIndex: number,
): MarkInk {
  const anchor = document.createElement('div');
  anchor.setAttribute('data-opencx-overlay', '');
  Object.assign(anchor.style, {
    position: 'absolute',
    left: `${pageRect.x}px`,
    top: `${pageRect.y}px`,
    width: `${pageRect.width}px`,
    height: `${pageRect.height}px`,
    pointerEvents: 'none',
    zIndex: String(zIndex),
  } satisfies Partial<CSSStyleDeclaration>);
  document.documentElement.appendChild(anchor);

  let marker: Annotation | null = null;
  try {
    marker = annotate(anchor, {
      type: shape,
      color,
      strokeWidth: 2,
      wobble: 0.8,
    });
    marker.show();
    adoptNotationInk(anchor, zIndex);
  } catch (err) {
    console.warn('page mark: could not be drawn', err);
  }

  let gone = false;
  const remove = () => {
    if (gone) return;
    gone = true;
    try {
      marker?.remove();
    } catch {
      // Already torn down.
    }
    anchor.remove();
  };
  /** Redraw in place after the anchor or the options changed. */
  const redraw = (options: Parameters<Annotation['update']>[0]) => {
    if (gone) return;
    try {
      marker?.update(options);
      adoptNotationInk(anchor, zIndex);
    } catch {
      // Decoration only.
    }
  };

  return {
    setRect(nextRect) {
      if (gone) return;
      anchor.style.left = `${nextRect.x}px`;
      anchor.style.top = `${nextRect.y}px`;
      anchor.style.width = `${nextRect.width}px`;
      anchor.style.height = `${nextRect.height}px`;
      redraw({});
    },
    setShape(nextShape) {
      redraw({ type: nextShape });
    },
    undraw() {
      if (gone) return;
      if (!marker) return remove();
      try {
        marker.hide();
        void marker.finished.then(remove);
      } catch {
        return remove();
      }
      window.setTimeout(remove, UNDRAW_BACKSTOP_MS);
    },
    remove,
  };
}
