import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageMark } from '../page-mark';
import { PageMarksProvider, usePageMarks } from '../PageMarksProvider';
import { usePageMarking } from '../usePageMarking';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * Page-marking against a real (jsdom) host document: hover framing,
 * click-to-place, the editable mark (move, corner resize, shape switch),
 * re-placing on a click elsewhere, cursor affordances, the attached payload,
 * and — the rule the Widget-scoped provider exists for — marks surviving a
 * composer swap. Notation is mocked (jsdom lacks the APIs it draws through),
 * with `show()` inserting a sibling SVG like the real thing.
 */

type MockInk = {
  target: unknown;
  options: Record<string, unknown>;
  finished: Promise<void>;
  showCount: number;
  hideCount: number;
  removeCount: number;
  updates: Array<Record<string, unknown>>;
  show(): MockInk;
  hide(): MockInk;
  remove(): void;
  update(options: Record<string, unknown>): MockInk;
};

const notation = vi.hoisted(() => {
  const created: MockInk[] = [];
  const annotate = (target: unknown, options: Record<string, unknown>) => {
    const ink: MockInk = {
      target,
      options,
      finished: Promise.resolve(),
      showCount: 0,
      hideCount: 0,
      removeCount: 0,
      updates: [],
      show() {
        ink.showCount += 1;
        if (target instanceof HTMLElement && target.parentElement) {
          const svg = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'svg',
          );
          svg.setAttribute('class', 'notation');
          target.insertAdjacentElement('afterend', svg);
        }
        return ink;
      },
      hide() {
        ink.hideCount += 1;
        return ink;
      },
      remove() {
        ink.removeCount += 1;
      },
      update(options: Record<string, unknown>) {
        ink.updates.push(options);
        return ink;
      },
    };
    created.push(ink);
    return ink;
  };
  return { created, annotate };
});

vi.mock('@shardsui/notation', () => ({ annotate: notation.annotate }));

const thumbnails = vi.hoisted(() => ({
  begun: [] as Array<[object, Element]>,
}));
vi.mock('../mark-thumbnail', () => ({
  beginThumbnail: (key: object, el: Element) =>
    thumbnails.begun.push([key, el]),
  getThumbnail: () => undefined,
}));

let container: HTMLDivElement;
let root: Root;
let marking: ReturnType<typeof usePageMarking>;
let pageMarks: ReturnType<typeof usePageMarks>;
const onAttach = vi.fn<(mark: PageMark) => void>();

function Harness({ enabled = true }: { enabled?: boolean }) {
  pageMarks = usePageMarks();
  marking = usePageMarking({
    enabled,
    onAttach,
    accentColor: 'rebeccapurple',
    zIndex: 10,
  });
  return null;
}

function renderHarness(enabled = true) {
  root.render(
    <PageMarksProvider>
      <Harness enabled={enabled} />
    </PageMarksProvider>,
  );
}

beforeEach(() => {
  onAttach.mockClear();
  notation.created.length = 0;
  thumbnails.begun.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    renderHarness();
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
  document
    .querySelectorAll('[data-opencx-overlay]')
    .forEach((el) => el.remove());
});

/** A host button whose rect the click snaps to. */
function pageButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.id = 'host-btn';
  btn.textContent = 'Create Key';
  btn.getBoundingClientRect = () =>
    ({
      x: 100,
      y: 100,
      left: 100,
      top: 100,
      width: 120,
      height: 32,
      right: 220,
      bottom: 132,
    }) as DOMRect;
  document.body.appendChild(btn);
  // jsdom has no layout — make hit-testing land on the button.
  document.elementFromPoint = () => btn;
  return btn;
}

function pointer(
  type: string,
  x: number,
  y: number,
  target: EventTarget = document,
) {
  act(() => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y,
      }),
    );
  });
}

const click = (x: number, y: number) => {
  pointer('pointerdown', x, y);
  pointer('pointerup', x, y);
};

const ink = () => notation.created.at(-1)!;
const cursorRule = () =>
  document.querySelector('style[data-opencx-mark-cursor]')?.textContent ?? '';

describe('usePageMarking', () => {
  it('frames the element under the cursor while nothing is placed', () => {
    pageButton();
    act(() => marking.toggle());
    pointer('pointermove', 150, 110);
    expect(marking.hover).toMatchObject({ rect: { x: 100, y: 100 } });
    const firstKey = marking.hover!.key;
    pointer('pointermove', 160, 112); // same element → same key
    expect(marking.hover!.key).toBe(firstKey);
    expect(cursorRule()).toContain('crosshair');

    click(150, 110);
    expect(marking.hover).toBeNull(); // editing now — the frame yields
  });

  it('a click lands a box mark snapped around the element', () => {
    pageButton();
    act(() => marking.toggle());
    click(150, 110);

    expect(marking.draft?.rect).toEqual({
      x: 94,
      y: 94,
      width: 132,
      height: 44,
    });
    expect(marking.draft?.shape).toBe('box');
    expect(ink().options).toMatchObject({
      type: 'box',
      color: 'rebeccapurple',
    });
    // The mark anchors to a widget-owned placeholder, never a host element.
    expect(
      (ink().target as HTMLElement).hasAttribute('data-opencx-overlay'),
    ).toBe(true);
    expect(document.querySelectorAll('svg.notation')).toHaveLength(1);
  });

  it('keeps the frame and the mark inside the viewport for an oversized element', () => {
    // A full-height sidebar: unclamped, the frame's edges would be drawn off
    // the page and read as a border running off the screen.
    const nav = document.createElement('nav');
    nav.getBoundingClientRect = () =>
      ({
        x: -20,
        y: -200,
        left: -20,
        top: -200,
        width: 260,
        height: 1400,
        right: 240,
        bottom: 1200,
      }) as DOMRect;
    document.body.appendChild(nav);
    document.elementFromPoint = () => nav;

    act(() => marking.toggle());
    pointer('pointermove', 120, 300);
    // jsdom's viewport is 1024x768; the margin is 8 on every side.
    expect(marking.hover?.rect).toEqual({
      x: 8,
      y: 8,
      width: 232,
      height: 752,
    });

    click(120, 300);
    expect(marking.draft?.rect).toEqual({
      x: 8,
      y: 8,
      width: 238,
      height: 752,
    });
  });

  it('a click on empty page opens a default region around the cursor', () => {
    document.elementFromPoint = () => null;
    act(() => marking.toggle());
    click(400, 300);
    expect(marking.draft?.rect).toEqual({
      x: 320,
      y: 250,
      width: 160,
      height: 100,
    });
  });

  it('the cursor advertises move inside, resize on a corner, crosshair outside', () => {
    pageButton();
    act(() => marking.toggle());
    click(150, 110); // rect: 94,94 → 226,138

    pointer('pointermove', 150, 110);
    expect(cursorRule()).toContain('move');
    pointer('pointermove', 226, 138); // SE corner
    expect(cursorRule()).toContain('nwse-resize');
    pointer('pointermove', 226, 94); // NE corner
    expect(cursorRule()).toContain('nesw-resize');
    pointer('pointermove', 600, 500); // elsewhere
    expect(cursorRule()).toContain('crosshair');
  });

  it('dragging inside moves the mark; the ink follows', () => {
    pageButton();
    act(() => marking.toggle());
    click(150, 110);

    pointer('pointerdown', 150, 110);
    pointer('pointermove', 250, 210); // +100, +100
    pointer('pointerup', 250, 210);
    expect(marking.draft?.rect).toMatchObject({ x: 194, y: 194 });
    expect((ink().target as HTMLElement).style.left).toBe('194px');
    expect(ink().updates.length).toBeGreaterThan(0);
  });

  it('dragging a corner resizes; the opposite corner stays put', () => {
    pageButton();
    act(() => marking.toggle());
    click(150, 110);
    pointer('pointerdown', 226, 138); // SE
    pointer('pointermove', 300, 200);
    pointer('pointerup', 300, 200);
    expect(marking.draft?.rect).toEqual({
      x: 94,
      y: 94,
      width: 206,
      height: 106,
    });
  });

  it('switching shape re-inks in place, and the choice survives a re-place', () => {
    pageButton();
    act(() => marking.toggle());
    click(150, 110);
    act(() => marking.setShape('crossed-off'));
    expect(marking.draft?.shape).toBe('crossed-off');
    expect(ink().updates.at(-1)).toMatchObject({ type: 'crossed-off' });

    // Clicking elsewhere points at a different thing — same chosen shape.
    click(600, 500);
    expect(marking.draft?.shape).toBe('crossed-off');
    expect(ink().options).toMatchObject({ type: 'crossed-off' });
  });

  it('clicking elsewhere re-places the mark instead of stranding it', () => {
    pageButton();
    act(() => marking.toggle());
    click(150, 110);
    const first = ink();

    document.elementFromPoint = () => null;
    click(600, 500);
    expect(first.hideCount).toBe(1); // the old draft un-drew
    expect(notation.created).toHaveLength(2);
    expect(marking.draft?.rect).toMatchObject({ x: 520, y: 450 });
  });

  it('attaches shape + note + covered elements from the FINAL rect, then disarms', () => {
    pageButton();
    act(() => marking.toggle());
    click(150, 110);
    act(() => marking.attach('  why is this greyed out?  '));

    expect(onAttach).toHaveBeenCalledTimes(1);
    const mark = onAttach.mock.calls[0]![0];
    expect(mark).toMatchObject({
      shape: 'box',
      note: 'why is this greyed out?',
      pageUrl: window.location.href,
      rect: { x: 94, y: 94, width: 132, height: 44 },
    });
    expect(mark.elements[0]).toMatchObject({
      selector: '#host-btn',
      tag: 'button',
    });
    expect(() => JSON.stringify(mark)).not.toThrow();
    // The focus element's thumbnail was started, keyed by the mark.
    expect(thumbnails.begun[0]?.[0]).toBe(mark);
    expect((thumbnails.begun[0]?.[1] as HTMLElement).id).toBe('host-btn');
    expect(marking.isActive).toBe(false);
    expect(ink().hideCount).toBe(0); // the ink STAYS, the store owns it now
  });

  it('an empty note attaches without one; Esc drops the mark instead', () => {
    pageButton();
    act(() => marking.toggle());
    click(150, 110);
    act(() => marking.attach('   '));
    expect(onAttach.mock.calls[0]![0].note).toBeUndefined();
    const kept = ink();

    act(() => marking.toggle());
    click(150, 110);
    const dropped = ink();
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(onAttach).toHaveBeenCalledTimes(1);
    expect(marking.draft).toBeNull();
    expect(dropped.hideCount).toBe(1);
    expect(kept.hideCount).toBe(0);
  });

  it('cleans up its listeners and cursor rule on disarm', () => {
    pageButton();
    act(() => marking.toggle());
    act(() => marking.disarm());
    expect(document.querySelector('style[data-opencx-mark-cursor]')).toBeNull();
    click(150, 110);
    expect(marking.draft).toBeNull();
  });

  it('disarms, drops the draft, and releases host events when disabled', () => {
    const button = pageButton();
    const hostAction = vi.fn();
    button.addEventListener('pointerdown', hostAction);
    act(() => marking.toggle());
    click(150, 110);
    const draftInk = ink();

    act(() => renderHarness(false));

    expect(pageMarks.isArmed).toBe(false);
    expect(marking.isActive).toBe(false);
    expect(marking.draft).toBeNull();
    expect(draftInk.hideCount).toBe(1);
    expect(cursorRule()).toBe('');

    pointer('pointerdown', 150, 110, button);
    expect(hostAction).toHaveBeenCalledOnce();
    expect(marking.draft).toBeNull();

    act(() => marking.toggle());
    expect(pageMarks.isArmed).toBe(false);
  });

  it('claims the complete pointer/click sequence before host controls receive it', () => {
    const button = pageButton();
    const hostAction = vi.fn();
    for (const type of [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'click',
    ]) {
      button.addEventListener(type, hostAction);
    }

    act(() => marking.toggle());
    pointer('pointerdown', 150, 110, button);
    pointer('pointermove', 155, 112, button);
    pointer('pointerup', 155, 112, button);
    pointer('pointercancel', 155, 112, button);
    pointer('click', 155, 112, button);

    expect(hostAction).not.toHaveBeenCalled();
    expect(marking.draft).not.toBeNull();
  });

  it('ends an in-flight drag on pointercancel', () => {
    pageButton();
    act(() => marking.toggle());
    click(150, 110);

    pointer('pointerdown', 150, 110);
    pointer('pointermove', 250, 210);
    pointer('pointercancel', 250, 210);
    const cancelledAt = marking.draft?.rect;
    pointer('pointermove', 350, 310);

    expect(marking.draft?.rect).toEqual(cancelledAt);
  });
});

describe('attached marks outlive the composer', () => {
  function Pills() {
    pageMarks = usePageMarks();
    return <span data-testid="count">{pageMarks.marks.length}</span>;
  }

  it('survive the composer unmounting, and un-draw only on detach', () => {
    pageButton();
    act(() => marking.toggle());
    click(150, 110);
    act(() => marking.attach('note'));
    const mark = onAttach.mock.calls[0]![0];
    const committed = ink();

    // The panel swaps: composer gone, widget-scoped provider still mounted.
    act(() => {
      root.render(
        <PageMarksProvider>
          <Pills />
        </PageMarksProvider>,
      );
    });
    expect(committed.hideCount).toBe(0);
    expect(committed.removeCount).toBe(0);
    expect(container.textContent).toBe('1');

    act(() => pageMarks.detach(mark));
    expect(committed.hideCount).toBe(1);
    expect(container.textContent).toBe('0');
  });

  it('detachAll un-draws every mark — the send path', () => {
    pageButton();
    act(() => marking.toggle());
    click(150, 110);
    act(() => marking.attach(''));
    const committed = ink();
    act(() => pageMarks.detachAll());
    expect(committed.hideCount).toBe(1);
  });
});
