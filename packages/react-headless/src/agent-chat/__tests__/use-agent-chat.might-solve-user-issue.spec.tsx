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

/**
 * The streaming engine drives `lastAIResMightSolveUserIssue` the way the
 * blocking engine does from its send response: reset when the visitor sends,
 * set once from the turn's `finish` metadata. The "This was helpful" prompt
 * and embedders' automations (CSAT triggers) read it.
 */

type ChatState = {
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: UIMessage[];
};

const sendMessageSpy = vi.fn();
let finishStream: ChatOnFinishCallback<UIMessage> = () => {};
let setChatState: (next: ChatState) => void = () => {};

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
      stop: vi.fn(),
      error: undefined,
      clearError: vi.fn(),
      resumeStream: vi.fn(),
    };
  },
}));

vi.mock('../agent-chat-transport', () => ({
  buildAgentChatTransport: () => ({ sendMessages: vi.fn() }),
}));

function buildUserMessage(content: string): WidgetUserMessage {
  return {
    id: `msg-${content}`,
    type: 'USER',
    deliveredAt: null,
    content,
    timestamp: new Date().toISOString(),
    pending: true,
  };
}

const setPartialSpy = vi.fn<(partial: Record<string, unknown>) => void>();
const fakeMessageCtx = {
  state: { setPartial: setPartialSpy },
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
  appendUserMessageIfAbsent: vi.fn(),
  markUserMessageDelivered: vi.fn(),
  notifySendAccepted: vi.fn(),
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
  reconcileAfterStream: vi.fn(() => new Promise<void>(() => {})),
  features: {
    dictation: false,
    attachments: true,
    pageContext: true,
    clientTools: true,
  },
} as unknown as WidgetCtx;

import { useAgentChat } from '../useAgentChat';

const CONFIG = { token: 't' };

let switchSession: (next: string | null) => void = () => {};

function Probe() {
  const [sessionId, setSessionId] = React.useState<string | null>('sess-1');
  switchSession = setSessionId;
  useAgentChat({
    widgetCtx: fakeWidgetCtx,
    config: CONFIG,
    sessionId,
    persistedMessages: [] as WidgetMessageU[],
  });
  return null;
}

const reply = (metadata?: unknown): UIMessage => ({
  id: 'a-live',
  role: 'assistant',
  metadata,
  parts: [{ type: 'text', text: 'Your refund was issued on Monday.' }],
});

/** Every value the hook wrote to the flag, in order. */
const flagWrites = () =>
  setPartialSpy.mock.calls.flatMap(([partial]) =>
    'lastAIResMightSolveUserIssue' in partial
      ? [partial.lastAIResMightSolveUserIssue]
      : [],
  );

describe('useAgentChat — lastAIResMightSolveUserIssue', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Probe />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function streamTurn() {
    await act(async () => {
      await registeredSend()({ content: 'where is my refund?' });
    });
    await act(async () => {
      setChatState({ status: 'streaming', messages: [reply()] });
    });
  }

  async function finish(
    message: UIMessage,
    outcome: {
      isAbort?: boolean;
      isDisconnect?: boolean;
      isError?: boolean;
    } = {},
  ) {
    // One snapshot array, as `useChat` hands the same one to `onFinish` and
    // to its `messages`.
    const messages = [message];
    await act(async () => {
      finishStream({
        message,
        messages,
        isAbort: outcome.isAbort ?? false,
        isDisconnect: outcome.isDisconnect ?? false,
        isError: outcome.isError ?? false,
      });
      setChatState({
        status: outcome.isError ? 'error' : 'ready',
        messages,
      });
    });
  }

  it('resets on send, then sets true from a completed turn that might solve the issue', async () => {
    await streamTurn();
    expect(flagWrites()).toEqual([false]);

    await finish(reply({ mightSolveUserIssue: true }));
    expect(flagWrites()).toEqual([false, true]);
  });

  it('sets false from a completed turn the AI says will not solve the issue', async () => {
    await streamTurn();
    await finish(reply({ mightSolveUserIssue: false }));
    expect(flagWrites()).toEqual([false, false]);
  });

  it('sets false when the turn carried no verdict (withheld reply or older backend)', async () => {
    await streamTurn();
    await finish(reply());
    expect(flagWrites()).toEqual([false, false]);
  });

  it.each([
    ['stopped', { isAbort: true }],
    ['disconnected', { isDisconnect: true }],
    ['failed', { isError: true }],
  ] as const)(
    'leaves the reset in place for a %s turn',
    async (_label, outcome) => {
      await streamTurn();
      // The same verdict sets true on a completed turn (first case above).
      await finish(reply({ mightSolveUserIssue: true }), outcome);
      expect(flagWrites()).toEqual([false]);
    },
  );

  it('a follow-up queued during the turn supersedes its verdict', async () => {
    await streamTurn();
    await act(async () => {
      await registeredSend()({ content: 'and my invoice?' });
    });
    expect(flagWrites()).toEqual([false, false]);

    await finish(reply({ mightSolveUserIssue: true }));
    expect(flagWrites()).toEqual([false, false]);
  });

  it('waits for the throttled snapshot to catch up, then sets the verdict', async () => {
    await streamTurn();
    const message = reply({ mightSolveUserIssue: true });
    const messages = [message];
    await act(async () => {
      finishStream({
        message,
        messages,
        isAbort: false,
        isDisconnect: false,
        isError: false,
      });
      setChatState({ status: 'ready', messages: [reply()] });
    });
    expect(flagWrites()).toEqual([false]);

    await act(async () => {
      setChatState({ status: 'ready', messages });
    });
    expect(flagWrites()).toEqual([false, true]);
  });

  it.each(['sess-2', null])(
    'a finish landing with a switch to %s never marks the new conversation',
    async (nextSessionId) => {
      await streamTurn();
      // The same completion sets true when it stays in its conversation
      // (first case above).
      const message = reply({ mightSolveUserIssue: true });
      await act(async () => {
        finishStream({
          message,
          messages: [message],
          isAbort: false,
          isDisconnect: false,
          isError: false,
        });
        switchSession(nextSessionId);
        setChatState({ status: 'ready', messages: [] });
      });
      expect(flagWrites()).toEqual([false]);
    },
  );
});
