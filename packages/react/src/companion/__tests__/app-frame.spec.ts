import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mountAppFrame,
  setFrameAnimated,
  setFrameOpen,
  setFrameWidth,
  unmountAppFrame,
} from '../app-frame';

const FRAME_ATTR = 'data-opencx-app-frame';
const STYLE_SELECTOR = 'style[data-opencx-app-frame-style]';
const OPEN_ATTR = 'data-opencx-sidebar-open';
const NO_ANIM_ATTR = 'data-opencx-frame-no-anim';
const WIDTH_VAR = '--opencx-sidebar-w';

function frameStyles(): HTMLStyleElement[] {
  return Array.from(document.querySelectorAll(STYLE_SELECTOR));
}

describe('app-frame', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
  });

  afterEach(() => {
    unmountAppFrame();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('never moves host DOM nodes — body children stay exactly where the host put them', () => {
    // Simulates a React host: an app root plus a body-level portal (Radix
    // menu, toast, ...). The old implementation reparented these into a
    // frame div; React would then crash with NotFoundError on removeChild.
    const appRoot = document.createElement('div');
    appRoot.id = 'app-root';
    const portal = document.createElement('div');
    portal.id = 'react-portal';
    document.body.append(appRoot, portal);

    mountAppFrame({ canvas: '#f4f4f5', dir: 'ltr', pageBackground: '#fff' });

    expect(Array.from(document.body.children)).toEqual([appRoot, portal]);
    expect(appRoot.parentNode).toBe(document.body);
    expect(portal.parentNode).toBe(document.body);
  });

  it('lets the host framework remove its body-level portal while framed (the crash regression)', () => {
    const portal = document.createElement('div');
    document.body.appendChild(portal);

    mountAppFrame({ canvas: '#f4f4f5', dir: 'ltr', pageBackground: '#fff' });

    // This exact call is what React's removeChildFromContainer does when a
    // portal unmounts. With the reparenting frame it threw NotFoundError.
    expect(() => document.body.removeChild(portal)).not.toThrow();
  });

  it('frames the page via attributes + a stylesheet, nothing else', () => {
    mountAppFrame({ canvas: '#f4f4f5', dir: 'ltr', pageBackground: '#fff' });

    expect(document.documentElement.hasAttribute(FRAME_ATTR)).toBe(true);
    expect(frameStyles()).toHaveLength(1);
    // No widget-created wrapper element in body
    expect(document.body.querySelector(`[${FRAME_ATTR}]`)).toBeNull();

    const css = frameStyles()[0]?.textContent ?? '';
    expect(css).toContain('contain: strict');
    expect(css).toContain('#f4f4f5');
  });

  it('mount is idempotent — a second mount adds nothing', () => {
    mountAppFrame({ canvas: '#f4f4f5', dir: 'ltr', pageBackground: '#fff' });
    mountAppFrame({ canvas: '#f4f4f5', dir: 'ltr', pageBackground: '#fff' });

    expect(frameStyles()).toHaveLength(1);
  });

  it('skips mounting when another widget instance already framed the page', () => {
    document.documentElement.setAttribute(FRAME_ATTR, '');

    mountAppFrame({ canvas: '#f4f4f5', dir: 'ltr', pageBackground: '#fff' });

    expect(frameStyles()).toHaveLength(0);
    document.documentElement.removeAttribute(FRAME_ATTR);
  });

  it('unmount removes every attribute, the stylesheet, and the width var', () => {
    mountAppFrame({ canvas: '#f4f4f5', dir: 'ltr', pageBackground: '#fff' });
    setFrameOpen(true);
    setFrameAnimated(false);
    setFrameWidth(420);

    unmountAppFrame();

    const html = document.documentElement;
    expect(html.hasAttribute(FRAME_ATTR)).toBe(false);
    expect(html.hasAttribute(OPEN_ATTR)).toBe(false);
    expect(html.hasAttribute(NO_ANIM_ATTR)).toBe(false);
    expect(html.style.getPropertyValue(WIDTH_VAR)).toBe('');
    expect(frameStyles()).toHaveLength(0);
  });

  it('unmount without a mount is a no-op', () => {
    expect(() => unmountAppFrame()).not.toThrow();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('restores the host scroll position on unmount', () => {
    mountAppFrame({ canvas: '#f4f4f5', dir: 'ltr', pageBackground: '#fff' });
    Object.defineProperty(document.body, 'scrollTop', {
      value: 320,
      writable: true,
      configurable: true,
    });

    unmountAppFrame();

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 320 });
    // jsdom shares the body across tests — drop the stubbed own property
    Reflect.deleteProperty(document.body, 'scrollTop');
  });

  it('open/width/anim toggles are attribute- and var-driven', () => {
    mountAppFrame({ canvas: '#f4f4f5', dir: 'ltr', pageBackground: '#fff' });
    const html = document.documentElement;

    setFrameOpen(true);
    expect(html.hasAttribute(OPEN_ATTR)).toBe(true);
    setFrameOpen(false);
    expect(html.hasAttribute(OPEN_ATTR)).toBe(false);

    setFrameWidth(480);
    expect(html.style.getPropertyValue(WIDTH_VAR)).toBe('480px');

    setFrameAnimated(false);
    expect(html.hasAttribute(NO_ANIM_ATTR)).toBe(true);
    setFrameAnimated(true);
    expect(html.hasAttribute(NO_ANIM_ATTR)).toBe(false);
  });

  it('clamps fixed host shells to the frame (vw shells shrink instead of x-overflow)', () => {
    // A dashboard-style viewport shell: fixed + w-screen/h-screen. Inside the
    // inset body its 100vw width used to force a horizontal scrollbar.
    const shell = document.createElement('main');
    shell.style.position = 'fixed';
    shell.style.width = '100vw';
    const inFlow = document.createElement('div');
    document.body.append(shell, inFlow);

    mountAppFrame({ canvas: '#f4f4f5', dir: 'ltr', pageBackground: '#fff' });

    expect(shell.hasAttribute('data-opencx-fixed-fit')).toBe(true);
    // In-flow content keeps its own overflow behavior (wide tables, code
    // blocks) — never stamped.
    expect(inFlow.hasAttribute('data-opencx-fixed-fit')).toBe(false);
    const css = frameStyles()[0]?.textContent ?? '';
    expect(css).toContain('[data-opencx-fixed-fit]');
    expect(css).toContain('max-width: 100% !important');
    expect(css).toContain('max-height: 100% !important');
  });

  it('stamps fixed elements the host adds while framed (SPA route change, portaled menus)', async () => {
    mountAppFrame({ canvas: '#f4f4f5', dir: 'ltr', pageBackground: '#fff' });

    // Directly-added fixed element, and one nested in a static wrapper.
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    const wrapper = document.createElement('div');
    const nestedShell = document.createElement('main');
    nestedShell.style.position = 'fixed';
    wrapper.appendChild(nestedShell);
    document.body.append(toast, wrapper);
    await new Promise((r) => setTimeout(r, 0));

    expect(toast.hasAttribute('data-opencx-fixed-fit')).toBe(true);
    expect(nestedShell.hasAttribute('data-opencx-fixed-fit')).toBe(true);
    expect(wrapper.hasAttribute('data-opencx-fixed-fit')).toBe(false);
  });

  it('unmount removes every fit stamp and stops observing', async () => {
    const shell = document.createElement('main');
    shell.style.position = 'fixed';
    document.body.appendChild(shell);
    mountAppFrame({ canvas: '#f4f4f5', dir: 'ltr', pageBackground: '#fff' });
    expect(shell.hasAttribute('data-opencx-fixed-fit')).toBe(true);

    unmountAppFrame();

    expect(shell.hasAttribute('data-opencx-fixed-fit')).toBe(false);
    const late = document.createElement('div');
    late.style.position = 'fixed';
    document.body.appendChild(late);
    await new Promise((r) => setTimeout(r, 0));
    expect(late.hasAttribute('data-opencx-fixed-fit')).toBe(false);
  });

  it('resolves the panel side from the widget dir, not the host dir', () => {
    mountAppFrame({ canvas: '#f4f4f5', dir: 'rtl', pageBackground: '#fff' });
    const rtlCss = frameStyles()[0]?.textContent ?? '';
    expect(rtlCss).toContain(`left: calc(var(${WIDTH_VAR}, 400px) + 32px)`);
    expect(rtlCss).toContain('right: 16px');
    unmountAppFrame();

    mountAppFrame({ canvas: '#f4f4f5', dir: 'ltr', pageBackground: '#fff' });
    const ltrCss = frameStyles()[0]?.textContent ?? '';
    expect(ltrCss).toContain(`right: calc(var(${WIDTH_VAR}, 400px) + 32px)`);
    expect(ltrCss).toContain('left: 16px');
  });
});
