import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WidgetConfig } from '@opencx/widget-core';
import { UnreadBadge, useUnreadLabel } from '../components/UnreadBadge';
import { WidgetPopoverTrigger } from '../WidgetPopoverTrigger';

const config: { current: WidgetConfig } = { current: { token: '' } };
const unread = { count: 0 };
vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => config.current,
  useUnread: () => ({
    count: unread.count,
    hasUnread: unread.count > 0,
    unreadSessionIds: [],
    isUnread: () => false,
  }),
  useWidgetTrigger: () => ({ isOpen: false, setIsOpen: vi.fn() }),
  useDocumentDir: () => ({ dir: 'ltr' }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('unread indicator', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    config.current = { token: '' };
    unread.count = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
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
