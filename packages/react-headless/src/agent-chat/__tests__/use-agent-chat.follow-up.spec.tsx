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

/** Follow-ups wait for the active reply and its persisted transcript. */

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

const transportSendSpy = vi.fn();
vi.mock('../agent-chat-transport', () => ({
  buildAgentChatTransport: () => ({ sendMessages: transportSendSpy }),
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
  agent: {},
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

describe('useAgentChat follow-up queue', () => {
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

  it('queues a mid-stream follow-up until the reply is persisted, without replaying the old answer', async () => {
    await liveTurn();
    await act(async () => {
      await registeredSend()({ content: 'follow-up' });
    });
    expect(
      hookValue?.queuedUserMessages.map((message) => message.content),
    ).toEqual(['follow-up']);
    expect(transportSendSpy).not.toHaveBeenCalled();
    expect(callOrder).not.toContain('append:follow-up');
    expect(callOrder).not.toContain('send:follow-up');
    expect(liveText()).toEqual([PARTIAL]);
    await act(async () => {
      setChatState({ status: 'ready', messages: settledTurn() });
    });
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      setTranscript([
        { id: 'msg-where is my order?', type: 'USER' },
        { id: 'row-reply', type: 'AI' },
      ]);
      resolveReconcile();
    });
    expect(sendMessageSpy).toHaveBeenCalledTimes(2);
    expect(callOrder.indexOf('reconcile:done')).toBeLessThan(
      callOrder.indexOf('append:follow-up'),
    );
    expect(hookValue?.queuedUserMessages).toEqual([]);
    expect(hookValue?.turnSources).toHaveLength(1);
    // useChat can report submitted before its throttled message array advances.
    await act(async () => {
      setChatState({ status: 'submitted', messages: settledTurn() });
    });
    expect(liveText()).toEqual([]);
    await act(async () => {
      setChatState({
        status: 'streaming',
        messages: [
          {
            id: 'a-follow-up',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Your follow-up answer' }],
          },
        ],
      });
    });
    expect(liveText()).toEqual(['Your follow-up answer']);
    expect(hookValue?.turnSources).toHaveLength(1);
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

  it('queues a follow-up before the first chunk', async () => {
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

  it('preserves follow-up order while a reply is streaming', async () => {
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

  it('holds a follow-up until Stop is acknowledged', async () => {
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
