import type {
  SendMessageInput,
  StagedUserTurn,
  WidgetCtx,
  WidgetMessageU,
  WidgetUserMessage,
} from '@opencx/widget-core';
import type { UIMessageChunk } from 'ai';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Steering: a message sent while a turn is STREAMING is not queued — its
 * bubble enters the transcript at once and it is POSTed at once on a side
 * stream. The backend steers it into the live turn (`data-turn-steered`),
 * whose single reply — still rendering on the engine's own stream,
 * untouched — answers both messages. When the live turn was already over,
 * the backend opened a new turn on the side stream instead; that copy is
 * dropped and the turn replayed through the engine via resume.
 */

type ChatState = {
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: unknown[];
};

const PARTIAL = 'Checking your order';
const FULL =
  'Checking your order — it ships Monday, and your address is updated.';
const partialTurn = () => [
  { id: 'a-live', role: 'assistant', parts: [{ type: 'text', text: PARTIAL }] },
];
const fullTurn = () => [
  { id: 'a-live', role: 'assistant', parts: [{ type: 'text', text: FULL }] },
];
const settledTurn = () => [
  {
    id: 'a-live',
    role: 'assistant',
    parts: [
      { type: 'text', text: FULL },
      {
        type: 'data-turn-settled',
        data: { turn_id: 'turn-1', message_uuids: ['row-reply'] },
      },
    ],
  },
];

type PersistedRow = { id: string; type: 'USER' | 'AI' | 'AGENT' | 'SYSTEM' };

const sendMessageSpy = vi.fn();
const stopSpy = vi.fn();
const resumeStreamSpy = vi.fn();
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
      resumeStream: resumeStreamSpy,
    };
  },
}));

/** The side stream a steer POST gets back; one per `transport.sendMessages`. */
function chunkStream(chunks: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

let nextSideStream: () => ReadableStream<UIMessageChunk> = () =>
  chunkStream([]);
const transportSendSpy = vi.fn(
  async (options: { body?: object; abortSignal: AbortSignal | undefined }) => {
    callOrder.push(`steer:${bodyContent(options.body)}`);
    return nextSideStream();
  },
);
vi.mock('../agent-chat-transport', () => ({
  buildAgentChatTransport: () => ({ sendMessages: transportSendSpy }),
}));

const bodyContent = (body: object | undefined): string => {
  if (!body || !('content' in body) || typeof body.content !== 'string') {
    return '?';
  }
  return body.content;
};

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
  markUserMessageDelivered: vi.fn((id: string) => {
    callOrder.push(`delivered:${id}`);
  }),
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
    stopStream: vi.fn(async () => {}),
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

// Stable identity, as an embed's config is — a fresh object per render would
// re-run the turn-boundary effect on every commit.
const CONFIG = { token: 't', context: { page: { url: '/orders' } } };

function Probe() {
  const [rows, setRows] = React.useState<PersistedRow[]>([]);
  setTranscript = setRows;
  hookValue = useAgentChat({
    widgetCtx: fakeWidgetCtx,
    config: CONFIG,
    sessionId: 'sess-1',
    persistedMessages: rows as unknown as WidgetMessageU[],
  });
  return null;
}

const liveText = () =>
  hookValue?.liveItems.flatMap((item) =>
    item.kind === 'text' ? [item.text] : [],
  ) ?? [];

describe('useAgentChat steering into the live turn', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    callOrder.length = 0;
    nextSideStream = () => chunkStream([]);
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

  /** Turn 1 sent and streaming a partial reply. */
  async function liveTurn() {
    await act(async () => {
      await registeredSend()({ content: 'where is my order?' });
    });
    await act(async () => {
      setTranscript([{ id: 'msg-where is my order?', type: 'USER' }]);
      setChatState({ status: 'streaming', messages: partialTurn() });
    });
    expect(liveText()).toEqual([PARTIAL]);
    expect(callOrder).toEqual([
      'append:where is my order?',
      'send:where is my order?',
      'delivered:msg-where is my order?',
    ]);
    callOrder.length = 0;
  }

  it('steer: the bubble appears at once, the live stream keeps rendering, the steered part binds, one reply answers both', async () => {
    await liveTurn();
    nextSideStream = () =>
      chunkStream([
        {
          type: 'data-turn-steered',
          data: { turn_id: 'turn-1', message_uuid: 'msg-and my address' },
        },
      ]);

    const onAccepted = vi.fn();
    await act(async () => {
      await registeredSend()({ content: 'and my address', onAccepted });
    });

    // Immediately in the transcript and on the wire — not in the queue pill,
    // and not through the engine's own `sendMessage` (that would push a
    // duplicate of the live assistant message).
    expect(onAccepted).toHaveBeenCalledTimes(1);
    expect(hookValue?.queuedUserMessages).toEqual([]);
    expect(sendMessageSpy).toHaveBeenCalledTimes(1); // the first message only
    expect(transportSendSpy).toHaveBeenCalledTimes(1);
    const request = transportSendSpy.mock.calls[0]?.[0];
    expect(request?.body).toMatchObject({
      uuid: 'msg-and my address',
      session_id: 'sess-1',
      content: 'and my address',
      clientContext: { page: { url: '/orders' } },
    });
    // The steered part bound the bubble to the live turn and un-dimmed it.
    expect(callOrder).toEqual([
      'append:and my address',
      'steer:and my address',
      'delivered:msg-and my address',
    ]);
    // The live overlay was never touched: still the same partial, still live.
    expect(hookValue?.isStreaming).toBe(true);
    expect(liveText()).toEqual([PARTIAL]);
    expect(stopSpy).not.toHaveBeenCalled();
    expect(resumeStreamSpy).not.toHaveBeenCalled();
    expect(fakeReconcileAfterStream).not.toHaveBeenCalled();

    // The live turn continues on its own stream and answers both messages.
    await act(async () => {
      setTranscript([
        { id: 'msg-where is my order?', type: 'USER' },
        { id: 'msg-and my address', type: 'USER' },
      ]);
      setChatState({ status: 'streaming', messages: fullTurn() });
    });
    expect(liveText()).toEqual([FULL]);

    // Turn settles: ONE reply, retained as the render source of its row.
    await act(async () => {
      setChatState({ status: 'ready', messages: settledTurn() });
    });
    expect(hookValue?.turnSources).toEqual([
      expect.objectContaining({
        turnId: 'turn-1',
        rowIds: ['row-reply'],
        items: [{ kind: 'text', text: FULL }],
      }),
    ]);
    expect(fakeReconcileAfterStream).toHaveBeenCalledTimes(1);
    // The partial stays on screen until the reply row lands below both
    // user rows: on reload that is the order too — partial-then-full reply
    // is one row, after the steered message's own row.
    expect(liveText()).toEqual([FULL]);
    await act(async () => {
      setTranscript([
        { id: 'msg-where is my order?', type: 'USER' },
        { id: 'msg-and my address', type: 'USER' },
        { id: 'row-reply', type: 'AI' },
      ]);
      resolveReconcile();
    });
    expect(hookValue?.liveItems).toEqual([]);
    // No duplicate bubbles: each user message appended exactly once, no
    // second send, no second reply source.
    expect(
      fakeMessageCtx.appendUserMessageIfAbsent.mock.calls.map(
        ([message]) => message.content,
      ),
    ).toEqual(['where is my order?', 'and my address']);
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    expect(hookValue?.turnSources).toHaveLength(1);
  });

  it('steer with an unnamed turn (server lookup failed) still binds and delivers', async () => {
    await liveTurn();
    nextSideStream = () =>
      chunkStream([
        {
          type: 'data-turn-steered',
          data: { turn_id: null, message_uuid: 'msg-also' },
        },
      ]);
    await act(async () => {
      await registeredSend()({ content: 'also' });
    });
    expect(callOrder).toEqual([
      'append:also',
      'steer:also',
      'delivered:msg-also',
    ]);
    expect(liveText()).toEqual([PARTIAL]);
  });

  it('fallback: the live turn was over, so the side stream carries a NEW turn — replayed through the engine via resume', async () => {
    await liveTurn();
    nextSideStream = () =>
      chunkStream([
        { type: 'start' },
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: 'your address is updated' },
      ]);

    await act(async () => {
      await registeredSend()({ content: 'and my address' });
    });
    // Bubble in at once; the copy on the side stream is dropped, the
    // superseded engine stream is aborted client-side, and the new turn is
    // replayed from the session's resume pointer.
    expect(callOrder).toEqual([
      'append:and my address',
      'steer:and my address',
    ]);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(resumeStreamSpy).toHaveBeenCalledTimes(1);
    expect(sendMessageSpy).toHaveBeenCalledTimes(1); // the first message only
    expect(hookValue?.queuedUserMessages).toEqual([]);

    // The resumed stream's first chunk proves delivery for THIS message.
    await act(async () => {
      setChatState({ status: 'ready', messages: partialTurn() });
    });
    await act(async () => {
      setChatState({
        status: 'streaming',
        messages: [
          ...partialTurn(),
          {
            id: 'a-new',
            role: 'assistant',
            parts: [{ type: 'text', text: 'your address is updated' }],
          },
        ],
      });
    });
    expect(callOrder).toContain('delivered:msg-and my address');
    expect(liveText()).toEqual(['your address is updated']);
  });

  it('a withheld reply (empty side stream) delivers the bubble and reconciles the rows', async () => {
    await liveTurn();
    nextSideStream = () => chunkStream([]);
    await act(async () => {
      await registeredSend()({ content: 'thanks' });
    });
    expect(callOrder).toEqual([
      'append:thanks',
      'steer:thanks',
      'delivered:msg-thanks',
      'reconcile:start',
    ]);
    expect(liveText()).toEqual([PARTIAL]);
  });

  it('a failed steer turn is logged, not marked delivered, and the rows are reconciled', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    await liveTurn();
    nextSideStream = () =>
      chunkStream([{ type: 'error', errorText: 'The agent run failed.' }]);
    await act(async () => {
      await registeredSend()({ content: 'thanks' });
    });
    expect(callOrder).toEqual([
      'append:thanks',
      'steer:thanks',
      'reconcile:start',
    ]);
    expect(consoleError).toHaveBeenCalledWith(
      '[opencx] agent chat steer: the turn failed',
      { errorText: 'The agent run failed.' },
    );
    consoleError.mockRestore();
  });

  it('a steer POST that throws is logged and the live turn is untouched', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    await liveTurn();
    transportSendSpy.mockRejectedValueOnce(new Error('network down'));
    await act(async () => {
      await registeredSend()({ content: 'thanks' });
    });
    expect(callOrder).toEqual(['append:thanks']);
    expect(consoleError).toHaveBeenCalledWith(
      '[opencx] agent chat steer failed',
      expect.any(Error),
    );
    expect(liveText()).toEqual([PARTIAL]);
    expect(hookValue?.isStreaming).toBe(true);
    consoleError.mockRestore();
  });

  it('keepalive heartbeats before the steer are skipped — still steered, no stop/resume', async () => {
    await liveTurn();
    nextSideStream = () =>
      chunkStream([
        { type: 'data-keepalive', data: null, transient: true },
        { type: 'data-keepalive', data: null, transient: true },
        {
          type: 'data-turn-steered',
          data: { turn_id: 'turn-1', message_uuid: 'msg-also' },
        },
      ]);
    await act(async () => {
      await registeredSend()({ content: 'also' });
    });
    expect(callOrder).toEqual([
      'append:also',
      'steer:also',
      'delivered:msg-also',
    ]);
    expect(stopSpy).not.toHaveBeenCalled();
    expect(resumeStreamSpy).not.toHaveBeenCalled();
    expect(fakeReconcileAfterStream).not.toHaveBeenCalled();
    expect(liveText()).toEqual([PARTIAL]);
  });

  it('keepalive then a real turn chunk → the fallback new-turn path', async () => {
    await liveTurn();
    nextSideStream = () =>
      chunkStream([
        { type: 'data-keepalive', data: null, transient: true },
        { type: 'start' },
      ]);
    await act(async () => {
      await registeredSend()({ content: 'also' });
    });
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(resumeStreamSpy).toHaveBeenCalledTimes(1);
  });

  it('keepalive then stream end → a withheld reply (silent), not a turn', async () => {
    await liveTurn();
    nextSideStream = () =>
      chunkStream([{ type: 'data-keepalive', data: null, transient: true }]);
    await act(async () => {
      await registeredSend()({ content: 'thanks' });
    });
    expect(callOrder).toEqual([
      'append:thanks',
      'steer:thanks',
      'delivered:msg-thanks',
      'reconcile:start',
    ]);
    expect(stopSpy).not.toHaveBeenCalled();
    expect(resumeStreamSpy).not.toHaveBeenCalled();
  });

  it('a keepalive on the live stream before the first text renders nothing extra', async () => {
    await act(async () => {
      await registeredSend()({ content: 'where is my order?' });
    });
    // The SDK keeps `transient` parts out of the message; a snapshot that
    // carries one anyway (a persisted `ui_parts` replay) renders nothing.
    await act(async () => {
      setChatState({
        status: 'streaming',
        messages: [
          {
            id: 'a-live',
            role: 'assistant',
            parts: [{ type: 'data-keepalive', data: null, transient: true }],
          },
        ],
      });
    });
    expect(hookValue?.liveItems).toEqual([]);
    expect(hookValue?.isStreaming).toBe(true);
    await act(async () => {
      setChatState({
        status: 'streaming',
        messages: [
          {
            id: 'a-live',
            role: 'assistant',
            parts: [
              { type: 'data-keepalive', data: null, transient: true },
              { type: 'text', text: PARTIAL },
            ],
          },
        ],
      });
    });
    expect(hookValue?.liveItems).toEqual([{ kind: 'text', text: PARTIAL }]);
  });

  it('does not steer before the first chunk (submitted) — the message queues as before', async () => {
    await act(async () => {
      await registeredSend()({ content: 'where is my order?' });
    });
    await act(async () => {
      setChatState({ status: 'submitted', messages: [] });
    });
    await act(async () => {
      await registeredSend()({ content: 'and my address' });
    });
    expect(transportSendSpy).not.toHaveBeenCalled();
    expect(hookValue?.queuedUserMessages.map((m) => m.content)).toEqual([
      'and my address',
    ]);
  });

  it('does not steer behind queued messages — order is preserved through the queue', async () => {
    await act(async () => {
      await registeredSend()({ content: 'first' });
    });
    await act(async () => {
      setChatState({ status: 'submitted', messages: [] });
    });
    await act(async () => {
      await registeredSend()({ content: 'second' });
    });
    await act(async () => {
      setChatState({ status: 'streaming', messages: partialTurn() });
    });
    await act(async () => {
      await registeredSend()({ content: 'third' });
    });
    expect(transportSendSpy).not.toHaveBeenCalled();
    expect(hookValue?.queuedUserMessages.map((m) => m.content)).toEqual([
      'second',
      'third',
    ]);
  });

  it('stop-then-send: a message sent after Stop, before its ACK, is queued and drained after the stop — never steered', async () => {
    await liveTurn();
    await act(async () => {
      hookValue?.stop();
      setChatState({ status: 'ready', messages: partialTurn() });
    });
    await act(async () => {
      await registeredSend()({ content: 'and my address' });
    });
    expect(transportSendSpy).not.toHaveBeenCalled();
    expect(hookValue?.queuedUserMessages.map((m) => m.content)).toEqual([
      'and my address',
    ]);
    // Stop ACKed (immediately here) → reconcile → rows land → drain.
    expect(fakeReconcileAfterStream).toHaveBeenCalledTimes(1);
    await act(async () => {
      setTranscript([
        { id: 'msg-where is my order?', type: 'USER' },
        { id: 'row-partial', type: 'AI' },
      ]);
      resolveReconcile();
    });
    expect(callOrder.slice(-2)).toEqual([
      'append:and my address',
      'send:and my address',
    ]);
    expect(hookValue?.queuedUserMessages).toEqual([]);
  });
});
