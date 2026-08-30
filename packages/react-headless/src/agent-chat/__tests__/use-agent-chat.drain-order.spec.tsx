import type {
  SendMessageInput,
  WidgetCtx,
  WidgetUserMessage,
} from '@opencx/widget-core';
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
const replacementSessionStopSpy = vi.fn();
const clearErrorSpy = vi.fn();
const resumeStreamSpy = vi.fn();
let setChatState: (next: ChatState) => void = () => {};
let currentSessionId: string | null = 'sess-1';
let blockAgentMultiSend = false;

vi.mock('@ai-sdk/react', () => ({
  useChat: ({ id }: { id?: string }) => {
    const [state, setState] = React.useState<ChatState>({
      status: 'ready',
      messages: [],
    });
    setChatState = setState;
    return {
      ...state,
      sendMessage: sendMessageSpy,
      stop: id === 'sess-2' ? replacementSessionStopSpy : stopSpy,
      error: undefined,
      clearError: clearErrorSpy,
      resumeStream: resumeStreamSpy,
    };
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
    pending: true,
  };
}

let resolveReconcile: () => void = () => {};

const fakeReconcileAfterStream = vi.fn(() => {
  callOrder.push('reconcile:start');
  return new Promise<void>((resolve) => {
    resolveReconcile = () => {
      callOrder.push('reconcile:done');
      resolve();
    };
  });
});

const fakeMessageCtx = {
  beginAgentTurn: vi.fn(async (input: SendMessageInput) => ({
    sessionId: 'sess-1',
    userMessage: buildUserMessage(input.content),
  })),
  buildQueuedUserMessage: vi.fn(
    (
      input: SendMessageInput,
    ): { sessionId: string; userMessage: WidgetUserMessage } | null => ({
      sessionId: 'sess-1',
      userMessage: buildUserMessage(input.content),
    }),
  ),
  appendUserMessageIfAbsent: vi.fn((m: WidgetUserMessage) => {
    callOrder.push(`append:${m.content}`);
  }),
  markUserMessageDelivered: vi.fn(),
  registerAgentHandlers: vi.fn(),
  unregisterAgentHandlers: vi.fn(),
};

const getAgentTurnMessagesSpy = vi.fn(async () => null);
const stopStreamSpy = vi.fn(async () => {});
const fakeApi = {
  getStreamTransportOptions: () => ({
    api: 'http://test/chat',
    reconnectApi: (id: string) => `http://test/chat/${id}`,
    headers: {},
  }),
  stopStream: stopStreamSpy,
  getAgentTurnMessages: getAgentTurnMessagesSpy,
};

const fakeWidgetCtx = {
  api: fakeApi,
  messageCtx: fakeMessageCtx,
  reconcileAfterStream: fakeReconcileAfterStream,
} as unknown as WidgetCtx;

// The engine exposes `send` by registering it with MessageCtx (the shared
// `sendMessage` entry point) — drive sends through that seam, like production.
function registeredSend(): (input: SendMessageInput) => Promise<void> | void {
  const handlers = fakeMessageCtx.registerAgentHandlers.mock.calls.at(-1)?.[0];
  if (!handlers) throw new Error('agent handlers were never registered');
  return handlers.send;
}

import { useAgentChat } from '../useAgentChat';
import { LIVE_TURN_FALLBACK_KEY } from '../agent-turn-sources';

let hookValue: ReturnType<typeof useAgentChat> | null = null;

function Probe() {
  hookValue = useAgentChat({
    widgetCtx: fakeWidgetCtx,
    config: {
      token: 't',
      disableSendingWhenAwaitingAIReply: blockAgentMultiSend,
    },
    sessionId: currentSessionId,
    persistedMessages: [],
  });
  return null;
}

describe('useAgentChat drain ordering', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    currentSessionId = 'sess-1';
    blockAgentMultiSend = false;
    callOrder.length = 0;
    fakeMessageCtx.beginAgentTurn.mockImplementation(
      async (input: SendMessageInput) => ({
        sessionId: currentSessionId ?? 'sess-1',
        userMessage: buildUserMessage(input.content),
      }),
    );
    fakeMessageCtx.buildQueuedUserMessage.mockImplementation(
      (input: SendMessageInput) => ({
        sessionId: currentSessionId ?? 'sess-1',
        userMessage: buildUserMessage(input.content),
      }),
    );
    sendMessageSpy.mockImplementation(
      (_msg: unknown, opts: { body: { content: string } }) => {
        callOrder.push(`send:${opts.body.content}`);
      },
    );
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
      await registeredSend()({ content: 'hey' });
    });
    expect(callOrder).toEqual(['append:hey', 'send:hey']);

    // Turn 1 starts streaming; the user multi-sends mid-turn.
    await act(async () => {
      setChatState({ status: 'streaming', messages: [] });
    });
    await act(async () => {
      await registeredSend()({ content: 'amazing day' });
    });
    // Queued — NOT appended, NOT sent.
    expect(hookValue.queuedUserMessages.map((m) => m.content)).toEqual([
      'amazing day',
    ]);
    expect(callOrder).toEqual(['append:hey', 'send:hey']);
    expect(fakeMessageCtx.markUserMessageDelivered).toHaveBeenCalledWith(
      'msg-hey',
    );

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

  it('declines every agent send entry while awaiting a reply when the gate is enabled', async () => {
    blockAgentMultiSend = true;
    await act(async () => {
      root.render(<Probe />);
    });
    await act(async () => {
      await registeredSend()({ content: 'first' });
    });
    expect(hookValue?.queuedUserMessages).toEqual([]);
    await act(async () => {
      setChatState({ status: 'streaming', messages: [] });
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onAccepted = vi.fn();
    let result: unknown;

    await act(async () => {
      result = await registeredSend()({ content: 'blocked', onAccepted });
    });

    expect(result).toEqual({ accepted: false, reason: 'awaiting-reply' });
    expect(onAccepted).not.toHaveBeenCalled();
    expect(fakeMessageCtx.buildQueuedUserMessage).not.toHaveBeenCalled();
    expect(hookValue?.queuedUserMessages).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      'Cannot send messages while awaiting AI response',
    );
    warnSpy.mockRestore();
  });

  it('rejects the newest send at capacity without evicting accepted FIFO entries', async () => {
    await act(async () => root.render(<Probe />));
    await act(async () => {
      await registeredSend()({ content: 'current' });
    });
    await act(async () => {
      setChatState({ status: 'streaming', messages: [] });
    });
    const accepted = Array.from({ length: 21 }, () => vi.fn());
    const results: unknown[] = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await act(async () => {
      for (let index = 0; index < accepted.length; index += 1) {
        results.push(
          await registeredSend()({
            content: `queued-${index + 1}`,
            onAccepted: accepted[index],
          }),
        );
      }
    });

    expect(results.slice(0, 20)).toEqual(
      Array.from({ length: 20 }, () => ({ accepted: true })),
    );
    expect(results[20]).toEqual({ accepted: false, reason: 'queue-full' });
    accepted
      .slice(0, 20)
      .forEach((callback) => expect(callback).toHaveBeenCalledTimes(1));
    expect(accepted[20]).not.toHaveBeenCalled();
    expect(
      hookValue?.queuedUserMessages.map((message) => message.content),
    ).toEqual(Array.from({ length: 20 }, (_, index) => `queued-${index + 1}`));
    expect(warnSpy).toHaveBeenCalledWith(
      'agent chat queue full; rejecting newest send',
      { rejectedMessageId: 'msg-queued-21' },
    );
    warnSpy.mockRestore();
  });

  it('does not evict an accepted queued send when retry is attempted at capacity', async () => {
    await act(async () => root.render(<Probe />));
    await act(async () => {
      await registeredSend()({ content: 'failed-current' });
    });
    await act(async () => {
      setChatState({ status: 'streaming', messages: [] });
    });
    await act(async () => {
      for (let index = 1; index <= 20; index += 1) {
        await registeredSend()({ content: `accepted-${index}` });
      }
    });
    const beforeRetry = hookValue?.queuedUserMessages.map(
      (message) => message.id,
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await act(async () => hookValue?.retryFailedTurn());

    expect(hookValue?.queuedUserMessages.map((message) => message.id)).toEqual(
      beforeRetry,
    );
    expect(clearErrorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'agent chat queue full; retry not enqueued',
    );
    warnSpy.mockRestore();
  });

  it('serializes fresh-session preparation so followers keep FIFO order', async () => {
    let resolveFirst: (prepared: {
      sessionId: string;
      userMessage: WidgetUserMessage;
    }) => void = () => {};
    let sessionCreated = false;
    fakeMessageCtx.beginAgentTurn.mockImplementationOnce(
      (_input: SendMessageInput) =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    fakeMessageCtx.buildQueuedUserMessage.mockImplementation(
      (input: SendMessageInput) =>
        sessionCreated
          ? {
              sessionId: 'sess-new',
              userMessage: buildUserMessage(input.content),
            }
          : null,
    );

    await act(async () => {
      root.render(<Probe />);
    });

    let first: Promise<void> | void;
    let second: Promise<void> | void;
    let third: Promise<void> | void;
    await act(async () => {
      first = registeredSend()({ content: 'first' });
      second = registeredSend()({ content: 'second' });
      third = registeredSend()({ content: 'third' });
      await Promise.resolve();
    });

    // Followers have not tried the session-dependent queued path while the
    // first send is still creating that session.
    expect(fakeMessageCtx.beginAgentTurn).toHaveBeenCalledTimes(1);
    expect(fakeMessageCtx.buildQueuedUserMessage).not.toHaveBeenCalled();

    await act(async () => {
      sessionCreated = true;
      resolveFirst({
        sessionId: 'sess-new',
        userMessage: buildUserMessage('first'),
      });
      await Promise.all([first, second, third]);
    });

    expect(callOrder).toEqual(['append:first', 'send:first']);
    expect(
      hookValue?.queuedUserMessages.map((message) => message.content),
    ).toEqual(['second', 'third']);
  });

  it('clears conversation-owned queue and retry state on a real session reset', async () => {
    await act(async () => {
      root.render(<Probe />);
    });
    await act(async () => {
      await registeredSend()({ content: 'first' });
    });
    await act(async () => {
      setChatState({ status: 'streaming', messages: [] });
    });
    await act(async () => {
      await registeredSend()({ content: 'stale queued' });
    });
    expect(hookValue?.queuedUserMessages).toHaveLength(1);
    expect(hookValue?.liveTurnKey).toBe('turn-msg-first');

    await act(async () => {
      currentSessionId = null;
      root.render(<Probe />);
    });

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(hookValue?.queuedUserMessages).toEqual([]);
    expect(hookValue?.liveTurnKey).toBe(LIVE_TURN_FALLBACK_KEY);
    expect(hookValue?.turnSources).toEqual([]);

    await act(async () => {
      hookValue?.retryFailedTurn();
    });
    expect(hookValue?.queuedUserMessages).toEqual([]);
  });

  it('re-fetches historical turn sources when a reset reopens the same session', async () => {
    await act(async () => {
      root.render(<Probe />);
    });
    expect(getAgentTurnMessagesSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      currentSessionId = null;
      root.render(<Probe />);
    });
    await act(async () => {
      currentSessionId = 'sess-1';
      setChatState({ status: 'ready', messages: [] });
      root.render(<Probe />);
    });

    expect(getAgentTurnMessagesSpy).toHaveBeenCalledTimes(2);
  });

  it('a direct session switch cannot retain an idle status or queued send', async () => {
    await act(async () => {
      root.render(<Probe />);
    });
    await act(async () => {
      await registeredSend()({ content: 'old current' });
      await registeredSend()({ content: 'old queued' });
    });

    await act(async () => {
      currentSessionId = 'sess-2';
      root.render(<Probe />);
    });
    expect(hookValue?.queuedUserMessages).toEqual([]);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(replacementSessionStopSpy).not.toHaveBeenCalled();

    await act(async () => {
      await registeredSend()({ content: 'new current' });
    });

    expect(callOrder).toContain('send:new current');
    expect(hookValue?.queuedUserMessages).toEqual([]);
  });

  it('a message sent DURING the reconcile window is queued, not streamed over it', async () => {
    await act(async () => {
      root.render(<Probe />);
    });
    if (!hookValue) throw new Error('hook did not render');

    await act(async () => {
      await registeredSend()({ content: 'hey' });
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
      await registeredSend()({ content: 'great' });
    });
    // Held — the reply's row hasn't landed yet.
    expect(callOrder).toEqual(['append:hey', 'send:hey', 'reconcile:start']);
    expect(hookValue.queuedUserMessages.map((m) => m.content)).toEqual([
      'great',
    ]);

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
