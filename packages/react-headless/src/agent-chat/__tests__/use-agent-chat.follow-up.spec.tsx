import type {
  SendMessageInput,
  StagedUserTurn,
  WidgetCtx,
  WidgetMessageU,
  WidgetUserMessage,
} from '@opencx/widget-core';
import type { ChatOnFinishCallback, UIMessage } from 'ai';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Follow-ups wait for the active reply and its persisted transcript. */

type ChatState = {
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: UIMessage[];
};

const PARTIAL = 'Checking your order';
const FULL =
  'Checking your order — it ships Monday, and your address is updated.';
const partialTurn = (): UIMessage[] => [
  { id: 'a-live', role: 'assistant', parts: [{ type: 'text', text: PARTIAL }] },
];
const settledTurn = (rowIds = ['row-reply']): UIMessage[] => [
  {
    id: 'a-live',
    role: 'assistant',
    parts: [
      { type: 'text', text: FULL },
      {
        type: 'data-turn-settled',
        data: { turn_id: 'turn-1', message_uuids: rowIds },
      },
    ],
  },
];

type PersistedRow = { id: string; type: 'USER' | 'AI' | 'AGENT' | 'SYSTEM' };

const sendMessageSpy = vi.fn();
const stopSpy = vi.fn();
const resumeStreamSpy = vi.fn();
let finishStream: ChatOnFinishCallback<UIMessage> = () => {};
let setChatState: (next: ChatState) => void = () => {};
let setTranscript: (next: PersistedRow[]) => void = () => {};

vi.mock('@ai-sdk/react', () => ({
  useChat: ({ onFinish }: { onFinish: ChatOnFinishCallback<UIMessage> }) => {
    finishStream = onFinish;
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
  state: { setPartial: vi.fn() },
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

  it.each(['empty', 'partial', 'unrelated'] as const)(
    'waits for every settled reply row after an %s reconciliation result',
    async (result) => {
      await liveTurn();
      await act(async () => {
        await registeredSend()({ content: 'follow-up' });
        setChatState({
          status: 'ready',
          messages: settledTurn(['row-progress', 'row-reply']),
        });
      });
      await act(async () => {
        setTranscript([
          { id: 'msg-where is my order?', type: 'USER' },
          ...(result === 'empty'
            ? []
            : [
                {
                  id: result === 'partial' ? 'row-progress' : 'unrelated-reply',
                  type: 'AI' as const,
                },
              ]),
        ]);
        resolveReconcile();
      });
      expect(callOrder).toContain('reconcile:done');
      expect(sendMessageSpy).toHaveBeenCalledTimes(1);
      expect(callOrder).not.toContain('append:follow-up');
      expect(liveText()).toEqual([FULL]);
      // A new message arriving after the fetch also joins the queue.
      await act(async () => {
        await registeredSend()({ content: 'one more' });
      });
      expect(callOrder).not.toContain('append:one more');
      expect(
        hookValue?.queuedUserMessages.map((message) => message.content),
      ).toEqual(['follow-up', 'one more']);
      await act(async () => {
        setTranscript([
          { id: 'msg-where is my order?', type: 'USER' },
          { id: 'row-progress', type: 'AI' },
          { id: 'row-reply', type: 'AI' },
        ]);
      });
      expect(sendMessageSpy).toHaveBeenCalledTimes(2);
      expect(callOrder.slice(-2)).toEqual([
        'append:follow-up',
        'send:follow-up',
      ]);
      expect(
        hookValue?.queuedUserMessages.map((message) => message.content),
      ).toEqual(['one more']);
    },
  );

  it('waits for the final message snapshot before treating an earlier progress row as the reply', async () => {
    await liveTurn();
    const finished = settledTurn(['row-progress', 'row-reply']);
    const message = finished[0];
    if (!message) throw new Error('missing finished message');
    await act(async () => {
      await registeredSend()({ content: 'follow-up' });
      finishStream({
        message,
        messages: finished,
        isError: false,
        isAbort: false,
        isDisconnect: false,
      });
      setChatState({ status: 'ready', messages: partialTurn() });
      setTranscript([
        { id: 'msg-where is my order?', type: 'USER' },
        { id: 'row-progress', type: 'AI' },
      ]);
    });
    await act(async () => {
      resolveReconcile();
    });
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      setChatState({ status: 'ready', messages: finished });
    });
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      setTranscript([
        { id: 'msg-where is my order?', type: 'USER' },
        { id: 'row-progress', type: 'AI' },
        { id: 'row-reply', type: 'AI' },
      ]);
    });
    expect(sendMessageSpy).toHaveBeenCalledTimes(2);
  });

  it('drains after a confirmed silent completion without waiting for a reply row', async () => {
    await liveTurn();
    const message: UIMessage = { id: 'silent', role: 'assistant', parts: [] };
    const messages = [message];
    await act(async () => {
      await registeredSend()({ content: 'follow-up' });
      finishStream({
        message,
        messages,
        isError: false,
        isAbort: false,
        isDisconnect: false,
      });
      setChatState({ status: 'ready', messages });
    });
    await act(async () => {
      resolveReconcile();
    });
    expect(sendMessageSpy).toHaveBeenCalledTimes(2);
    expect(hookValue?.queuedUserMessages).toEqual([]);
  });

  it('does not strand queued messages after a failed request with no persisted reply', async () => {
    await liveTurn();
    await act(async () => {
      await registeredSend()({ content: 'follow-up' });
      setChatState({ status: 'error', messages: [] });
    });
    await act(async () => {
      resolveReconcile();
    });
    expect(sendMessageSpy).toHaveBeenCalledTimes(2);
    expect(hookValue?.queuedUserMessages).toEqual([]);
  });

  it('recovers through later polling after the reconciliation request fails', async () => {
    await liveTurn();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      fakeReconcileAfterStream.mockRejectedValueOnce(
        new Error('history unavailable'),
      );
      await act(async () => {
        await registeredSend()({ content: 'follow-up' });
        setChatState({ status: 'ready', messages: settledTurn() });
      });
      expect(sendMessageSpy).toHaveBeenCalledTimes(1);
      expect(liveText()).toEqual([FULL]);
      await act(async () => {
        setTranscript([
          { id: 'msg-where is my order?', type: 'USER' },
          { id: 'row-reply', type: 'AI' },
        ]);
      });
      expect(sendMessageSpy).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });

  it('a keepalive on the live stream before the first text renders nothing extra', async () => {
    const keepalive = {
      type: 'data-keepalive',
      data: null,
      transient: true,
    } as const;
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
            parts: [keepalive],
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
            parts: [keepalive, { type: 'text', text: PARTIAL }],
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
