// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStreamFollow } from '../use-stream-follow';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * The hook is the companion-parity streaming scroll behavior. jsdom has no
 * layout, so the container's geometry is defined synthetically and scroll
 * events are dispatched by hand. A minimal host wires the hook to a div — no
 * widget context or child components needed. Re-rendering the SAME root with a
 * changed `followKey` models "new streamed content" while preserving hook
 * state (the ref, the auto-follow flag).
 */
function Host({ followKey }: { followKey: React.DependencyList }) {
  const { containerRef, handleScroll, showScrollDown, scrollToBottom } =
    useStreamFollow(followKey);
  return (
    <div>
      <div data-testid="scroller" ref={containerRef} onScroll={handleScroll} />
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

function rerender(followKey: React.DependencyList) {
  act(() => root.render(<Host followKey={followKey} />));
}

/** Give the jsdom scroller a fixed, scrollable geometry. `scrollTop` is a real
 * tracked property (writable) so the follow effect's `el.scrollTop =
 * el.scrollHeight` is observable; `scrollTo` is a spy (jsdom has no impl). */
function equipScroller(scrollTop = 0) {
  const el = container.querySelector<HTMLElement>('[data-testid="scroller"]');
  if (!el) throw new Error('scroller not found');
  let top = scrollTop;
  Object.defineProperty(el, 'scrollHeight', {
    value: 1000,
    configurable: true,
  });
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      top = v;
    },
  });
  const scrollTo = vi.fn();
  Object.defineProperty(el, 'scrollTo', { value: scrollTo, configurable: true });
  return {
    el,
    scrollTo,
    /** Move the scrollbar and fire the scroll event React listens to. */
    scrollTopTo(v: number) {
      top = v;
      act(() => el.dispatchEvent(new Event('scroll', { bubbles: true })));
    },
  };
}

function getButton() {
  return container.querySelector<HTMLButtonElement>('[data-testid="to-bottom"]');
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('useStreamFollow', () => {
  it('follows the bottom on new content while pinned (auto-follow armed)', () => {
    rerender([0]);
    const rig = equipScroller(/* scrollTop */ 600); // pinned (distance 0)

    // New content arrives → the effect pins to the bottom.
    rerender([1]);
    act(() => vi.runAllTimers());

    expect(rig.el.scrollTop).toBe(1000); // scrolled to scrollHeight
    expect(getButton()).toBeNull(); // no button while pinned
  });

  it('releases follow and shows the button once the user scrolls up', () => {
    rerender([0]);
    const rig = equipScroller(0);

    // User scrolls up: distance 1000 - 0 - 400 = 600 > 150.
    rig.scrollTopTo(0);

    expect(getButton()).not.toBeNull();
  });

  it('does NOT yank the viewport down on new content after scrolling up', () => {
    rerender([0]);
    const rig = equipScroller(0);

    rig.scrollTopTo(0); // release auto-follow
    expect(getButton()).not.toBeNull();

    // New streaming content arrives.
    rerender([1]);
    act(() => vi.runAllTimers());

    // The regression guard: the effect early-returned, scrollTop untouched.
    expect(rig.el.scrollTop).toBe(0);
    expect(getButton()).not.toBeNull(); // still released
  });

  it('re-hides the button when the user scrolls back near the bottom', () => {
    rerender([0]);
    const rig = equipScroller(0);

    rig.scrollTopTo(0);
    expect(getButton()).not.toBeNull();

    // Scroll back within the threshold: distance 1000 - 500 - 400 = 100 < 150.
    rig.scrollTopTo(500);
    expect(getButton()).toBeNull();
  });

  it('scrollToBottom smooth-scrolls, re-arms follow, and hides the button', () => {
    rerender([0]);
    const rig = equipScroller(0);

    rig.scrollTopTo(0); // release + show button
    const button = getButton();
    expect(button).not.toBeNull();

    act(() => button?.click());

    expect(rig.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'smooth' });
    expect(getButton()).toBeNull(); // re-armed → button hidden

    // Proof follow is re-armed: the next content pins to the bottom again.
    rerender([1]);
    act(() => vi.runAllTimers());
    expect(rig.el.scrollTop).toBe(1000);
  });
});
