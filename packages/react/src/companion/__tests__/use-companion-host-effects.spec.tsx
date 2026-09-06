import type { WidgetConfig } from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCompanionHostEffects } from '../useCompanionHostEffects';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('useCompanionHostEffects', () => {
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;
  let latest: ReturnType<typeof useCompanionHostEffects>;

  const companion: NonNullable<WidgetConfig['companion']> = {
    sidebar: { width: 400, minWidth: 200, maxWidth: 600 },
  };
  const storage = {
    getCompanionSidebarWidth: vi.fn(async () => null),
    setCompanionSidebarWidth: vi.fn(async () => {}),
  };

  beforeEach(() => {
    storage.getCompanionSidebarWidth.mockClear();
    storage.setCompanionSidebarWidth.mockClear();
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
  });

  function Harness({
    sidebarSide = 'right',
    sidebarMode = 'floating',
  }: {
    sidebarSide?: 'left' | 'right';
    sidebarMode?: 'docked' | 'floating';
  }) {
    latest = useCompanionHostEffects({
      companion,
      layout: 'sidebar',
      state: 'chat',
      region: { width: 1000, height: 800 },
      sidebarSide,
      sidebarMode,
      cssVars: {},
      storage,
      resizeLabel: 'Resize sidebar',
    });
    return null;
  }

  const pointerTarget = () => {
    let captured = false;
    return {
      setPointerCapture: vi.fn(() => {
        captured = true;
      }),
      hasPointerCapture: vi.fn(() => captured),
      releasePointerCapture: vi.fn(() => {
        captured = false;
      }),
    };
  };

  const pointerEventsOn =
    (currentTarget: ReturnType<typeof pointerTarget>) => (clientX: number) =>
      ({
        clientX,
        pointerId: 1,
        currentTarget,
      }) as unknown as React.PointerEvent<HTMLDivElement>;

  it('keeps the last width and skips persistence when resize is cancelled', () => {
    act(() => root.render(<Harness />));

    const currentTarget = pointerTarget();
    const pointerEvent = pointerEventsOn(currentTarget);

    act(() => {
      latest.resizeHandleProps.onPointerDown(pointerEvent(600));
      latest.resizeHandleProps.onPointerMove(pointerEvent(700));
    });
    expect(latest.sidebarWidth).toBe(300);
    expect(latest.sidebarResizing).toBe(true);

    act(() => latest.resizeHandleProps.onPointerCancel(pointerEvent(0)));
    expect(latest.sidebarWidth).toBe(300);
    expect(latest.sidebarResizing).toBe(false);
    expect(currentTarget.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(storage.setCompanionSidebarWidth).not.toHaveBeenCalled();
  });

  it("measures the drag width from the panel's own edge on a left sidebar", () => {
    act(() => root.render(<Harness sidebarSide="left" />));

    const pointerEvent = pointerEventsOn(pointerTarget());
    act(() => {
      latest.resizeHandleProps.onPointerDown(pointerEvent(0));
      latest.resizeHandleProps.onPointerMove(pointerEvent(360));
    });
    // Left-docked: the width is the pointer's x, not innerWidth - x (which
    // would have given 640 and clamped to the 600 max).
    expect(latest.sidebarWidth).toBe(360);
  });

  it('grows toward the page, so the arrow that grows flips with the side', () => {
    const keyEvent = (key: string) =>
      ({
        key,
        preventDefault: vi.fn(),
      }) as unknown as React.KeyboardEvent<HTMLDivElement>;

    act(() => root.render(<Harness sidebarSide="right" />));
    act(() => latest.resizeHandleProps.onKeyDown(keyEvent('ArrowLeft')));
    expect(latest.sidebarWidth).toBe(416);

    act(() => root.render(<Harness sidebarSide="left" />));
    act(() => latest.resizeHandleProps.onKeyDown(keyEvent('ArrowRight')));
    expect(latest.sidebarWidth).toBe(432);
  });

  it('mounts the host app frame only in docked mode', () => {
    const framed = () =>
      document.documentElement.hasAttribute('data-opencx-app-frame');

    act(() => root.render(<Harness />));
    expect(framed()).toBe(false);

    act(() => root.render(<Harness sidebarMode="docked" />));
    expect(framed()).toBe(true);

    act(() => root.render(<Harness sidebarMode="floating" />));
    expect(framed()).toBe(false);
  });
});
