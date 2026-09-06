import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOST_CONTEXT_CHANGED_EVENT,
  useHostLocation,
} from '../useHostLocation';

let renders = 0;
function Probe() {
  renders += 1;
  useHostLocation();
  return null;
}

describe('useHostLocation', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.useFakeTimers();
    renders = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Probe />));
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('re-renders on back/forward and on the host context-changed event', () => {
    const before = renders;
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    // Same URL: popstate alone does not change the snapshot.
    expect(renders).toBe(before);
    act(() => {
      window.dispatchEvent(new Event(HOST_CONTEXT_CHANGED_EVENT));
    });
    expect(renders).toBe(before + 1);
  });

  it('re-renders when the URL changes under a silent pushState', () => {
    const before = renders;
    window.history.pushState({}, '', '/elsewhere');
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(renders).toBe(before + 1);
  });
});
