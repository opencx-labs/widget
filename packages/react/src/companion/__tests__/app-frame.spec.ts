import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountAppFrame as mountAppFrameLease } from '../app-frame';

const FRAME_ATTR = 'data-opencx-app-frame';
const STYLE_SELECTOR = 'style[data-opencx-app-frame-style]';
const OPEN_ATTR = 'data-opencx-sidebar-open';
const NO_ANIM_ATTR = 'data-opencx-frame-no-anim';
const WIDTH_VAR = '--opencx-sidebar-w';

/** Every lease this test took; released together so owners never leak across tests. */
const leases: Array<ReturnType<typeof mountAppFrameLease>> = [];
function mountAppFrame(
  ...args: Parameters<typeof mountAppFrameLease>
): ReturnType<typeof mountAppFrameLease> {
  const lease = mountAppFrameLease(...args);
  leases.push(lease);
  return lease;
}
function releaseAll(): void {
  leases.splice(0).forEach((lease) => lease.release());
}

function frameStyles(): HTMLStyleElement[] {
  return Array.from(document.querySelectorAll(STYLE_SELECTOR));
}

describe('app-frame', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
  });

  afterEach(() => {
    releaseAll();
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

    mountAppFrame({ canvas: '#f4f4f5', side: 'right', pageBackground: '#fff' });

    expect(Array.from(document.body.children)).toEqual([appRoot, portal]);
    expect(appRoot.parentNode).toBe(document.body);
    expect(portal.parentNode).toBe(document.body);
  });

  it('lets the host framework remove its body-level portal while framed (the crash regression)', () => {
    const portal = document.createElement('div');
    document.body.appendChild(portal);

    mountAppFrame({ canvas: '#f4f4f5', side: 'right', pageBackground: '#fff' });

    // This exact call is what React's removeChildFromContainer does when a
    // portal unmounts. With the reparenting frame it threw NotFoundError.
    expect(() => document.body.removeChild(portal)).not.toThrow();
  });

  it('frames the page via attributes + a stylesheet, nothing else', () => {
    mountAppFrame({ canvas: '#f4f4f5', side: 'right', pageBackground: '#fff' });

    expect(document.documentElement.hasAttribute(FRAME_ATTR)).toBe(true);
    expect(frameStyles()).toHaveLength(1);
    // No widget-created wrapper element in body
    expect(document.body.querySelector(`[${FRAME_ATTR}]`)).toBeNull();

    const css = frameStyles()[0]?.textContent ?? '';
    expect(css).toContain('contain: strict');
    expect(css).toContain('#f4f4f5');
  });

  it('mount is idempotent — a second mount adds nothing', () => {
    mountAppFrame({ canvas: '#f4f4f5', side: 'right', pageBackground: '#fff' });
    mountAppFrame({ canvas: '#f4f4f5', side: 'right', pageBackground: '#fff' });

    expect(frameStyles()).toHaveLength(1);
  });

  it('keeps the shared frame mounted until every widget owner releases it', () => {
    const first = mountAppFrame({
      canvas: '#f4f4f5',
      side: 'right',
      pageBackground: '#fff',
    });
    const second = mountAppFrame({
      canvas: '#f4f4f5',
      side: 'right',
      pageBackground: '#fff',
    });

    first.release();
    expect(document.documentElement.hasAttribute(FRAME_ATTR)).toBe(true);
    expect(frameStyles()).toHaveLength(1);

    second.release();
    expect(document.documentElement.hasAttribute(FRAME_ATTR)).toBe(false);
    expect(frameStyles()).toHaveLength(0);
  });

  it('skips mounting when another widget instance already framed the page', () => {
    document.documentElement.setAttribute(FRAME_ATTR, '');

    mountAppFrame({ canvas: '#f4f4f5', side: 'right', pageBackground: '#fff' });

    expect(frameStyles()).toHaveLength(0);
    document.documentElement.removeAttribute(FRAME_ATTR);
  });

  it('unmount removes every attribute, the stylesheet, and the width var', () => {
    const frame = mountAppFrame({
      canvas: '#f4f4f5',
      side: 'right',
      pageBackground: '#fff',
    });
    frame.setOpen(true);
    frame.setAnimated(false);
    frame.setWidth(420);

    releaseAll();

    const html = document.documentElement;
    expect(html.hasAttribute(FRAME_ATTR)).toBe(false);
    expect(html.hasAttribute(OPEN_ATTR)).toBe(false);
    expect(html.hasAttribute(NO_ANIM_ATTR)).toBe(false);
    expect(html.style.getPropertyValue(WIDTH_VAR)).toBe('');
    expect(frameStyles()).toHaveLength(0);
  });

  it('releasing a lease twice is a no-op', () => {
    const frame = mountAppFrame({
      canvas: '#f4f4f5',
      side: 'right',
      pageBackground: '#fff',
    });
    frame.release();
    expect(() => frame.release()).not.toThrow();
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('restores the host scroll position on unmount', () => {
    mountAppFrame({ canvas: '#f4f4f5', side: 'right', pageBackground: '#fff' });
    Object.defineProperty(document.body, 'scrollTop', {
      value: 320,
      writable: true,
      configurable: true,
    });

    releaseAll();

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 320 });
    // jsdom shares the body across tests — drop the stubbed own property
    Reflect.deleteProperty(document.body, 'scrollTop');
  });

  it('open/width/anim toggles are attribute- and var-driven', () => {
    const frame = mountAppFrame({
      canvas: '#f4f4f5',
      side: 'right',
      pageBackground: '#fff',
    });
    const html = document.documentElement;

    frame.setOpen(true);
    expect(html.hasAttribute(OPEN_ATTR)).toBe(true);
    frame.setOpen(false);
    expect(html.hasAttribute(OPEN_ATTR)).toBe(false);

    frame.setWidth(480);
    expect(html.style.getPropertyValue(WIDTH_VAR)).toBe('480px');

    frame.setAnimated(false);
    expect(html.hasAttribute(NO_ANIM_ATTR)).toBe(true);
    frame.setAnimated(true);
    expect(html.hasAttribute(NO_ANIM_ATTR)).toBe(false);
  });

  it('isolates open, width, and animation state between two owners', () => {
    const first = mountAppFrame({
      canvas: '#eee',
      side: 'right',
      pageBackground: '#fff',
    });
    first.setWidth(380);
    first.setOpen(true);

    const second = mountAppFrame({
      canvas: '#111',
      side: 'left',
      pageBackground: '#000',
    });
    second.setWidth(520);
    second.setAnimated(false);
    second.setOpen(true);

    const html = document.documentElement;
    expect(html.hasAttribute(OPEN_ATTR)).toBe(true);
    expect(html.style.getPropertyValue(WIDTH_VAR)).toBe('520px');
    expect(html.hasAttribute(NO_ANIM_ATTR)).toBe(true);

    // Mutating the inactive owner cannot close, resize, or animate the active
    // owner's frame.
    first.setOpen(false);
    first.setWidth(320);
    first.setAnimated(true);
    expect(html.hasAttribute(OPEN_ATTR)).toBe(true);
    expect(html.style.getPropertyValue(WIDTH_VAR)).toBe('520px');
    expect(html.hasAttribute(NO_ANIM_ATTR)).toBe(true);

    // Releasing the active owner falls back to the remaining owner's state.
    second.release();
    expect(html.hasAttribute(OPEN_ATTR)).toBe(false);
    expect(html.style.getPropertyValue(WIDTH_VAR)).toBe('320px');
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

    mountAppFrame({ canvas: '#f4f4f5', side: 'right', pageBackground: '#fff' });

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
    mountAppFrame({ canvas: '#f4f4f5', side: 'right', pageBackground: '#fff' });

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
    mountAppFrame({ canvas: '#f4f4f5', side: 'right', pageBackground: '#fff' });
    expect(shell.hasAttribute('data-opencx-fixed-fit')).toBe(true);

    releaseAll();

    expect(shell.hasAttribute('data-opencx-fixed-fit')).toBe(false);
    const late = document.createElement('div');
    late.style.position = 'fixed';
    document.body.appendChild(late);
    await new Promise((r) => setTimeout(r, 0));
    expect(late.hasAttribute('data-opencx-fixed-fit')).toBe(false);
  });

  it('insets the page on the physical side the panel occupies', () => {
    mountAppFrame({ canvas: '#f4f4f5', side: 'left', pageBackground: '#fff' });
    const leftCss = frameStyles()[0]?.textContent ?? '';
    expect(leftCss).toContain(`left: calc(var(${WIDTH_VAR}, 400px) + 32px)`);
    expect(leftCss).toContain('right: 16px');
    releaseAll();

    mountAppFrame({ canvas: '#f4f4f5', side: 'right', pageBackground: '#fff' });
    const rightCss = frameStyles()[0]?.textContent ?? '';
    expect(rightCss).toContain(`right: calc(var(${WIDTH_VAR}, 400px) + 32px)`);
    expect(rightCss).toContain('left: 16px');
  });
});
