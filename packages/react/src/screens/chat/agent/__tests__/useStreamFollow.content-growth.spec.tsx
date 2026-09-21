// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStreamFollow } from '../useStreamFollow';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * Late content growth: a row of the list gets taller AFTER the follow effect
 * already pinned — a lazily loaded chart chunk resolving, an image decoding,
 * a reopened session's historical turn source landing from its own fetch.
 * None of those change `followKey`, so the timer-driven follow never re-runs;
 * the list ends up stranded above the bottom with the new content cut off
 * (the reported reopen: `scrollTop` 360 of a 476 max, 116px short). The hook
 * must keep the list at the bottom through a ResizeObserver on the rows —
 * and only while the user is pinned.
 *
 * jsdom has no layout and no ResizeObserver, so both are modeled: geometry is
 * defined on the scroller, and a fake observer records what the hook observes
 * and lets the test deliver "this row's box changed" notifications by hand.
 */

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly targets = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  /** The browser's notification that `target`'s box changed. False when the
   * hook is not observing that element — the notification would never come. */
  notify(target: Element): boolean {
    if (!this.targets.has(target)) return false;
    this.callback([], this);
    return true;
  }
}

function Host({
  followKey,
  rows,
}: {
  followKey: React.DependencyList;
  rows: string[];
}) {
  const { containerRef, handleScroll, showScrollDown, scrollToBottom } =
    useStreamFollow(followKey);
  return (
    <div>
      <div data-testid="scroller" ref={containerRef} onScroll={handleScroll}>
        {rows.map((row) => (
          <div key={row} data-testid={`row-${row}`}>
            {row}
          </div>
        ))}
      </div>
      {showScrollDown ? (
        <button data-testid="to-bottom" type="button" onClick={scrollToBottom}>
          down
        </button>
      ) : null}
    </div>
  );
}

let root: Root;
let container: HTMLDivElement;

function rerender(followKey: React.DependencyList, rows: string[]) {
  act(() => root.render(<Host followKey={followKey} rows={rows} />));
}

function row(name: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    `[data-testid="row-${name}"]`,
  );
  if (!el) throw new Error(`row ${name} not found`);
  return el;
}

/** The one observer the hook created for the scroller. */
function observer(): FakeResizeObserver {
  const live = FakeResizeObserver.instances.at(-1);
  if (!live) throw new Error('the hook created no ResizeObserver');
  return live;
}

/** Fixed, scrollable jsdom geometry whose content height the test can grow.
 * `scrollTop` is a real tracked property so the hook's pin is observable. */
function equipScroller(scrollTop: number) {
  const el = container.querySelector<HTMLElement>('[data-testid="scroller"]');
  if (!el) throw new Error('scroller not found');
  let top = scrollTop;
  let scrollHeight = 1000;
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      top = v;
    },
  });
  Object.defineProperty(el, 'scrollTo', {
    value: vi.fn(),
    configurable: true,
  });
  return {
    el,
    /** Content got taller (a row grew); the viewport does not move on its own. */
    grow(by: number) {
      scrollHeight += by;
    },
    /** Move the scrollbar and fire the scroll event React listens to. */
    scrollTopTo(v: number) {
      top = v;
      act(() => el.dispatchEvent(new Event('scroll', { bubbles: true })));
    },
  };
}

function getButton() {
  return container.querySelector<HTMLButtonElement>(
    '[data-testid="to-bottom"]',
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useStreamFollow — late content growth', () => {
  it('keeps a pinned list at the bottom when a row grows after the follow ran', () => {
    rerender([0], ['chart']);
    const rig = equipScroller(600); // pinned: 1000 - 600 - 400 = 0
    act(() => vi.runAllTimers()); // the mount follow ran and is spent
    expect(rig.el.scrollTop).toBe(1000); // at the bottom

    // The chart chunk resolves and the row gets 116px taller. Nothing else
    // changes, so the timer-driven follow never re-runs: stranded 116px up.
    rig.grow(116);
    expect(rig.el.scrollTop).toBe(1000);

    // The browser tells the observer the row's box changed.
    expect(observer().notify(row('chart'))).toBe(true);

    expect(rig.el.scrollTop).toBe(1116); // back at the bottom
    expect(getButton()).toBeNull();
  });

  it('never re-pins a user who scrolled up (release holds through growth)', () => {
    rerender([0], ['chart']);
    const rig = equipScroller(600);
    act(() => vi.runAllTimers());

    // Positive control on the same rig: pinned, growth pins.
    rig.grow(50);
    expect(observer().notify(row('chart'))).toBe(true);
    expect(rig.el.scrollTop).toBe(1050);

    // The user scrolls up: distance 1050 - 0 - 400 > 150 → released.
    rig.scrollTopTo(0);
    expect(getButton()).not.toBeNull();

    rig.grow(116);
    expect(observer().notify(row('chart'))).toBe(true);

    expect(rig.el.scrollTop).toBe(0); // untouched
    expect(getButton()).not.toBeNull(); // still released
  });

  it('observes a row that mounts without a followKey change (a historical turn landing)', () => {
    rerender([0], ['bubble']);
    const rig = equipScroller(600);
    act(() => vi.runAllTimers());

    expect(rig.el.scrollTop).toBe(1000); // at the bottom

    // Same followKey, one more row: the fetched turn source rendered.
    rerender([0], ['bubble', 'turn']);
    act(() => vi.runAllTimers());
    rig.grow(116);
    expect(rig.el.scrollTop).toBe(1000); // the timer follow did not re-run

    expect(observer().targets.has(row('turn'))).toBe(true);
    expect(observer().notify(row('turn'))).toBe(true);
    expect(rig.el.scrollTop).toBe(1116);
  });

  it('releases rows that unmount and keeps observing the ones that stay', () => {
    rerender([0], ['a', 'b']);
    equipScroller(600);
    const rowA = row('a');
    const rowB = row('b');
    expect(observer().targets.has(rowA)).toBe(true);
    expect(observer().targets.has(rowB)).toBe(true);

    rerender([0], ['b']);

    expect(observer().targets.has(rowA)).toBe(false);
    expect(observer().targets.has(rowB)).toBe(true);
  });

  it('disconnects the observer on unmount', () => {
    rerender([0], ['a']);
    equipScroller(600);
    const live = observer();
    expect(live.targets.size).toBe(1);

    act(() => root.unmount());
    root = createRoot(container); // afterEach unmounts a live root

    expect(live.targets.size).toBe(0);
  });
});
