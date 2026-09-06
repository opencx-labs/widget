import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCompanionMeasurements } from '../useCompanionMeasurements';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('useCompanionMeasurements', () => {
  const callbacks: ResizeObserverCallback[] = [];
  const disconnect = vi.fn();
  let observedNode: Element | null = null;
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;
  let latest: ReturnType<typeof useCompanionMeasurements>;

  beforeEach(() => {
    callbacks.length = 0;
    disconnect.mockClear();
    observedNode = null;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 900,
      writable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
      writable: true,
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback);
        }
        observe(node: Element) {
          observedNode = node;
        }
        disconnect() {
          disconnect();
        }
      },
    );

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function Harness() {
    latest = useCompanionMeasurements();
    return <div ref={latest.dockContentRef} />;
  }

  it('tracks viewport changes and resolves the measured dock width', () => {
    act(() => root.render(<Harness />));
    expect(latest.region).toEqual({ width: 900, height: 700 });
    if (!observedNode) throw new Error('expected a measured dock node');

    Object.defineProperty(observedNode, 'offsetWidth', {
      configurable: true,
      value: 360,
    });
    act(() => callbacks[0]?.([], {} as ResizeObserver));
    expect(latest.dockWidth).toBe(360);

    window.innerWidth = 500;
    window.innerHeight = 400;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(latest.region).toEqual({ width: 500, height: 400 });

    window.innerWidth = 20;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(latest.dockWidth).toBe(0);
  });

  it('disconnects the dock observer on unmount', () => {
    act(() => root.render(<Harness />));
    act(() => root.render(null));
    expect(disconnect).toHaveBeenCalled();
  });
});
