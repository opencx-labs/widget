import type {
  SendMessageInput,
  StagedUserTurn,
  WidgetCtx,
  WidgetMessageU,
  WidgetUserMessage,
} from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * Regression: pressing Stop lost the streamed partial bubble.
 *
 * `stop` aborts the CLIENT stream first, which flips `useChat` to ready and
 * runs the turn-boundary effect. Retention needs the stream's terminal
 * `data-turn-settled` part — which never arrives after a client abort — so
 * the boundary fell back to an immediate reconcile. That fetch ran before the
 * server had persisted the partial reply: empty transcript → queue drains →
 * the next user bubble is appended, and the partial text only reappears on a
 * later poll, BELOW the queued message.
 *
 * Now `/stop` ACKs only once the turn settled and the partial row exists, so:
 * - the client abort must not reconcile;
 * - the partial stays on screen (`liveItems`) until its row lands;
 * - the reconcile runs after the ACK (and after a FAILED stop too);
 * - the queue drains only after that, so order stays partial → queued.
 */

type ChatState = {
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: unknown[];
};

const PARTIAL_TEXT = 'Let me look that up for';
const PARTIAL_TURN = [
  { role: 'assistant', parts: [{ type: 'text', text: PARTIAL_TEXT }] },
];

type PersistedRow = { id: string; type: 'USER' | 'AI' | 'AGENT' | 'SYSTEM' };

const sendMessageSpy = vi.fn();
const stopSpy = vi.fn();
let setChatState: (next: ChatState) => void = () => {};
let setTranscript: (next: PersistedRow[]) => void = () => {};

vi.mock('@ai-sdk/react', () => ({
  useChat: () => {
    const [state, setState] = React.useState<ChatState>({
      status: 'ready',
      messages: [],
    });
    setChatState = setState;
    return {
      ...state,
      sendMessage: sendMessageSpy,
      stop: stopSpy,
      error: undefined,
      clearError: vi.fn(),
      resumeStream: vi.fn(),
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

/** The `/stop` request, settled by the test: ACK or failure. */
let ackStop: () => void = () => {};
let failStop: (err: Error) => void = () => {};
const stopStreamSpy = vi.fn(() => {
  callOrder.push('stop:request');
  return new Promise<void>((resolve, reject) => {
    ackStop = () => {
      callOrder.push('stop:ack');
      resolve();
    };
    failStop = (err) => {
      callOrder.push('stop:failed');
      reject(err);
    };
  });
});

const fakeMessageCtx = {
  stageUserTurn: vi.fn(
    async (input: SendMessageInput): Promise<StagedUserTurn | null> => ({
      sessionId: 'sess-1',
      userMessage: buildUserMessage(input.content),
      initialMessages: [],
    }),
  ),
  buildQueuedUserMessage: vi.fn((input: SendMessageInput) => ({
    sessionId: 'sess-1',
    userMessage: buildUserMessage(input.content),
  })),
  appendUserMessageIfAbsent: vi.fn((m: WidgetUserMessage) => {
    callOrder.push(`append:${m.content}`);
  }),
  markUserMessageDelivered: vi.fn(),
  notifySendAccepted: vi.fn((input: SendMessageInput) => input.onAccepted?.()),
  registerAgentHandlers: vi.fn(),
  unregisterAgentHandlers: vi.fn(),
};

function registeredSend(): (input: SendMessageInput) => Promise<void> | void {
  const handlers = fakeMessageCtx.registerAgentHandlers.mock.calls.at(-1)?.[0];
  if (!handlers) throw new Error('agent handlers were never registered');
  return handlers.send;
}

const fakeWidgetCtx = {
  api: {
    getStreamTransportOptions: () => ({
      api: 'http://test/chat',
      reconnectApi: (id: string) => `http://test/chat/${id}`,
      headers: {},
    }),
    stopStream: stopStreamSpy,
    getAgentTurnMessages: vi.fn(async () => null),
  },
  messageCtx: fakeMessageCtx,
  reconcileAfterStream: fakeReconcileAfterStream,
  features: {
    dictation: false,
    attachments: true,
    pageContext: true,
    clientTools: true,
  },
} as unknown as WidgetCtx;

import { useAgentChat } from '../useAgentChat';

let hookValue: ReturnType<typeof useAgentChat> | null = null;

function Probe() {
  const [rows, setRows] = React.useState<PersistedRow[]>([]);
  setTranscript = setRows;
  hookValue = useAgentChat({
    widgetCtx: fakeWidgetCtx,
    config: { token: 't' },
    sessionId: 'sess-1',
    persistedMessages: rows as unknown as WidgetMessageU[],
  });
  return null;
}

const partialOnScreen = () =>
  hookValue?.liveItems.some(
    (item) => item.kind === 'text' && item.text === PARTIAL_TEXT,
  ) ?? false;

describe('useAgentChat stop keeps the partial reply', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    callOrder.length = 0;
    sendMessageSpy.mockImplementation(
      (_msg: unknown, opts: { body: { content: string } }) => {
        callOrder.push(`send:${opts.body.content}`);
      },
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Probe />);
    });
    if (!hookValue) throw new Error('hook did not render');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  /**
   * Turn 1 streaming a partial reply; Stop pressed (client stream aborts at
   * once, status → ready, `/stop` still in flight); then turn 2 sent — a
   * message sent after Stop but before its ACK is for AFTER the stop, so it
   * takes the stop-then-send path (queued, never steered into the turn
   * being cancelled).
   */
  async function streamStopThenSend() {
    await act(async () => {
      await registeredSend()({ content: 'hey' });
    });
    await act(async () => {
      setTranscript([{ id: 'u1', type: 'USER' }]);
      setChatState({ status: 'streaming', messages: PARTIAL_TURN });
    });
    await act(async () => {
      hookValue?.stop();
      setChatState({ status: 'ready', messages: PARTIAL_TURN });
    });
    expect(stopSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      await registeredSend()({ content: 'second' });
    });
    expect(hookValue?.queuedUserMessages.map((m) => m.content)).toEqual([
      'second',
    ]);
    expect(partialOnScreen()).toBe(true);
    expect(callOrder).toEqual(['append:hey', 'send:hey', 'stop:request']);
  }

  it('the client abort neither reconciles nor drops the partial; reconcile fires after the stop ACK; order stays partial → queued', async () => {
    await streamStopThenSend();
    // No reconcile on the client abort — the row is not there yet.
    expect(fakeReconcileAfterStream).not.toHaveBeenCalled();
    // The partial stays on screen and the queued message stays queued.
    expect(hookValue?.isStreaming).toBe(false);
    expect(partialOnScreen()).toBe(true);
    expect(hookValue?.queuedUserMessages.map((m) => m.content)).toEqual([
      'second',
    ]);

    // Server ACK: the turn settled and the partial row is persisted.
    await act(async () => {
      ackStop();
    });
    expect(callOrder).toEqual([
      'append:hey',
      'send:hey',
      'stop:request',
      'stop:ack',
      'reconcile:start',
    ]);
    // Still held while the reconcile runs.
    expect(partialOnScreen()).toBe(true);
    expect(hookValue?.queuedUserMessages).toHaveLength(1);

    // The reconcile ingests the partial's row → overlay released, queue drains.
    await act(async () => {
      setTranscript([
        { id: 'u1', type: 'USER' },
        { id: 'a1-partial', type: 'AI' },
      ]);
      resolveReconcile();
    });
    expect(callOrder).toEqual([
      'append:hey',
      'send:hey',
      'stop:request',
      'stop:ack',
      'reconcile:start',
      'reconcile:done',
      'append:second',
      'send:second',
    ]);
    // The partial now lives in the transcript row; the overlay is empty
    // until the next turn's first chunk, not showing a stale reply.
    expect(hookValue?.liveItems).toEqual([]);
    expect(hookValue?.queuedUserMessages).toEqual([]);
  });

  it('a failed stop still reconciles and drains, so the UI never sticks', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    await streamStopThenSend();
    expect(fakeReconcileAfterStream).not.toHaveBeenCalled();
    expect(partialOnScreen()).toBe(true);

    await act(async () => {
      failStop(new Error('stop 500'));
    });
    expect(callOrder).toEqual([
      'append:hey',
      'send:hey',
      'stop:request',
      'stop:failed',
      'reconcile:start',
    ]);
    expect(consoleError).toHaveBeenCalledWith(
      '[opencx] agent chat stop failed',
      expect.any(Error),
    );

    await act(async () => {
      setTranscript([
        { id: 'u1', type: 'USER' },
        { id: 'a1-partial', type: 'AI' },
      ]);
      resolveReconcile();
    });
    expect(callOrder.slice(-3)).toEqual([
      'reconcile:done',
      'append:second',
      'send:second',
    ]);
    expect(hookValue?.queuedUserMessages).toEqual([]);
    consoleError.mockRestore();
  });

  it('with nothing queued, the partial is held until its row lands after the ACK', async () => {
    await act(async () => {
      await registeredSend()({ content: 'hey' });
    });
    await act(async () => {
      setTranscript([{ id: 'u1', type: 'USER' }]);
      setChatState({ status: 'streaming', messages: PARTIAL_TURN });
    });
    await act(async () => {
      hookValue?.stop();
      setChatState({ status: 'ready', messages: PARTIAL_TURN });
    });
    expect(partialOnScreen()).toBe(true);
    expect(fakeReconcileAfterStream).not.toHaveBeenCalled();

    await act(async () => {
      ackStop();
    });
    expect(fakeReconcileAfterStream).toHaveBeenCalledTimes(1);
    expect(partialOnScreen()).toBe(true);

    await act(async () => {
      setTranscript([
        { id: 'u1', type: 'USER' },
        { id: 'a1-partial', type: 'AI' },
      ]);
      resolveReconcile();
    });
    expect(hookValue?.liveItems).toEqual([]);
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
  });
});
