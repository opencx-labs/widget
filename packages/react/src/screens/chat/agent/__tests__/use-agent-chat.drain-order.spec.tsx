import type { SendMessageInput, WidgetUserMessage } from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * Regression: transcript order is APPEND order, and the post-turn reconcile
 * (polling merge) appends the finished reply's canonical row. If the queue
 * drains before that row lands, the next queued user bubble is appended FIRST
 * and renders ABOVE the reply to the previous message:
 *
 *   hey / amazing day / reply-to-hey        ← bug
 *   hey / reply-to-hey / amazing day        ← correct
 *
 * So the drain must hold until `reconcileAfterStream` resolves.
 */

type ChatState = {
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: unknown[];
};

const sendMessageSpy = vi.fn();
const stopSpy = vi.fn();
let setChatState: (next: ChatState) => void = () => {};

vi.mock('@ai-sdk/react', () => ({
  useChat: () => {
    const [state, setState] = React.useState<ChatState>({
      status: 'ready',
      messages: [],
    });
    setChatState = setState;
    return { ...state, sendMessage: sendMessageSpy, stop: stopSpy };
  },
}));

/** Ordered log of every transcript-affecting call — the assertion target. */
const callOrder: string[] = [];

function buildUserMessage(content: string): WidgetUserMessage {
  return {
    id: `msg-${content}`,
    type: 'USER',
    content,
    timestamp: new Date().toISOString(),
    deliveredAt: null,
    pending: true,
  };
}

let resolveReconcile: () => void = () => {};

const fakeMessageCtx = {
  beginAgentTurn: vi.fn(async (input: SendMessageInput) => ({
    sessionId: 'sess-1',
    userMessage: buildUserMessage(input.content),
  })),
  buildQueuedUserMessage: vi.fn((input: SendMessageInput) => ({
    sessionId: 'sess-1',
    userMessage: buildUserMessage(input.content),
  })),
  appendUserMessageIfAbsent: vi.fn((m: WidgetUserMessage) => {
    callOrder.push(`append:${m.content}`);
  }),
  markUserMessagesDelivered: vi.fn(),
  reconcileAfterStream: vi.fn(() => {
    callOrder.push('reconcile:start');
    return new Promise<void>((resolve) => {
      resolveReconcile = () => {
        callOrder.push('reconcile:done');
        resolve();
      };
    });
  }),
  registerAgentHandlers: vi.fn(),
  unregisterAgentHandlers: vi.fn(),
};

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({ token: 't' }),
  useMessages: () => ({ messagesState: { messages: [] } }),
  useSessions: () => ({ sessionState: { session: { id: 'sess-1' } } }),
  useWidget: () => ({
    widgetCtx: {
      api: {
        getStreamTransportOptions: () => ({
          api: 'http://test/chat',
          reconnectApi: (id: string) => `http://test/chat/${id}`,
          headers: {},
        }),
        stopStream: vi.fn(async () => {}),
      },
      messageCtx: fakeMessageCtx,
    },
  }),
}));

import { useAgentChat } from '../useAgentChat';

let hookValue: ReturnType<typeof useAgentChat> | null = null;

function Probe() {
  hookValue = useAgentChat();
  return null;
}

describe('useAgentChat drain ordering', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;
    sendMessageSpy.mockImplementation((_msg: unknown, opts: { body: { content: string } }) => {
      callOrder.push(`send:${opts.body.content}`);
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('holds the queued message until the finished reply is reconciled into the transcript', async () => {
    await act(async () => {
      root.render(<Probe />);
    });
    if (!hookValue) throw new Error('hook did not render');

    // Turn 1: sent from ready state — streams immediately.
    await act(async () => {
      await hookValue?.send({ content: 'hey' });
    });
    expect(callOrder).toEqual(['append:hey', 'send:hey']);

    // Turn 1 starts streaming; the user multi-sends mid-turn.
    await act(async () => {
      setChatState({ status: 'streaming', messages: [] });
    });
    await act(async () => {
      await hookValue?.send({ content: 'amazing day' });
    });
    // Queued — NOT appended, NOT sent.
    expect(hookValue.queuedUserMessages.map((m) => m.content)).toEqual(['amazing day']);
    expect(callOrder).toEqual(['append:hey', 'send:hey']);

    // Turn 1 finishes. Reconcile starts; while it's in flight the queued
    // message must stay held (appending it now would place it ABOVE reply 1).
    await act(async () => {
      setChatState({ status: 'ready', messages: [] });
    });
    expect(callOrder).toEqual(['append:hey', 'send:hey', 'reconcile:start']);
    expect(fakeMessageCtx.appendUserMessageIfAbsent).toHaveBeenCalledTimes(1);

    // Reply 1's canonical row lands → the queue drains, in order.
    await act(async () => {
      resolveReconcile();
    });
    expect(callOrder).toEqual([
      'append:hey',
      'send:hey',
      'reconcile:start',
      'reconcile:done',
      'append:amazing day',
      'send:amazing day',
    ]);
    expect(hookValue.queuedUserMessages).toEqual([]);
  });

  it('a message sent DURING the reconcile window is queued, not streamed over it', async () => {
    await act(async () => {
      root.render(<Probe />);
    });
    if (!hookValue) throw new Error('hook did not render');

    await act(async () => {
      await hookValue?.send({ content: 'hey' });
    });
    await act(async () => {
      setChatState({ status: 'streaming', messages: [] });
    });
    // Turn ends; reconcile is now in flight.
    await act(async () => {
      setChatState({ status: 'ready', messages: [] });
    });
    expect(callOrder).toEqual(['append:hey', 'send:hey', 'reconcile:start']);

    // Send while the reply row is still being ingested.
    await act(async () => {
      await hookValue?.send({ content: 'great' });
    });
    // Held — the reply's row hasn't landed yet.
    expect(callOrder).toEqual(['append:hey', 'send:hey', 'reconcile:start']);
    expect(hookValue.queuedUserMessages.map((m) => m.content)).toEqual(['great']);

    await act(async () => {
      resolveReconcile();
    });
    expect(callOrder).toEqual([
      'append:hey',
      'send:hey',
      'reconcile:start',
      'reconcile:done',
      'append:great',
      'send:great',
    ]);
  });
});
