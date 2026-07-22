import type { SendMessageInput, WidgetUserMessage } from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * Regression: the finished turn has TWO possible renderers — the live overlay
 * (`liveItems` → `StreamingTurn`) and the canonical rows the post-turn
 * reconcile ingests — and exactly one must own it at any moment.
 *
 * `useChat` reports 'ready' the instant the stream closes, but the rows are
 * still a fetch away. Dropping `liveItems` on that flip leaves NO renderer for
 * the length of the reconcile: the reply blanks out and flashes back in when
 * the rows land. So the overlay must survive the flip and only stand down once
 * the reconcile has settled.
 */

type ChatState = {
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: unknown[];
};

/** A streamed assistant turn, in the shape `mapUiMessageToItems` consumes. */
const ASSISTANT_TURN = [
  { role: 'assistant', parts: [{ type: 'text', text: 'Hey! What can I help you with today?' }] },
];

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
  appendUserMessageIfAbsent: vi.fn(),
  markUserMessagesDelivered: vi.fn(),
  reconcileAfterStream: vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveReconcile = resolve;
      }),
  ),
  registerAgentHandlers: vi.fn(),
  unregisterAgentHandlers: vi.fn(),
};

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({ token: 't' }),
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

describe('useAgentChat post-stream handoff', () => {
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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the live overlay mounted from the end of the stream until the rows land', async () => {
    await act(async () => {
      await hookValue?.send({ content: 'hey' });
    });
    await act(async () => {
      setChatState({ status: 'streaming', messages: ASSISTANT_TURN });
    });
    expect(hookValue?.isStreaming).toBe(true);
    expect(hookValue?.liveItems).toHaveLength(1);

    // The stream closes. `isStreaming` goes false immediately — but the rows
    // are still in flight, so the overlay must NOT be torn down yet.
    await act(async () => {
      setChatState({ status: 'ready', messages: ASSISTANT_TURN });
    });
    expect(hookValue?.isStreaming).toBe(false);
    expect(hookValue?.liveItems).toHaveLength(1);
    expect(hookValue?.liveItems[0]).toEqual({
      kind: 'text',
      text: 'Hey! What can I help you with today?',
    });

    // Rows ingested → the persisted transcript takes over and the overlay
    // stands down, in the same commit that reveals the canonical row.
    await act(async () => {
      resolveReconcile();
    });
    expect(hookValue?.liveItems).toEqual([]);
  });

  it('holds the overlay through a stopped turn too, not just a completed one', async () => {
    await act(async () => {
      await hookValue?.send({ content: 'hey' });
    });
    await act(async () => {
      setChatState({ status: 'streaming', messages: ASSISTANT_TURN });
    });
    await act(async () => {
      hookValue?.stop();
      setChatState({ status: 'ready', messages: ASSISTANT_TURN });
    });
    // A stopped turn keeps its partial reply on screen while the rows load.
    expect(hookValue?.liveItems).toHaveLength(1);

    await act(async () => {
      resolveReconcile();
    });
    expect(hookValue?.liveItems).toEqual([]);
  });

  it('stands the overlay down when the turn errors and no rows can arrive', async () => {
    await act(async () => {
      await hookValue?.send({ content: 'hey' });
    });
    await act(async () => {
      setChatState({ status: 'streaming', messages: ASSISTANT_TURN });
    });
    await act(async () => {
      setChatState({ status: 'error', messages: ASSISTANT_TURN });
    });
    // The reconcile still runs on an errored turn — hold until it settles.
    expect(hookValue?.liveItems).toHaveLength(1);
    await act(async () => {
      resolveReconcile();
    });
    expect(hookValue?.liveItems).toEqual([]);
  });

  it('does not resurrect the previous turn once the next one is submitted', async () => {
    await act(async () => {
      await hookValue?.send({ content: 'hey' });
    });
    await act(async () => {
      setChatState({ status: 'streaming', messages: ASSISTANT_TURN });
    });
    await act(async () => {
      setChatState({ status: 'ready', messages: ASSISTANT_TURN });
    });
    await act(async () => {
      resolveReconcile();
    });
    expect(hookValue?.liveItems).toEqual([]);

    // Next turn: useChat appends the user message, so the last message is no
    // longer an assistant turn — the overlay stays empty and the typing
    // indicator (which keys off `liveItems.length === 0`) shows instead.
    await act(async () => {
      setChatState({
        status: 'submitted',
        messages: [...ASSISTANT_TURN, { role: 'user', parts: [{ type: 'text', text: 'again' }] }],
      });
    });
    expect(hookValue?.isStreaming).toBe(true);
    expect(hookValue?.liveItems).toEqual([]);
  });
});
