import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const motion = vi.hoisted(() => {
  const value = {
    current: 0,
    get: vi.fn(() => value.current),
    set: vi.fn((next: number) => {
      value.current = next;
    }),
  };
  return { animate: vi.fn(), value };
});

vi.mock('framer-motion', () => ({
  animate: motion.animate,
  useMotionValue: () => motion.value,
}));

import { usePersistedPillDrag } from '../usePersistedPillDrag';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('usePersistedPillDrag', () => {
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;
  let latest: ReturnType<typeof usePersistedPillDrag>;
  let releaseDrag: FrameRequestCallback | undefined;

  const storage = {
    getCompanionPillOffsetX: vi.fn(async () => 100),
    setCompanionPillOffsetX: vi.fn(async () => {}),
  };

  beforeEach(() => {
    motion.value.current = 0;
    motion.value.get.mockClear();
    motion.value.set.mockClear();
    motion.animate.mockClear();
    storage.getCompanionPillOffsetX.mockClear();
    storage.setCompanionPillOffsetX.mockClear();
    releaseDrag = undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      releaseDrag = callback;
      return 1;
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1000,
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function Harness({
    state = 'pill',
    viewportWidth = 1000,
    currentWidth = 48,
  }: {
    state?: 'pill' | 'input';
    viewportWidth?: number;
    currentWidth?: number;
  }) {
    latest = usePersistedPillDrag({
      storage,
      state,
      layout: 'compact',
      viewportWidth,
      currentWidth,
      restingWidth: 48,
      shouldReduceMotion: true,
    });
    return null;
  }

  it('restores, bounds, persists, and arbitrates drag clicks', async () => {
    await act(async () => root.render(<Harness />));
    expect(motion.animate).toHaveBeenLastCalledWith(
      motion.value,
      100,
      expect.any(Object),
    );
    motion.value.current = 100;
    expect(latest.dragConstraints).toEqual({
      left: -464,
      right: 464,
      top: 0,
      bottom: 0,
    });

    act(() => latest.onDragStart());
    expect(latest.shouldIgnoreLaunch()).toBe(true);
    act(() => latest.onDragEnd());
    expect(storage.setCompanionPillOffsetX).toHaveBeenCalledWith(100);
    expect(latest.shouldIgnoreLaunch()).toBe(true);

    act(() => releaseDrag?.(0));
    expect(latest.shouldIgnoreLaunch()).toBe(false);
  });

  it('keeps a saved launcher reachable when sessions grow or the viewport shrinks', async () => {
    await act(async () => root.render(<Harness />));
    motion.value.current = 400;
    act(() => root.render(<Harness viewportWidth={200} />));
    expect(motion.value.current).toBe(64);
    expect(motion.value.set).not.toHaveBeenCalledWith(400);
  });

  it('settles centered when an open panel is wider than the viewport', async () => {
    await act(async () =>
      root.render(
        <Harness state="input" viewportWidth={20} currentWidth={100} />,
      ),
    );

    expect(motion.animate).toHaveBeenLastCalledWith(
      motion.value,
      0,
      expect.any(Object),
    );
  });
});
