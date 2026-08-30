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

  function Harness() {
    latest = useCompanionHostEffects({
      companion,
      layout: 'sidebar',
      state: 'chat',
      region: { width: 1000, height: 800 },
      dir: 'ltr',
      cssVars: {},
      storage,
      resizeLabel: 'Resize sidebar',
    });
    return null;
  }

  it('keeps the last width and skips persistence when resize is cancelled', () => {
    act(() => root.render(<Harness />));

    let captured = false;
    const currentTarget = {
      setPointerCapture: vi.fn(() => {
        captured = true;
      }),
      hasPointerCapture: vi.fn(() => captured),
      releasePointerCapture: vi.fn(() => {
        captured = false;
      }),
    };
    const pointerEvent = (clientX: number) =>
      ({
        clientX,
        pointerId: 1,
        currentTarget,
      }) as unknown as React.PointerEvent<HTMLDivElement>;

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
});
