import React, { act } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useHostPortal } from '../useHostPortal';

// React act() support outside a test renderer
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe() {
  const target = useHostPortal();
  if (!target) return null;
  return createPortal(<div id="portaled" />, target);
}

describe('useHostPortal', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('mounts a widget-owned host div as a direct child of <html>, NOT body', () => {
    // body is what sidebar mode frames with contain:strict — anything
    // portaled into it gets trapped inside the framed page. And React 19
    // treats <html> as a singleton container: createPortal straight into
    // documentElement silently redirects children into body, so the hook
    // must hand out its own raw-DOM-appended element instead.
    act(() => root.render(<Probe />));

    const host = document.querySelector('[data-opencx-root]');
    expect(host).not.toBeNull();
    expect(host?.parentElement).toBe(document.documentElement);
    expect(document.body.contains(host)).toBe(false);
  });

  it('renders portal children inside the host element', () => {
    act(() => root.render(<Probe />));

    const portaled = document.getElementById('portaled');
    expect(portaled).not.toBeNull();
    expect(portaled?.closest('[data-opencx-root]')).not.toBeNull();
    expect(document.body.contains(portaled)).toBe(false);
  });

  it('keeps the wrapper layout-neutral (display: contents)', () => {
    act(() => root.render(<Probe />));

    const host = document.querySelector<HTMLElement>('[data-opencx-root]');
    expect(host?.style.display).toBe('contents');
  });

  it('removes the host div from <html> on unmount', () => {
    act(() => root.render(<Probe />));
    expect(document.querySelector('[data-opencx-root]')).not.toBeNull();

    act(() => root.render(<React.Fragment />));

    expect(document.querySelector('[data-opencx-root]')).toBeNull();
  });
});
