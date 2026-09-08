import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const selectChat = vi.fn();
const newChat = vi.fn();
const closeChat = vi.fn();
let canCreate = true;
let secondIsDraft = false;
const chats = [
  {
    id: 1,
    title: 'Payments',
    hasSession: true,
    working: true,
    ctx: {
      messageCtx: {
        draftState: { get: () => ({ text: '', mentions: [] }) },
        state: { get: () => ({ messages: [] }) },
      },
      sessionCtx: {
        sessionState: {
          get: () => ({
            session: {
              id: 'open',
              isOpened: true,
              title: null,
              lastMessage: 'Please check this payment.',
            },
          }),
        },
      },
    },
  },
  {
    id: 2,
    title: '',
    hasSession: true,
    working: false,
    ctx: {
      messageCtx: {
        draftState: { get: () => ({ text: '', mentions: [] }) },
        state: { get: () => ({ messages: [] }) },
      },
      sessionCtx: {
        sessionState: {
          get: () => ({
            session: !secondIsDraft
              ? { id: 'second', title: null, lastMessage: null, isOpened: true }
              : null,
          }),
        },
      },
    },
  },
];
vi.mock('@opencx/widget-react-headless', () => ({
  useCompanionChats: () => ({
    chats,
    openChats: chats.filter((chat) => chat.hasSession || chat.working),
    activeId: 2,
    selectChat,
    newChat,
    closeChat,
  }),
  usePrimitiveState: (state: { get: () => unknown }) => state.get(),
  useSessions: () => ({ canCreateNewSession: canCreate }),
}));
vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    dir: 'ltr',
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key} ${params.title ?? params.count}` : key,
  }),
}));
vi.mock('../../hooks/useCanHover', () => ({ useCanHover: () => true }));
vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    cssVars: {},
    theme: { widgetContentContainer: { zIndex: 1000 } },
  }),
}));
import { ChatPicker } from '../ChatPicker';
import { SessionCircles } from '../SessionCircles';
import { ConversationTitle } from '../ConversationTitle';
import { RestingPill } from '../RestingPill';
import { useChatPicker } from '../useChatPicker';

describe('compact chat picker', () => {
  let host: HTMLDivElement;
  let anchor: HTMLButtonElement;
  let root: Root;
  const close = vi.fn();
  const selected = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    canCreate = true;
    chats.splice(2);
    host = document.createElement('div');
    anchor = document.createElement('button');
    anchor.textContent = 'Open 2 chats';
    document.body.append(anchor, host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    anchor.remove();
    vi.unstubAllGlobals();
  });
  function renderPicker() {
    act(() =>
      root.render(
        <ChatPicker
          picker={{
            anchor,
            open: true,
            animate: false,
            autoFocus: true,
            close,
            enter: vi.fn(),
            leave: vi.fn(),
            toggle: vi.fn(),
            hover: vi.fn(),
          }}
          placement="above"
          portalTarget={host}
          onSelected={selected}
        />,
      ),
    );
  }
  it('switches directly from a compact menu and focuses the selected conversation', () => {
    renderPicker();
    const current = host.querySelector<HTMLButtonElement>(
      '[aria-checked="true"]',
    )!;
    expect(document.activeElement).toBe(current);
    expect(current.textContent).toContain('companion_chat_number 2');
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      'companion_working_chats 1',
    );
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    act(() =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Payments — companion_working"]',
        )!
        .click(),
    );
    expect(selectChat).toHaveBeenCalledWith(1);
    expect(close).toHaveBeenCalledOnce();
    expect(selected).toHaveBeenCalledOnce();
  });
  it('closes a background session without selecting it or dismissing the picker', () => {
    renderPicker();
    const button = host.querySelector<HTMLButtonElement>(
      '[data-chat-close="1"]',
    )!;
    expect(button.getAttribute('aria-label')).toBe(
      'companion_close_chat Payments',
    );
    expect(host.querySelector('[data-chat-select][title]')).toBeNull();
    act(() => button.click());
    expect(closeChat).toHaveBeenCalledWith(1);
    expect(selectChat).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      host.querySelector('[data-chat-select="2"]'),
    );
  });
  it('dismisses the picker when closing the visible session', () => {
    renderPicker();
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-chat-close="2"]')!.click(),
    );
    expect(closeChat).toHaveBeenCalledWith(2);
    expect(close).toHaveBeenCalledWith(true);
    expect(selected).toHaveBeenCalledOnce();
  });
  it('starts a conversation directly and respects the single-session restriction', () => {
    renderPicker();
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-new-chat]')!.click(),
    );
    expect(newChat).toHaveBeenCalledOnce();
    canCreate = false;
    renderPicker();
    expect(
      host.querySelector<HTMLButtonElement>('[data-new-chat]')!.disabled,
    ).toBe(true);
  });
  it('supports arrow navigation, Escape and outside-click dismissal', async () => {
    renderPicker();
    const menu = host.querySelector('[role="menu"]')!;
    act(() =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      ),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(
      host.querySelector('[data-chat-close="2"]'),
    );
    act(() =>
      menu.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(close).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(anchor);
    act(() =>
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })),
    );
    expect(close).toHaveBeenCalledTimes(2);
  });
  it('previews on hover without stealing focus and stays open while entering the menu', () => {
    vi.useFakeTimers();
    function Harness() {
      const picker = useChatPicker();
      return (
        <>
          <textarea />
          <button
            data-trigger=""
            onPointerEnter={(event) => picker.hover(event.currentTarget)}
            onPointerLeave={picker.leave}
            onClick={(event) => picker.toggle(event.currentTarget)}
          >
            Sessions
          </button>
          {picker.anchor && (
            <ChatPicker
              placement="above"
              picker={picker}
              portalTarget={host}
              onSelected={() => {}}
            />
          )}
        </>
      );
    }
    try {
      act(() => root.render(<Harness />));
      const input = host.querySelector('textarea')!;
      const trigger = host.querySelector<HTMLButtonElement>('[data-trigger]')!;
      act(() => input.focus());
      act(() =>
        trigger.dispatchEvent(new Event('pointerover', { bubbles: true })),
      );
      act(() => vi.advanceTimersByTime(150));
      const menu = host.querySelector('[role="menu"]')!;
      expect(menu).not.toBeNull();
      expect(document.activeElement).toBe(input);
      act(() =>
        trigger.dispatchEvent(new Event('pointerout', { bubbles: true })),
      );
      act(() =>
        menu.dispatchEvent(new Event('pointerover', { bubbles: true })),
      );
      act(() => vi.advanceTimersByTime(300));
      expect(host.querySelector('[role="menu"]')).not.toBeNull();
      act(() => trigger.click());
      expect(document.activeElement).toBe(
        host.querySelector('[aria-checked="true"]'),
      );
    } finally {
      vi.useRealTimers();
    }
  });
  it('keeps hover open while restoring focus into the composer iframe', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const input = frame.contentDocument!.createElement('textarea');
    frame.contentDocument!.body.append(anchor, input);
    try {
      act(() => input.focus());
      // Browsers blur the host window when focus moves into its iframe.
      // jsdom omits that event, so reproduce it when Radix restores the input.
      input.addEventListener('focus', () =>
        window.dispatchEvent(new Event('blur')),
      );
      act(() =>
        root.render(
          <ChatPicker
            picker={{
              anchor,
              open: true,
              animate: false,
              autoFocus: false,
              close,
              enter: vi.fn(),
              leave: vi.fn(),
              toggle: vi.fn(),
              hover: vi.fn(),
            }}
            placement="above"
            portalTarget={host}
            onSelected={selected}
          />,
        ),
      );
      expect(host.querySelector('[role="menu"]')).not.toBeNull();
      expect(frame.contentDocument!.activeElement).toBe(input);
      expect(close).not.toHaveBeenCalled();
      act(() =>
        frame.contentDocument!.body.dispatchEvent(
          new Event('pointerdown', { bubbles: true }),
        ),
      );
      expect(close).toHaveBeenCalledOnce();
    } finally {
      act(() => root.render(null));
      document.body.append(anchor);
      frame.remove();
    }
  });
  it('retargets a pointer exit on re-entry and removes keyboard dismissals immediately', () => {
    vi.useFakeTimers();
    function Harness() {
      const picker = useChatPicker();
      return (
        <>
          <button
            data-trigger=""
            onClick={(event) =>
              picker.toggle(event.currentTarget, event.detail > 0)
            }
            aria-expanded={picker.open}
          >
            Sessions
          </button>
          {picker.anchor && (
            <ChatPicker
              placement="above"
              picker={picker}
              portalTarget={host}
              onSelected={() => {}}
            />
          )}
        </>
      );
    }
    try {
      act(() => root.render(<Harness />));
      const trigger = host.querySelector<HTMLButtonElement>('[data-trigger]')!;
      const click = () =>
        act(() =>
          trigger.dispatchEvent(
            new MouseEvent('click', { bubbles: true, detail: 1 }),
          ),
        );
      click();
      const menu = host.querySelector<HTMLElement>('[role="menu"]')!;
      expect(menu.dataset.motion).toBe('pointer');
      click();
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(menu.dataset.state).toBe('closed');
      expect(menu.hasAttribute('inert')).toBe(true);
      act(() => vi.advanceTimersByTime(75));
      click();
      const reopened = host.querySelector<HTMLElement>('[role="menu"]')!;
      expect(reopened.dataset.state).toBe('open');
      expect(reopened.hasAttribute('inert')).toBe(false);
      act(() => vi.advanceTimersByTime(150));
      expect(host.querySelector('[role="menu"]')).toBe(reopened);
      act(() =>
        reopened.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
      expect(host.querySelector('[role="menu"]')).toBeNull();
      act(() => trigger.click());
      expect(
        host.querySelector<HTMLElement>('[role="menu"]')!.dataset.motion,
      ).toBe('instant');
    } finally {
      vi.useRealTimers();
    }
  });
  it('switches from individual circles and shows which session is working', () => {
    const resume = vi.fn();
    act(() =>
      root.render(
        <div onClick={resume}>
          <RestingPill
            visible
            docked
            label="Ask Payla…"
            icon={undefined}
            pillBackground="black"
            dir="ltr"
            measureRef={() => {}}
            sessions={<SessionCircles onSelected={selected} />}
          />
        </div>,
      ),
    );
    const first = host.querySelector<HTMLButtonElement>(
      '[data-session-circle="1"]',
    )!;
    expect(first.getAttribute('aria-label')).toBe('Payments — thinking');
    expect(first.querySelector('[data-session-working]')).not.toBeNull();
    expect(
      host
        .querySelector('[data-session-circle="2"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    act(() => first.click());
    expect(selectChat).toHaveBeenCalledWith(1);
    expect(selected).toHaveBeenCalledOnce();
    expect(resume).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Ask Payla…');
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-new-session]')!.click(),
    );
    expect(newChat).toHaveBeenCalledOnce();
  });
  it('closes a collapsed circle without opening the panel or starting a drag', () => {
    const resume = vi.fn();
    const drag = vi.fn();
    act(() =>
      root.render(
        <div onClick={resume} onPointerDown={drag}>
          <SessionCircles onSelected={selected} />
        </div>,
      ),
    );
    const button = host.querySelector<HTMLButtonElement>(
      '[data-session-close="1"]',
    )!;
    expect(button.getAttribute('aria-label')).toBe(
      'companion_close_chat Payments',
    );
    expect(
      button.closest('button')?.parentElement?.closest('button'),
    ).toBeNull();
    act(() => {
      button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      button.click();
    });
    expect(closeChat).toHaveBeenCalledWith(1);
    expect(selectChat).not.toHaveBeenCalled();
    expect(selected).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
    expect(drag).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      host.querySelector('[data-session-circle="2"]'),
    );
  });
  it('moves focus to new conversation when closing the last collapsed circle', () => {
    const second = chats.pop()!;
    const lastClosed = vi.fn();
    try {
      act(() =>
        root.render(
          <SessionCircles onSelected={selected} onLastClosed={lastClosed} />,
        ),
      );
      act(() =>
        host
          .querySelector<HTMLButtonElement>('[data-session-close="1"]')!
          .click(),
      );
      expect(closeChat).toHaveBeenCalledWith(1);
      expect(lastClosed).toHaveBeenCalledOnce();
      expect(document.activeElement).toBe(
        host.querySelector('[data-new-session]'),
      );
      expect(selected).not.toHaveBeenCalled();
      act(() => root.render(<SessionCircles interactive={false} />));
      expect(
        host
          .querySelector('[data-session-close="1"]')
          ?.getAttribute('tabindex'),
      ).toBe('-1');
    } finally {
      chats.push(second);
    }
  });
  it('keeps the selected circle visible and exposes overflow without losing status', () => {
    chats.unshift(
      { ...chats[0]!, id: 3, title: 'Orders' },
      { ...chats[0]!, id: 4, title: 'Refunds' },
    );
    try {
      act(() => root.render(<SessionCircles />));
      expect(host.querySelectorAll('[data-session-circle]')).toHaveLength(2);
      expect(host.querySelector('[data-session-circle="2"]')).not.toBeNull();
      const more = host.querySelector<HTMLButtonElement>(
        '[aria-haspopup="menu"]',
      )!;
      expect(more.textContent).toBe('+2');
      expect(more.querySelector('[data-session-working]')).not.toBeNull();
      act(() => more.click());
      expect(document.querySelectorAll('[role="menuitemradio"]')).toHaveLength(
        4,
      );
    } finally {
      chats.splice(0, 2);
    }
  });
  it('opens a compact named switcher with accessible previews and viewing status', () => {
    act(() => root.render(<ConversationTitle />));
    const title = host.querySelector<HTMLButtonElement>(
      '[data-companion-conversation-title]',
    )!;
    expect(title.textContent).toContain('companion_chat_number 2');
    const otherSessions = title.querySelector('[data-other-session-count]')!;
    expect(otherSessions.textContent).toContain('+1');
    expect(otherSessions.textContent).toContain(
      'companion_other_sessions 1 · companion_working_chats 1',
    );
    expect(title.querySelector('[title]')).toBeNull();
    expect(title.hasAttribute('title')).toBe(false);
    expect(
      otherSessions.querySelector('[data-other-sessions-working]'),
    ).not.toBeNull();
    act(() => title.click());
    const menu = document.querySelector('[data-companion-chat-picker]')!;
    const current = menu.querySelector('[aria-checked="true"]')!;
    expect(current.getAttribute('aria-label')).toContain('companion_viewing');
    expect(current.getAttribute('aria-label')).toContain('companion_open');
    const working = menu.querySelector<HTMLButtonElement>(
      '[aria-label="Payments — companion_working"]',
    )!;
    expect(working.getAttribute('aria-description')).toBe(
      'Please check this payment.',
    );
    expect(working.getAttribute('aria-label')).not.toContain(
      'companion_viewing',
    );
    act(() => working.click());
    expect(selectChat).toHaveBeenCalledWith(1);
    expect(document.querySelector('[data-companion-chat-picker]')).toBeNull();
    expect(title.getAttribute('aria-expanded')).toBe('false');
  });
  it('includes the current draft so viewing never points to a different open chat', () => {
    chats[1]!.hasSession = false;
    secondIsDraft = true;
    try {
      renderPicker();
      const draft = host.querySelector('[aria-checked="true"]')!;
      expect(draft.getAttribute('aria-label')).toContain('companion_draft');
      expect(draft.getAttribute('aria-label')).toContain('companion_viewing');
    } finally {
      chats[1]!.hasSession = true;
      secondIsDraft = false;
    }
  });
  it('keeps an independent picker target for the icon-only launcher', () => {
    const resume = vi.fn();
    const openChats = vi.fn();
    act(() =>
      root.render(
        <div onClick={resume}>
          <RestingPill
            visible
            docked={false}
            label="Ask Payla…"
            icon={undefined}
            pillBackground="black"
            dir="ltr"
            measureRef={() => {}}
            activeCount={2}
            countLabel="Open 2 chats"
            onOpenChats={openChats}
          />
        </div>,
      ),
    );
    const count = host.querySelector<HTMLButtonElement>(
      '[aria-label="Open 2 chats"]',
    )!;
    expect(count.getAttribute('aria-haspopup')).toBe('menu');
    act(() => count.click());
    expect(openChats).toHaveBeenCalledWith(count, false);
    expect(resume).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Ask Payla…');
  });
});
