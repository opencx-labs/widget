import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PrimitiveState,
  UnreadCtx,
  WidgetCtx,
  type SessionDto,
  type SessionsState,
  type WidgetConfig,
} from '@opencx/widget-core';
import { WidgetProvider } from '../../WidgetProvider';
import type { WidgetComponentType } from '../../types/components';
import { WidgetTriggerProvider, useWidgetTrigger } from '../useWidgetTrigger';
import { useUnread } from '../useUnread';
import { useUnreadViewing } from '../useUnreadViewing';

const TEST_COMPONENTS: WidgetComponentType[] = [
  { key: 'fallback', component: () => null },
];

vi.mock('../../agent-chat/AgentChatContext', () => ({
  AgentChatProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function buildSession(overrides: Partial<SessionDto> = {}): SessionDto {
  return {
    id: 'a',
    ticketNumber: 1,
    title: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isHandedOff: false,
    isOpened: true,
    assignee: { kind: 'ai', name: null, avatarUrl: null },
    channel: 'web',
    isVerified: false,
    lastMessage: 'Hi',
    unread: false,
    modeId: null,
    latestStateCheckpointPayload: null,
    sessionAttributes: {},
    customStatus: null,
    ...overrides,
  };
}

/** The pieces the two hooks read, backed by a real UnreadCtx. */
function fakeCtx(config: WidgetConfig) {
  const sessionsState = new PrimitiveState<SessionsState>({
    data: [],
    cursor: undefined,
    isLastPage: false,
    didStartInitialFetch: true,
    isInitialFetchLoading: false,
    didLoadFirstPage: true,
  });
  const sessionState = new PrimitiveState<{
    session: SessionDto | null;
    isCreatingSession: boolean;
    isResolvingSession: boolean;
  }>({ session: null, isCreatingSession: false, isResolvingSession: false });
  const routerState = new PrimitiveState<{
    screen: 'welcome' | 'sessions' | 'chat';
  }>({ screen: 'sessions' });
  const messageState = new PrimitiveState<{ isInitialFetchLoading: boolean }>({
    isInitialFetchLoading: false,
  });
  const markSessionRead = vi.fn(
    async ({ sessionId }: { sessionId: string }) => {
      const row = sessionsState.get().data.find((s) => s.id === sessionId);
      return { data: row ? { ...row, unread: false } : undefined };
    },
  );
  const unreadCtx = new UnreadCtx({
    config,
    api: { markSessionRead },
    sessionsState,
    setSessions: (rows) =>
      sessionsState.setPartial({
        data: [...rows, ...sessionsState.get().data].filter(
          (s, i, self) => i === self.findIndex((_s) => s.id === _s.id),
        ),
      }),
  });
  const ctx: WidgetCtx = Object.create(WidgetCtx.prototype);
  Object.assign(ctx, {
    api: { setAuthToken: vi.fn() },
    dispose: vi.fn(),
    unreadCtx,
    sessionCtx: { sessionState, sessionsState },
    routerCtx: { state: routerState },
    messageCtx: { state: messageState },
  });
  return {
    ctx,
    unreadCtx,
    sessionsState,
    sessionState,
    routerState,
    messageState,
    markSessionRead,
  };
}

let unread: ReturnType<typeof useUnread> | null = null;
let setOpen: ((open: boolean) => void) | null = null;
let transcriptVisible = true;
function Probe() {
  unread = useUnread();
  setOpen = useWidgetTrigger().setIsOpen;
  useUnreadViewing({ transcriptVisible });
  return null;
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

const settle = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe('unread hooks', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    unread = null;
    setOpen = null;
    transcriptVisible = true;
    setVisibility('visible');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const tree = (config: WidgetConfig) => (
    <WidgetProvider options={config} components={TEST_COMPONENTS}>
      <WidgetTriggerProvider>
        <Probe />
      </WidgetTriggerProvider>
    </WidgetProvider>
  );

  async function mount(config: WidgetConfig) {
    const fake = fakeCtx(config);
    vi.spyOn(WidgetCtx, 'initialize').mockResolvedValue(fake.ctx);
    await act(async () => root.render(tree(config)));
    return fake;
  }

  it('exposes the flagged sessions and reports one as read only while its chat is open and visible', async () => {
    const { sessionsState, sessionState, routerState, markSessionRead } =
      await mount({
        token: '',
      });
    const a = buildSession({ id: 'a', unread: true });
    const b = buildSession({ id: 'b' });
    act(() => sessionsState.setPartial({ data: [a, b] }));
    expect(unread?.count).toBe(1);
    expect(unread?.hasUnread).toBe(true);
    expect(unread?.isUnread('a')).toBe(true);
    expect(unread?.isUnread('b')).toBe(false);

    // Widget closed: being "in" the chat does not count as seeing it.
    act(() => {
      sessionState.setPartial({ session: a });
      routerState.setPartial({ screen: 'chat' });
    });
    await settle();
    expect(markSessionRead).not.toHaveBeenCalled();
    expect(unread?.count).toBe(1);

    act(() => setOpen?.(true));
    await settle();
    expect(markSessionRead).toHaveBeenCalledExactlyOnceWith({ sessionId: 'a' });
    expect(unread?.count).toBe(0);

    // Hidden tab: a new reply is news again and is not reported.
    act(() => setVisibility('hidden'));
    act(() => sessionsState.setPartial({ data: [{ ...a, unread: true }, b] }));
    await settle();
    expect(markSessionRead).toHaveBeenCalledTimes(1);
    expect(unread?.count).toBe(1);

    act(() => setVisibility('visible'));
    await settle();
    expect(markSessionRead).toHaveBeenCalledTimes(2);
    expect(unread?.count).toBe(0);
  });

  it('reports a session only once its transcript is loaded and the shell shows it', async () => {
    const config: WidgetConfig = { token: '' };
    const {
      sessionsState,
      sessionState,
      routerState,
      messageState,
      markSessionRead,
    } = await mount(config);
    const a = buildSession({ id: 'a', unread: true });
    act(() => {
      sessionsState.setPartial({ data: [a] });
      sessionState.setPartial({ session: a });
      routerState.setPartial({ screen: 'chat' });
      messageState.setPartial({ isInitialFetchLoading: true });
      setOpen?.(true);
    });
    await settle();
    expect(markSessionRead).not.toHaveBeenCalled();
    expect(unread?.count).toBe(1);

    act(() => messageState.setPartial({ isInitialFetchLoading: false }));
    await settle();
    expect(markSessionRead).toHaveBeenCalledExactlyOnceWith({ sessionId: 'a' });
    expect(unread?.count).toBe(0);

    // The shell hides the transcript (the companion's input bar): a reply
    // that lands now is not seen.
    transcriptVisible = false;
    await act(async () => root.render(tree(config)));
    act(() =>
      sessionsState.setPartial({
        data: [{ ...a, unread: true, lastMessage: 'Second reply' }],
      }),
    );
    await settle();
    expect(markSessionRead).toHaveBeenCalledTimes(1);
    expect(unread?.count).toBe(1);

    transcriptVisible = true;
    await act(async () => root.render(tree(config)));
    await settle();
    expect(markSessionRead).toHaveBeenCalledTimes(2);
    expect(unread?.count).toBe(0);
  });

  it('does not report a session while the widget shows the sessions list', async () => {
    const { sessionsState, sessionState, routerState, markSessionRead } =
      await mount({
        token: '',
      });
    const a = buildSession({ id: 'a', unread: true });
    act(() => sessionsState.setPartial({ data: [a] }));
    act(() => {
      sessionState.setPartial({ session: a });
      setOpen?.(true);
    });
    await settle();
    expect(routerState.get().screen).toBe('sessions');
    expect(markSessionRead).not.toHaveBeenCalled();
    expect(unread?.count).toBe(1);

    act(() => routerState.setPartial({ screen: 'chat' }));
    await settle();
    expect(markSessionRead).toHaveBeenCalledExactlyOnceWith({ sessionId: 'a' });
    expect(unread?.count).toBe(0);
  });
});
