import type {
  SendMessageInput,
  StagedUserTurn,
  WidgetCtx,
  WidgetUserMessage,
} from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression: a FAILED turn must not be rendered as a delivered one.
 *
 * `markUserMessageDelivered()` clears the `pending` flag, which un-dims the
 * user's bubble — the widget's only "your message is still in flight" signal.
 * Calling it on `status === 'error'` meant a send that never reached the server
 * looked exactly like a successful one: bubble solid, no error, no retry, and a
 * reply that never comes.
 *
 * The mid-stream case is deliberately the opposite: once a first chunk has
 * arrived the server demonstrably HAS the message, so a later stream error
 * still leaves it delivered.
 */

type ChatState = {
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: unknown[];
};

const sendMessageSpy = vi.fn();
const stopSpy = vi.fn();
const clearErrorSpy = vi.fn();
let setChatState: (next: ChatState) => void = () => {};

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
      clearError: clearErrorSpy,
    };
  },
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

const fakeReconcileAfterStream = vi.fn(async () => {});

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
  appendUserMessageIfAbsent: vi.fn(),
  markUserMessageDelivered: vi.fn(),
  releaseUnsentOptionPick: vi.fn(),
  setMessageOptionPick: vi.fn(),
  notifySendAccepted: vi.fn((input: SendMessageInput) => input.onAccepted?.()),
  registerAgentHandlers: vi.fn(),
  unregisterAgentHandlers: vi.fn(),
};

// The engine exposes `send` by registering it with MessageCtx (the shared
// `sendMessage` entry point) — drive sends through that seam, like production.
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
    // Session-open turn-sources read. Null = the fetch failed; the hook
    // keeps plain-row rendering.
    getAgentTurnMessages: vi.fn(async () => null),
  },
  messageCtx: fakeMessageCtx,
  reconcileAfterStream: fakeReconcileAfterStream,
  // Org features on, embed silent (WidgetCtx getters).
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
  hookValue = useAgentChat({
    widgetCtx: fakeWidgetCtx,
    config: { token: 't' },
    sessionId: 'sess-1',
    persistedMessages: [],
  });
  return null;
}

describe('useAgentChat failed turn', () => {
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
    if (!hookValue) throw new Error('hook did not render');
    await act(async () => {
      await registeredSend()({ content: 'hi' });
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('does NOT mark messages delivered when the turn errors before any chunk', async () => {
    await act(async () => setChatState({ status: 'submitted', messages: [] }));
    await act(async () => setChatState({ status: 'error', messages: [] }));

    expect(fakeMessageCtx.markUserMessageDelivered).not.toHaveBeenCalled();
  });

  it('DOES mark them delivered when the turn completes normally', async () => {
    await act(async () => setChatState({ status: 'submitted', messages: [] }));
    await act(async () => setChatState({ status: 'ready', messages: [] }));

    expect(fakeMessageCtx.markUserMessageDelivered).toHaveBeenCalledWith(
      'msg-hi',
    );
  });

  it('keeps them delivered when the stream errors AFTER a chunk arrived', async () => {
    await act(async () => setChatState({ status: 'submitted', messages: [] }));
    // First chunk — the server demonstrably has the message.
    await act(async () => setChatState({ status: 'streaming', messages: [] }));
    expect(fakeMessageCtx.markUserMessageDelivered).toHaveBeenCalledTimes(1);

    await act(async () => setChatState({ status: 'error', messages: [] }));
    // Still exactly the one call from the streaming branch — the error path
    // neither re-marks nor un-marks.
    expect(fakeMessageCtx.markUserMessageDelivered).toHaveBeenCalledTimes(1);
  });

  it('clears the in-flight guard on error so the surface is not wedged', async () => {
    await act(async () => setChatState({ status: 'submitted', messages: [] }));
    await act(async () => setChatState({ status: 'error', messages: [] }));

    // A wedged in-flight guard would block every subsequent send for the life
    // of the session, which is worse than the failed turn itself.
    expect(hookValue?.isStreaming).toBe(false);
  });

  it('can retry when the browser has Web Crypto but no crypto.randomUUID', async () => {
    const browserCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: browserCrypto.getRandomValues.bind(browserCrypto),
      subtle: browserCrypto.subtle,
      randomUUID: undefined,
    } satisfies Partial<Crypto>);

    await act(async () => hookValue?.retryFailedTurn());

    expect(hookValue?.queuedUserMessages.map((message) => message.id)).toEqual([
      'msg-hi',
    ]);
  });
});

/**
 * A tap is marked picked when its send is accepted. If that send never
 * reaches the server, the options must come back: otherwise the visitor sees
 * a receipt for an answer nobody received, with the other choices gone.
 */
describe('useAgentChat unsent option taps', () => {
  const tap: SendMessageInput = {
    content: 'Yes',
    optionReply: { messageId: 'question', optionId: 'opt-yes' },
  };
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

  it.each([
    {
      turn: 'fails before its first chunk',
      statuses: ['submitted', 'error'],
      released: true,
    },
    {
      turn: 'fails after a chunk arrived',
      statuses: ['submitted', 'streaming', 'error'],
      released: false,
    },
    { turn: 'completes', statuses: ['submitted', 'ready'], released: false },
    // A later resume of the delivered turn is not the tap's send.
    {
      turn: 'completes, then a resume of it fails before a chunk',
      statuses: ['submitted', 'ready', 'submitted', 'error'],
      released: false,
    },
  ] as const)(
    'a tapped answer whose turn $turn: options released=$released',
    async ({ statuses, released }) => {
      await act(async () => {
        await registeredSend()(tap);
      });
      for (const status of statuses) {
        await act(async () => setChatState({ status, messages: [] }));
      }

      expect(fakeMessageCtx.releaseUnsentOptionPick.mock.calls).toEqual(
        released ? [[tap]] : [],
      );
    },
  );

  it('retrying a failed tap picks its option again', async () => {
    await act(async () => {
      await registeredSend()(tap);
    });
    await act(async () => setChatState({ status: 'submitted', messages: [] }));
    await act(async () => setChatState({ status: 'error', messages: [] }));
    expect(fakeMessageCtx.setMessageOptionPick).not.toHaveBeenCalled();

    await act(async () => hookValue?.retryFailedTurn());

    expect(fakeMessageCtx.setMessageOptionPick).toHaveBeenCalledWith(
      'question',
      'opt-yes',
    );
  });

  it('removing a queued tap gives its options back', async () => {
    await act(async () => {
      await registeredSend()({ content: 'hi' });
    });
    // A turn is live, so the tap waits in the queue.
    await act(async () => setChatState({ status: 'submitted', messages: [] }));
    await act(async () => {
      await registeredSend()(tap);
    });
    expect(hookValue?.queuedUserMessages.map((m) => m.id)).toEqual(['msg-Yes']);
    expect(fakeMessageCtx.releaseUnsentOptionPick).not.toHaveBeenCalled();

    await act(async () => hookValue?.removeQueued('msg-Yes'));

    expect(hookValue?.queuedUserMessages).toEqual([]);
    expect(fakeMessageCtx.releaseUnsentOptionPick.mock.calls).toEqual([[tap]]);
  });
});
