import * as PopoverPrimitive from '@radix-ui/react-popover';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WidgetConfig } from '@opencx/widget-core';
import { UnreadBadge, useUnreadLabel } from '../components/UnreadBadge';
import { WidgetPopoverTrigger } from '../WidgetPopoverTrigger';

const config: { current: WidgetConfig } = { current: { token: '' } };
const unread = { count: 0 };
const host = { dir: 'ltr' };
vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => config.current,
  useUnread: () => ({
    count: unread.count,
    hasUnread: unread.count > 0,
    unreadSessionIds: [],
    isUnread: () => false,
  }),
  useWidgetTrigger: () => ({ isOpen: false, setIsOpen: vi.fn() }),
  useDocumentDir: () => ({ dir: host.dir }),
  // The launcher frame mounts the dialog host, which only wants this ref.
  useWidget: () => ({ contentIframeRef: { current: null } }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('unread indicator', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    config.current = { token: '' };
    unread.count = 0;
    host.dir = 'ltr';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const badge = () =>
    container.querySelector<HTMLElement>('[data-component="trigger/unread"]');

  let label: string | null | undefined;
  function LabelProbe({ count }: { count: number }) {
    label = useUnreadLabel(count);
    return null;
  }

  it('shows a plain dot by default, the number on request, and nothing when turned off or at zero', () => {
    act(() => root.render(<UnreadBadge count={0} />));
    expect(badge()).toBeNull();

    act(() => root.render(<UnreadBadge count={3} />));
    expect(badge()?.textContent).toBe('');
    expect(badge()?.getAttribute('aria-hidden')).toBe('true');
    expect(badge()?.getAttribute('data-unread-look')).toBe('dot');

    config.current = { token: '', unreadIndicator: 'count' };
    act(() => root.render(<UnreadBadge count={120} key="count" />));
    expect(badge()?.textContent).toBe('99+');
    expect(badge()?.getAttribute('data-unread-look')).toBe('count');

    config.current = { token: '', unreadIndicator: false };
    act(() => root.render(<UnreadBadge count={3} key="off" />));
    expect(badge()).toBeNull();
  });

  it('names the count for the control that carries the mark, unless the mark is off', () => {
    act(() => root.render(<LabelProbe count={3} />));
    expect(label).toBe('3 unread');

    act(() => root.render(<LabelProbe count={0} />));
    expect(label).toBeNull();

    config.current = { token: '', unreadIndicator: false };
    act(() => root.render(<LabelProbe count={3} key="off" />));
    expect(label).toBeNull();
  });

  it("sits on the launcher's docked side, whatever the widget language", async () => {
    // jsdom swaps an iframe's contentDocument asynchronously; give the
    // launcher frame one stable document so the portal lands where we look.
    const docs = new WeakMap<HTMLIFrameElement, Document>();
    vi.spyOn(
      HTMLIFrameElement.prototype,
      'contentDocument',
      'get',
    ).mockImplementation(function contentDocument(this: HTMLIFrameElement) {
      let doc = docs.get(this);
      if (!doc) {
        doc = document.implementation.createHTMLDocument('');
        docs.set(this, doc);
      }
      return doc;
    });
    const mark = () =>
      container
        .querySelector('iframe')
        ?.contentDocument?.querySelector<HTMLElement>(
          '[data-component="trigger/unread"]',
        );
    const show = async (key: string) => {
      await act(async () =>
        root.render(
          <PopoverPrimitive.Root key={key}>
            <WidgetPopoverTrigger />
          </PopoverPrimitive.Root>,
        ),
      );
      // The frame library portals the launcher only once the frame reports
      // load, which jsdom raises asynchronously; raise it inside act.
      await act(async () => {
        container.querySelector('iframe')?.dispatchEvent(new Event('load'));
      });
    };
    unread.count = 1;

    // An Arabic widget on an LTR page: the frame is RTL, the launcher is still
    // on the right, so the mark must not slide to the inner (left) corner.
    config.current = { token: '', language: 'ar' };
    await show('ar-on-ltr');
    expect(mark()?.style.right).toMatch(/px$/);
    expect(mark()?.style.left).toBe('');

    host.dir = 'rtl';
    await show('ar-on-rtl');
    expect(mark()?.style.left).toMatch(/px$/);
    expect(mark()?.style.right).toBe('');

    // An explicit offset pins the side regardless of the page direction.
    host.dir = 'ltr';
    config.current = {
      token: '',
      theme: { widgetTrigger: { offset: { left: 20 } } },
    };
    await show('pinned-left');
    expect(mark()?.style.left).toMatch(/px$/);
    expect(mark()?.style.right).toBe('');
  });

  it('hands the unread count to an embedder-supplied launcher', () => {
    const widgetTrigger = vi.fn(() => null);
    config.current = { token: '', customComponents: { widgetTrigger } };
    unread.count = 2;
    act(() => root.render(<WidgetPopoverTrigger />));
    expect(widgetTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ isOpen: false, unreadCount: 2 }),
    );
  });
});
