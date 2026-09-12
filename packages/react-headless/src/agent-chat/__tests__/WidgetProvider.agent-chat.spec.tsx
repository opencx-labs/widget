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
import type { ConnectionRequest } from '../agent-chat-stream';
import { useConnection } from '../useConnection';

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
let latestPendingConnection: ReturnType<
  typeof useAgentChatUi
>['pendingConnection'] = null;
let activeConnection: ReturnType<typeof useConnection> | null = null;

function ConnectionProbe({ request }: { request: ConnectionRequest }) {
  activeConnection = useConnection(request);
  return null;
}

function Probe({ sendInLayout = false }: { sendInLayout?: boolean }) {
  const { sendMessage, messagesState } = useMessages();
  const { isStreaming, pendingConnection } = useAgentChatUi();
  const didSendRef = useRef(false);
  sendFromConsumer = sendMessage;
  latestLifecycle = {
    uiStreaming: isStreaming,
    messagesSending: messagesState.isSendingMessage,
    messagesSendingToAi: messagesState.isSendingMessageToAI,
  };
  latestPendingConnection = pendingConnection;

  useLayoutEffect(() => {
    if (!sendInLayout || didSendRef.current) return;
    didSendRef.current = true;
    void sendMessage({ content: 'imperative' });
  }, [sendInLayout, sendMessage]);
  return pendingConnection ? (
    <ConnectionProbe request={pendingConnection} />
  ) : null;
}

describe('WidgetProvider agent-chat ownership', () => {
  let container: HTMLDivElement;
  let root: Root;
  let fakeWidgetCtx: WidgetCtx;
  let registerAgentHandlers: ReturnType<typeof vi.fn>;
  let unregisterAgentHandlers: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    activeConnection = null;
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
      const sessionId = sessionState.get().session?.id ?? 'sess-new';
      if (!sessionState.get().session) {
        sessionState.setPartial({ session: { id: sessionId } });
      }
      return { sessionId, userMessage, initialMessages: [] };
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
      draftState: new PrimitiveState({ text: '', mentions: [] }),
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
      config: { token: 't' },
      dispose: vi.fn(),
      streaming: true,
      agent: {},
      contactCtx: { shouldCollectData: () => false },
      sessionCtx: {
        sessionState,
        sessionsState: new PrimitiveState({ data: [] }),
        restoreActiveSessionTracking: vi.fn(),
        trackActiveSession: vi.fn(),
      },
      messageCtx,
      uploadCtx: { state: new PrimitiveState([]) },
      routerCtx: { state: new PrimitiveState({ screen: 'chat' }) },
      api: {
        setAuthToken: vi.fn(),
        getStreamTransportOptions: () => ({
          api: 'http://test/chat',
          reconnectApi: (id: string) => `http://test/chat/${id}`,
          headers: {},
        }),
        stopStream: vi.fn(async () => {}),
        getAgentTurnMessages: vi.fn(async () => null),
        startConnection: vi.fn(),
        getConnectionAttempt: vi.fn(),
        disconnectConnection: vi.fn(),
      },
      reconcileAfterStream: vi.fn(async () => {}),
      resetChat: vi.fn(),
      releaseConversation: vi.fn(),
      createConversation: vi.fn(),
      // Org features on, embed silent (`WidgetCtx.features`).
      features: {
        dictation: false,
        attachments: true,
        pageContext: true,
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

  const renderProvider = async (
    sendInLayout = false,
    displayMode?: 'companion',
  ) => {
    await act(async () => {
      root.render(
        <WidgetProvider
          options={{ token: 't', displayMode }}
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

  it('keeps a connection request active while an ordinary message starts', async () => {
    fakeWidgetCtx.sessionCtx.sessionState.setPartial({
      session: {
        id: 'sess-existing',
        ticketNumber: 1,
        title: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isHandedOff: false,
        isOpened: true,
        assignee: { kind: 'ai', name: null, avatarUrl: null },
        channel: '',
        isVerified: true,
        lastMessage: null,
        modeId: null,
        latestStateCheckpointPayload: null,
        sessionAttributes: {},
        customStatus: null,
      },
    });
    vi.mocked(fakeWidgetCtx.api.getAgentTurnMessages).mockResolvedValue({
      handled_connection_request_ids: [],
      turns: [
        {
          turn_id: 'turn-connect',
          message_uuids: ['agent-row'],
          ui_parts: [
            {
              type: 'dynamic-tool',
              state: 'output-available',
              toolName: 'list_issues',
              output: {
                connection_required: {
                  request_id: 'b1111111-1111-4111-8111-111111111111',
                  server_id: 'a1111111-1111-4111-8111-111111111111',
                  name: 'Bookkeeping',
                },
              },
            },
          ],
        },
      ],
    });
    await renderProvider();
    await vi.waitFor(() =>
      expect(latestPendingConnection?.name).toBe('Bookkeeping'),
    );

    await act(async () => {
      await sendFromConsumer({ content: 'Another question' });
    });
    expect(latestPendingConnection?.request_id).toBe(
      'b1111111-1111-4111-8111-111111111111',
    );
  });

  it('provides the active connection controller to companion children', async () => {
    fakeWidgetCtx.sessionCtx.sessionState.setPartial({
      session: {
        id: 'sess-companion',
        ticketNumber: 1,
        title: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isHandedOff: false,
        isOpened: true,
        assignee: { kind: 'ai', name: null, avatarUrl: null },
        channel: '',
        isVerified: true,
        lastMessage: null,
        modeId: null,
        latestStateCheckpointPayload: null,
        sessionAttributes: {},
        customStatus: null,
      },
    });
    vi.mocked(fakeWidgetCtx.api.getAgentTurnMessages).mockResolvedValue({
      handled_connection_request_ids: [],
      turns: [
        {
          turn_id: 'turn-connect',
          message_uuids: ['agent-row'],
          ui_parts: [
            {
              type: 'dynamic-tool',
              state: 'output-available',
              toolName: 'list_issues',
              output: {
                connection_required: {
                  request_id: 'b1111111-1111-4111-8111-111111111111',
                  server_id: 'a1111111-1111-4111-8111-111111111111',
                  name: 'Bookkeeping',
                },
              },
            },
          ],
        },
      ],
    });

    await renderProvider(false, 'companion');
    await vi.waitFor(() =>
      expect(activeConnection?.request.name).toBe('Bookkeeping'),
    );
  });

  it('does not restore a connection handled by an accepted continuation turn', async () => {
    const requestId = 'b1111111-1111-4111-8111-111111111111';
    fakeWidgetCtx.sessionCtx.sessionState.setPartial({
      session: {
        id: 'sess-restored',
        ticketNumber: 1,
        title: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isHandedOff: false,
        isOpened: true,
        assignee: { kind: 'ai', name: null, avatarUrl: null },
        channel: '',
        isVerified: true,
        lastMessage: null,
        modeId: null,
        latestStateCheckpointPayload: null,
        sessionAttributes: {},
        customStatus: null,
      },
    });
    vi.mocked(fakeWidgetCtx.api.getAgentTurnMessages).mockResolvedValue({
      handled_connection_request_ids: [requestId],
      turns: [
        {
          turn_id: 'turn-connect',
          message_uuids: ['agent-row-connect'],
          ui_parts: [
            {
              type: 'dynamic-tool',
              state: 'output-available',
              toolName: 'account',
              output: {
                connection_required: {
                  request_id: requestId,
                  server_id: 'a1111111-1111-4111-8111-111111111111',
                  name: 'Bookkeeping',
                },
              },
            },
          ],
        },
        {
          turn_id: 'turn-resumed',
          message_uuids: ['agent-row-result'],
          ui_parts: [
            {
              type: 'dynamic-tool',
              state: 'output-available',
              toolName: 'mcp_a5de1b5e497caeaf__account',
              output: { account: 'connected-owner' },
            },
            { type: 'text', text: 'Your account is connected.' },
          ],
        },
      ],
    });

    await renderProvider();
    await vi.waitFor(() =>
      expect(fakeWidgetCtx.api.getAgentTurnMessages).toHaveBeenCalledWith(
        'sess-restored',
      ),
    );
    await act(async () => Promise.resolve());
    expect(latestPendingConnection).toBeNull();
    expect(activeConnection).toBeNull();
  });

  it('promotes a newer connection after the active request is accepted', async () => {
    const first = {
      request_id: 'b1111111-1111-4111-8111-111111111111',
      server_id: 'a1111111-1111-4111-8111-111111111111',
      name: 'Bookkeeping',
    };
    const second = {
      request_id: 'b2222222-2222-4222-8222-222222222222',
      server_id: 'a2222222-2222-4222-8222-222222222222',
      name: 'CRM',
    };
    fakeWidgetCtx.sessionCtx.sessionState.setPartial({
      session: {
        id: 'sess-existing',
        ticketNumber: 1,
        title: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isHandedOff: false,
        isOpened: true,
        assignee: { kind: 'ai', name: null, avatarUrl: null },
        channel: '',
        isVerified: true,
        lastMessage: null,
        modeId: null,
        latestStateCheckpointPayload: null,
        sessionAttributes: {},
        customStatus: null,
      },
    });
    vi.mocked(fakeWidgetCtx.api.getAgentTurnMessages).mockResolvedValue({
      handled_connection_request_ids: [],
      turns: [
        {
          turn_id: 'turn-connect-a',
          message_uuids: ['agent-row-a'],
          ui_parts: [
            {
              type: 'dynamic-tool',
              state: 'output-available',
              toolName: 'list_issues',
              output: { connection_required: first },
            },
          ],
        },
      ],
    });
    await renderProvider();
    await vi.waitFor(() =>
      expect(latestPendingConnection?.request_id).toBe(first.request_id),
    );

    await act(async () => {
      setChatState({
        status: 'streaming',
        messages: [
          {
            id: 'assistant-b',
            role: 'assistant',
            parts: [
              {
                type: 'dynamic-tool',
                state: 'output-available',
                toolName: 'list_contacts',
                output: { connection_required: second },
              },
            ],
          },
        ],
      });
    });
    expect(latestPendingConnection?.request_id).toBe(first.request_id);
    if (!activeConnection) throw new Error('Connection controller not mounted');
    await act(async () => activeConnection?.cancel());
    await vi.waitFor(() =>
      expect(latestPendingConnection?.request_id).toBe(second.request_id),
    );
  });

  it('unregisters the engine handler with the provider lifecycle', async () => {
    await renderProvider();
    act(() => root.unmount());
    expect(unregisterAgentHandlers).toHaveBeenCalledOnce();
  });

  it.each(['new', 'existing'] as const)(
    'keeps a pending connection out of a different %s session',
    async (destination) => {
      const request = {
        request_id: 'b1111111-1111-4111-8111-111111111111',
        server_id: 'a1111111-1111-4111-8111-111111111111',
        name: 'Bookkeeping',
      };
      vi.mocked(fakeWidgetCtx.api.getAgentTurnMessages).mockResolvedValueOnce({
        handled_connection_request_ids: [],
        turns: [
          {
            turn_id: 'turn-connect',
            message_uuids: ['agent-row'],
            ui_parts: [
              {
                type: 'dynamic-tool',
                state: 'output-available',
                toolName: 'list_issues',
                output: { connection_required: request },
              },
            ],
          },
        ],
      });
      await renderProvider();
      await act(async () => sendFromConsumer({ content: 'Show my issues' }));
      expect(latestPendingConnection).toEqual(request);
      const originalSession =
        fakeWidgetCtx.sessionCtx.sessionState.get().session;
      if (!originalSession) throw new Error('Session was not created');
      await act(async () => {
        fakeWidgetCtx.sessionCtx.sessionState.setPartial({
          session:
            destination === 'new'
              ? null
              : { ...originalSession, id: 'sess-other' },
        });
        fakeWidgetCtx.messageCtx.state.setPartial({ messages: [] });
      });
      expect(latestPendingConnection).toBeNull();
      expect(fakeWidgetCtx.api.startConnection).not.toHaveBeenCalled();
      if (destination === 'new') {
        // useChat retains its previous instance when the session id becomes
        // undefined. A trailing stream update must not revive its controls.
        await act(async () =>
          setChatState({
            status: 'streaming',
            messages: [
              {
                role: 'assistant',
                parts: [
                  {
                    type: 'dynamic-tool',
                    state: 'output-available',
                    toolName: 'list_issues',
                    output: {
                      connection_required: {
                        ...request,
                        request_id: 'b2222222-2222-4222-8222-222222222222',
                      },
                    },
                  },
                ],
              },
            ],
          }),
        );
        expect(latestPendingConnection).toBeNull();
      }
    },
  );
});
