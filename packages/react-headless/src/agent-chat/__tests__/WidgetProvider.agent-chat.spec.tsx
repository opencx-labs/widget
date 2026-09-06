import {
  PrimitiveState,
  WidgetCtx,
  type SendMessageInput,
  type WidgetMessageU,
  type WidgetUserMessage,
} from '@opencx/widget-core';
import React, { act, useLayoutEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WidgetProvider } from '../../WidgetProvider';
import { useMessages } from '../../hooks/useMessages';
import { useAgentChatUi } from '../AgentChatContext';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type ChatState = {
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: unknown[];
};

type AgentChatHandlers = {
  send: (input: SendMessageInput) => Promise<void> | void;
};

const sendMessageSpy = vi.fn(
  async (_message: { text: string }, _options?: unknown) => {},
);
const stopSpy = vi.fn();
let setChatState: (state: ChatState) => void = () => {};

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

const buildUserMessage = (content: string): WidgetUserMessage => ({
  id: `msg-${content}`,
  type: 'USER',
  content,
  timestamp: new Date().toISOString(),
  pending: true,
});

let sendFromConsumer: (
  input: SendMessageInput,
) => Promise<void> = async () => {};
let latestLifecycle = {
  uiStreaming: false,
  messagesSending: false,
  messagesSendingToAi: false,
};

function Probe({ sendInLayout = false }: { sendInLayout?: boolean }) {
  const { sendMessage, messagesState } = useMessages();
  const { isStreaming } = useAgentChatUi();
  const didSendRef = useRef(false);
  sendFromConsumer = sendMessage;
  latestLifecycle = {
    uiStreaming: isStreaming,
    messagesSending: messagesState.isSendingMessage,
    messagesSendingToAi: messagesState.isSendingMessageToAI,
  };

  useLayoutEffect(() => {
    if (!sendInLayout || didSendRef.current) return;
    didSendRef.current = true;
    void sendMessage({ content: 'imperative' });
  }, [sendInLayout, sendMessage]);
  return null;
}

describe('WidgetProvider agent-chat ownership', () => {
  let container: HTMLDivElement;
  let root: Root;
  let fakeWidgetCtx: WidgetCtx;
  let registerAgentHandlers: ReturnType<typeof vi.fn>;
  let unregisterAgentHandlers: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const messageState = new PrimitiveState({
      messages: [] as WidgetMessageU[],
      isSendingMessage: false,
      isSendingMessageToAI: false,
      lastAIResMightSolveUserIssue: false,
      isInitialFetchLoading: false,
    });
    const sessionState = new PrimitiveState({
      session: null as { id: string } | null,
      isCreatingSession: false,
      isResolvingSession: false,
    });
    let handlers: AgentChatHandlers | null = null;
    const buffered: SendMessageInput[] = [];

    const stageUserTurn = vi.fn(async (input: SendMessageInput) => {
      const userMessage = buildUserMessage(input.content);
      messageState.setPartial({
        messages: [...messageState.get().messages, userMessage],
      });
      sessionState.setPartial({ session: { id: 'sess-new' } });
      return { sessionId: 'sess-new', userMessage, initialMessages: [] };
    });
    registerAgentHandlers = vi.fn((next: AgentChatHandlers) => {
      handlers = next;
      const pending = buffered.splice(0);
      pending.forEach((input) => void Promise.resolve(next.send(input)));
    });
    unregisterAgentHandlers = vi.fn((current: AgentChatHandlers) => {
      if (handlers === current) handlers = null;
    });
    const messageCtx = {
      state: messageState,
      sendMessage: vi.fn(async (input: SendMessageInput) => {
        if (!handlers) {
          buffered.push(input);
          return;
        }
        await handlers.send(input);
      }),
      stageUserTurn,
      buildQueuedUserMessage: vi.fn((input: SendMessageInput) => ({
        sessionId: sessionState.get().session?.id ?? 'sess-new',
        userMessage: buildUserMessage(input.content),
      })),
      appendUserMessageIfAbsent: vi.fn(),
      markUserMessageDelivered: vi.fn(),
      notifySendAccepted: vi.fn((input: SendMessageInput) =>
        input.onAccepted?.(),
      ),
      registerAgentHandlers,
      unregisterAgentHandlers,
      rememberSentText: vi.fn(),
      getSentTextHistory: vi.fn(() => []),
    };

    fakeWidgetCtx = {
      streaming: true,
      sessionCtx: { sessionState },
      messageCtx,
      api: {
        getStreamTransportOptions: () => ({
          api: 'http://test/chat',
          reconnectApi: (id: string) => `http://test/chat/${id}`,
          headers: {},
        }),
        stopStream: vi.fn(async () => {}),
        getAgentTurnMessages: vi.fn(async () => null),
      },
      reconcileAfterStream: vi.fn(async () => {}),
      // Org features on, embed silent (`WidgetCtx.features`).
      features: {
        dictation: false,
        attachments: true,
        pageContext: true,
        pageMarks: true,
        clientTools: true,
      },
    } as unknown as WidgetCtx;
    vi.spyOn(WidgetCtx, 'initialize').mockResolvedValue(fakeWidgetCtx);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const renderProvider = async (sendInLayout = false) => {
    await act(async () => {
      root.render(
        <WidgetProvider
          options={{ token: 't' }}
          components={[{ key: 'fallback', component: () => null }]}
        >
          <Probe sendInLayout={sendInLayout} />
        </WidgetProvider>,
      );
    });
    await vi.waitFor(() =>
      expect(registerAgentHandlers).toHaveBeenCalledOnce(),
    );
  };

  it('routes useMessages.sendMessage through the provider-owned engine', async () => {
    await renderProvider();
    await act(async () => {
      await sendFromConsumer({ content: 'headless' });
    });

    await vi.waitFor(() => expect(sendMessageSpy).toHaveBeenCalledOnce());
    expect(sendMessageSpy.mock.calls[0]?.[0]).toEqual({ text: 'headless' });
  });

  it('buffers a layout-time imperative send until engine handlers register', async () => {
    await renderProvider(true);

    await vi.waitFor(() => expect(sendMessageSpy).toHaveBeenCalledOnce());
    expect(sendMessageSpy.mock.calls[0]?.[0]).toEqual({ text: 'imperative' });
  });

  it('keeps useMessages lifecycle flags aligned with agent streaming state', async () => {
    await renderProvider();
    await act(async () => {
      setChatState({ status: 'streaming', messages: [] });
    });
    expect(latestLifecycle).toEqual({
      uiStreaming: true,
      messagesSending: true,
      messagesSendingToAi: true,
    });

    await act(async () => {
      setChatState({ status: 'ready', messages: [] });
    });
    expect(latestLifecycle).toEqual({
      uiStreaming: false,
      messagesSending: false,
      messagesSendingToAi: false,
    });
  });

  it('unregisters the engine handler with the provider lifecycle', async () => {
    await renderProvider();
    act(() => root.unmount());
    expect(unregisterAgentHandlers).toHaveBeenCalledOnce();
  });
});
