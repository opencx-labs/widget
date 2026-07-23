import type { SendMessageInput, WidgetUserMessage } from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * Regression: a FAILED turn must not be rendered as a delivered one.
 *
 * `markUserMessagesDelivered()` clears the `pending` flag, which un-dims the
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
let setChatState: (next: ChatState) => void = () => {};

vi.mock('@ai-sdk/react', () => ({
  useChat: () => {
    const [state, setState] = React.useState<ChatState>({ status: 'ready', messages: [] });
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
  reconcileAfterStream: vi.fn(async () => {}),
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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('does NOT mark messages delivered when the turn errors before any chunk', async () => {
    await act(async () => setChatState({ status: 'submitted', messages: [] }));
    await act(async () => setChatState({ status: 'error', messages: [] }));

    expect(fakeMessageCtx.markUserMessagesDelivered).not.toHaveBeenCalled();
  });

  it('DOES mark them delivered when the turn completes normally', async () => {
    await act(async () => setChatState({ status: 'submitted', messages: [] }));
    await act(async () => setChatState({ status: 'ready', messages: [] }));

    expect(fakeMessageCtx.markUserMessagesDelivered).toHaveBeenCalled();
  });

  it('keeps them delivered when the stream errors AFTER a chunk arrived', async () => {
    await act(async () => setChatState({ status: 'submitted', messages: [] }));
    // First chunk — the server demonstrably has the message.
    await act(async () => setChatState({ status: 'streaming', messages: [] }));
    expect(fakeMessageCtx.markUserMessagesDelivered).toHaveBeenCalledTimes(1);

    await act(async () => setChatState({ status: 'error', messages: [] }));
    // Still exactly the one call from the streaming branch — the error path
    // neither re-marks nor un-marks.
    expect(fakeMessageCtx.markUserMessagesDelivered).toHaveBeenCalledTimes(1);
  });

  it('clears the in-flight guard on error so the surface is not wedged', async () => {
    await act(async () => setChatState({ status: 'submitted', messages: [] }));
    await act(async () => setChatState({ status: 'error', messages: [] }));

    // A wedged in-flight guard would block every subsequent send for the life
    // of the session, which is worse than the failed turn itself.
    expect(hookValue?.isStreaming).toBe(false);
  });
});
