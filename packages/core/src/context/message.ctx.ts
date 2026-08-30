import { ApiCaller } from '../api/api-caller';
import type { WidgetConfig } from '../types/widget-config';
import {
  type WidgetAiMessage,
  type WidgetMessageU,
  type WidgetUserMessage,
} from '../types/messages';
import type {
  MessageAttachmentType,
  SendMessageDto,
  SendMessageOutputDto,
} from '../types/dtos';
import { PrimitiveState } from '../utils/PrimitiveState';
import { genUuid } from '../utils/uuid';
import { SessionCtx } from './session.ctx';
import type { ContactCtx } from './contact.ctx';

/** The shape a caller passes to `sendMessage` (and `beginAgentTurn`). */
export type SendMessageInput = {
  content: SendMessageDto['content'];
  attachments?: SendMessageDto['attachments'];
  customData?: SendMessageDto['custom_data'];
  /**
   * Per-message AI-visible context (e.g. the composer's picked page elements),
   * merged over the config-level `context` on the wire.
   */
  clientContext?: Record<string, unknown>;
  exitModePrompt?: string;
  /**
   * Signals that the send has passed validation, has a session, and is owned
   * by a send engine. This lets composers clear immediately without changing
   * the existing blocking `sendMessage` promise (which still waits for a bot
   * reply). It is lifecycle-only and is never sent over the wire.
   *
   * @internal
   */
  onAccepted?: () => void;
};

/** Internal outcome from the headless streaming engine's send seam. */
export type AgentChatSendResult =
  | { accepted: true }
  | {
      accepted: false;
      reason:
        | 'awaiting-reply'
        | 'queue-full'
        | 'preparation-failed'
        | 'conversation-changed';
    };

/**
 * The seam the headless agent-chat provider registers so the shared
 * `sendMessage` entry point routes to its `useChat` streaming engine. Core
 * stays framework-neutral and owns only the blocking bot-chat path plus the
 * shared persisted message list.
 */
export type AgentChatHandlers = {
  send: (
    input: SendMessageInput,
  ) => AgentChatSendResult | Promise<AgentChatSendResult | void> | void;
};

/**
 * The per-message wire context shared by both send engines: the config-level
 * `context`/`messageCustomData` merged under the per-send values.
 */
export const mergeSendContext = (
  config: WidgetConfig,
  input: SendMessageInput,
): {
  clientContext: Record<string, unknown> | undefined;
  custom_data: Record<string, unknown>;
} => {
  // Function-form context resolves at SEND time — an SPA's current page, not
  // the page the widget initialized on. A throwing getter degrades to no
  // context rather than blocking the send.
  const configContext = resolveConfigContext(config);
  return {
    clientContext: input.clientContext
      ? { ...configContext, ...input.clientContext }
      : configContext,
    custom_data: {
      ...(config.messageCustomData || {}),
      ...(input.customData || {}),
    },
  };
};

export const resolveConfigContext = (
  config: WidgetConfig,
): Record<string, unknown> | undefined => {
  if (typeof config.context !== 'function') return config.context;
  try {
    return config.context();
  } catch (err) {
    console.error('widget context getter threw; sending without context', err);
    return undefined;
  }
};

type MessageCtxState = {
  messages: WidgetMessageU[];
  /** Regardless of assignee */
  isSendingMessage: boolean;
  isSendingMessageToAI: boolean;
  lastAIResMightSolveUserIssue: boolean;
  isInitialFetchLoading: boolean;
};

export class MessageCtx {
  private config: WidgetConfig;
  private api: ApiCaller;
  private contactCtx: ContactCtx;
  private sessionCtx: SessionCtx;

  public state = new PrimitiveState<MessageCtxState>({
    messages: [],
    isSendingMessage: false,
    isSendingMessageToAI: false,
    lastAIResMightSolveUserIssue: false,
    isInitialFetchLoading: false,
  });

  /**
   * The embed is bound to an agents-platform agent — turns stream over the
   * AI SDK `useChat` surface instead of the blocking send. A widget is
   * agent-bound for its whole lifetime.
   */
  public readonly agentBound: boolean;

  /** Registered by the headless agent engine for the WidgetProvider lifetime. */
  private agentHandlers: AgentChatHandlers | null = null;

  /** Sends issued before the agent-chat surface mounts, oldest first. */
  private bufferedAgentSends: SendMessageInput[] = [];

  private sendMessageAbortController = new AbortController();

  private messageIdsDispatchedToOnMessageReceivedHook = new Set<string>();

  /**
   * Text of messages sent in THIS conversation, oldest first, for the
   * composer's ↑/↓ recall. Lives here rather than in the composer because the
   * quick-ask bar and the full chat composer are different mounts of the same
   * component and recall must survive the morph between them — while staying
   * scoped to one widget instance and one conversation (`reset` clears it, so
   * a new chat never recalls the previous visitor's or session's text).
   * Deliberately NOT part of `state`: nothing renders it, so it must not
   * re-render the transcript on every send.
   */
  private sentTextHistory: string[] = [];
  private static readonly SENT_TEXT_HISTORY_MAX = 50;

  constructor({
    config,
    api,
    sessionCtx,
    contactCtx,
    agentBound,
  }: {
    config: WidgetConfig;
    api: ApiCaller;
    sessionCtx: SessionCtx;
    contactCtx: ContactCtx;
    agentBound: boolean;
  }) {
    this.config = config;
    this.api = api;
    this.sessionCtx = sessionCtx;
    this.contactCtx = contactCtx;
    this.agentBound = agentBound;
  }

  reset = () => {
    this.sendMessageAbortController.abort('Resetting chat');
    this.bufferedAgentSends = [];
    this.state.reset();
    this.messageIdsDispatchedToOnMessageReceivedHook.clear();
    this.sentTextHistory = [];
  };

  /**
   * Record sent text for ↑/↓ recall. Consecutive duplicates collapse — the
   * common case is re-sending the same line after a failure.
   */
  rememberSentText = (text: string): void => {
    const trimmed = text.trim();
    if (!trimmed || this.sentTextHistory.at(-1) === trimmed) return;
    this.sentTextHistory.push(trimmed);
    if (this.sentTextHistory.length > MessageCtx.SENT_TEXT_HISTORY_MAX) {
      this.sentTextHistory.shift();
    }
  };

  /** Sent text for this conversation, oldest first. */
  getSentTextHistory = (): readonly string[] => this.sentTextHistory;

  /**
   * Wiring for the headless agent engine: WidgetProvider registers its useChat
   * `send` here and clears it on unmount, so every agent-bound headless or
   * styled consumer shares the same lifecycle. Imperative sends can arrive in
   * the render gap before registration; drain those in FIFO order once ready.
   */
  registerAgentHandlers = (handlers: AgentChatHandlers): void => {
    this.agentHandlers = handlers;
    const buffered = this.bufferedAgentSends;
    this.bufferedAgentSends = [];
    buffered.forEach((input) => {
      try {
        void Promise.resolve(handlers.send(input)).catch((err: unknown) => {
          console.error('[opencx] buffered agent-chat send failed', err);
        });
      } catch (err) {
        console.error('[opencx] buffered agent-chat send failed', err);
      }
    });
  };

  unregisterAgentHandlers = (handlers: AgentChatHandlers): void => {
    // Only clear if we still own them — guards a late unmount racing a remount.
    if (this.agentHandlers === handlers) this.agentHandlers = null;
  };

  /**
   * Fires `config.hooks.onMessageReceived` for AI or human-agent messages exactly
   * once per id. Safe to call from any path that ingests messages from the server
   * (send-message response, polling, initial history fetch).
   */
  dispatchToOnMessageReceivedHook = (message: WidgetMessageU): void => {
    if (message.type === 'USER') return;
    if (this.messageIdsDispatchedToOnMessageReceivedHook.has(message.id))
      return;
    const session = this.sessionCtx.sessionState.get().session;
    if (!session) return;
    this.messageIdsDispatchedToOnMessageReceivedHook.add(message.id);
    this.config.hooks?.onMessageReceived?.({ message, session });
  };

  /**
   * Records the given message ids as already-dispatched without firing the hook.
   * Used to suppress `onMessageReceived` for historical messages that flow in
   * when an existing session is opened — the user is loading context, not
   * receiving new messages. Subsequent polls still dedupe against these ids.
   */
  markAsDispatchedToOnMessageReceivedHook = (messageIds: string[]): void => {
    messageIds.forEach((id) =>
      this.messageIdsDispatchedToOnMessageReceivedHook.add(id),
    );
  };

  /**
   * On the very first turn of a fresh conversation, the configured persistent
   * initial messages are inserted into the transcript above the user's first
   * message (and posted to the backend so they persist in history). Any later
   * turn returns an empty array.
   */
  private buildPersistentInitialMessages = (): WidgetAiMessage[] => {
    const shouldInsert =
      !this.sessionCtx.sessionState.get().session?.id &&
      this.state.get().messages.length === 0 &&
      this.config.advancedInitialMessages?.some((m) => m.persistent);
    if (!shouldInsert) return [];
    return (this.config.advancedInitialMessages || [])
      .filter((m) => m.persistent)
      .map(
        (m) =>
          ({
            id: genUuid(),
            component: 'bot_message',
            type: 'AI',
            timestamp: new Date().toISOString(),
            data: { message: m.message },
            agent: this.config.bot
              ? { ...this.config.bot, isAi: true, id: null }
              : undefined,
          }) satisfies WidgetAiMessage,
      );
  };

  /**
   * Create the session on the conversation's first send; refreshes the
   * sessions list so the new session shows up immediately. Returns `null`
   * when creation fails.
   */
  private ensureSessionId = async (): Promise<string | null> => {
    if (!this.sessionCtx.sessionState.get().session?.id) {
      const createdSession = await this.sessionCtx.createSession();
      if (!createdSession) {
        console.error('Failed to create session');
        return null;
      }
      void this.sessionCtx.refreshSessions();
    }
    return this.sessionCtx.sessionState.get().session?.id ?? null;
  };

  /** Remove only this failed attempt's optimistic rows, preserving poll merges. */
  private rollbackOptimisticMessages = (
    messageIds: readonly string[],
  ): void => {
    if (messageIds.length === 0) return;
    const ids = new Set(messageIds);
    const messages = this.state.get().messages;
    const nextMessages = messages.filter((message) => !ids.has(message.id));
    if (nextMessages.length !== messages.length) {
      this.state.setPartial({ messages: nextMessages });
    }
  };

  /** A consumer callback must never be able to break an accepted send. */
  private notifySendAccepted = (input: SendMessageInput): void => {
    try {
      input.onAccepted?.();
    } catch (error) {
      console.error('[opencx] send acceptance callback failed', error);
    }
  };

  /**
   * Front-half of an agent-chat send, shared by the composer and every other
   * send caller via the registered handler: validate, optimistically render
   * the user message (plus any persistent initial messages on the first
   * turn), and ensure a session exists. The `useAgentChat` hook then streams
   * the reply through useChat. Returns `null` when there is nothing to send.
   */
  beginAgentTurn = async (
    input: SendMessageInput,
  ): Promise<{
    sessionId: string;
    userMessage: WidgetUserMessage;
    initialMessages?: WidgetAiMessage[];
  } | null> => {
    const userMessage = this.prepareAgentUserMessage(input);
    if (!userMessage) return null;

    const insertableInitialMessages = this.buildPersistentInitialMessages();
    const optimisticMessageIds = [
      ...insertableInitialMessages.map((message) => message.id),
      userMessage.id,
    ];
    this.state.setPartial({
      messages: [
        ...insertableInitialMessages,
        ...this.state.get().messages,
        userMessage,
      ],
    });

    let sessionId: string | null;
    try {
      sessionId = await this.ensureSessionId();
    } catch (error) {
      this.rollbackOptimisticMessages(optimisticMessageIds);
      throw error;
    }
    if (!sessionId) {
      this.rollbackOptimisticMessages(optimisticMessageIds);
      return null;
    }

    return {
      sessionId,
      userMessage,
      initialMessages: insertableInitialMessages,
    };
  };

  /**
   * Build the user message for a QUEUED (multi-send) turn WITHOUT rendering
   * it into the transcript. A queued message must not appear above the still-
   * streaming response of the active turn — the surface renders it below the
   * live overlay (dimmed via `pending`) and only `appendUserMessageIfAbsent`s
   * it into `messages` when its own turn actually starts (see `useAgentChat`).
   * A session already exists here (a turn is in flight), so this never creates
   * one.
   */
  buildQueuedUserMessage = (
    input: SendMessageInput,
  ): { sessionId: string; userMessage: WidgetUserMessage } | null => {
    const userMessage = this.prepareAgentUserMessage(input);
    if (!userMessage) return null;
    const sessionId = this.sessionCtx.sessionState.get().session?.id;
    if (!sessionId) return null;
    return { sessionId, userMessage };
  };

  /**
   * Shared front-half of both agent-chat send paths: validate the input and build the
   * user message, `pending` until the turn's answer starts streaming (the UI
   * dims the bubble; the engine clears the flag via
   * `markUserMessageDelivered`). Returns `null` when there is nothing to send.
   */
  private prepareAgentUserMessage = (
    input: SendMessageInput,
  ): WidgetUserMessage | null => {
    if (
      !input.content.trim() &&
      (!input.attachments || input.attachments.length === 0)
    ) {
      console.warn('Cannot send an empty message of no content or attachments');
      return null;
    }
    return {
      ...this.toUserMessage(
        input.content.trim(),
        input.attachments || undefined,
        MessageCtx.markedElementNames(input.clientContext),
      ),
      pending: true,
    };
  };

  /**
   * Defensive read of `clientContext.page_marks` → display names for the user
   * bubble's context chips: each mark contributes the element it was placed
   * on. Entries without a usable name are dropped.
   */
  private static markedElementNames(
    clientContext: Record<string, unknown> | undefined,
  ): Array<{ name: string }> | undefined {
    const raw = clientContext?.['page_marks'];
    if (!Array.isArray(raw)) return undefined;
    const names = raw.flatMap((mark: unknown): Array<{ name: string }> => {
      if (typeof mark !== 'object' || mark === null) return [];
      const elements: unknown = (mark as { elements?: unknown }).elements;
      const first = Array.isArray(elements) ? elements[0] : undefined;
      const name: unknown =
        typeof first === 'object' && first !== null && 'name' in first
          ? (first as { name: unknown }).name
          : undefined;
      return typeof name === 'string' && name.length > 0 ? [{ name }] : [];
    });
    return names.length > 0 ? names : undefined;
  }

  /** Append a user message to the transcript once, ignoring a duplicate id. */
  appendUserMessageIfAbsent = (userMessage: WidgetUserMessage): void => {
    const messages = this.state.get().messages;
    if (messages.some((m) => m.id === userMessage.id)) return;
    this.state.setPartial({ messages: [...messages, userMessage] });
  };

  /**
   * Clear the `pending` flag for the user message owned by one streamed turn.
   * Later queued bubbles must remain pending until their own turn reaches the
   * server.
   */
  markUserMessageDelivered = (messageId: string): void => {
    const messages = this.state.get().messages;
    const index = messages.findIndex(
      (message) =>
        message.id === messageId && message.type === 'USER' && message.pending,
    );
    if (index === -1) return;
    const delivered = messages[index];
    if (!delivered || delivered.type !== 'USER') return;
    const nextMessages = [...messages];
    nextMessages[index] = { ...delivered, pending: false };
    this.state.setPartial({
      messages: nextMessages,
    });
  };

  /**
   * @deprecated Use `markUserMessageDelivered(messageId)` so delivery is tied
   * to one turn. Kept for consumers compiled against the pre-v5 public class.
   */
  markUserMessagesDelivered = (): void => {
    const messages = this.state.get().messages;
    if (
      !messages.some((message) => message.type === 'USER' && message.pending)
    ) {
      return;
    }
    this.state.setPartial({
      messages: messages.map((message) =>
        message.type === 'USER' && message.pending
          ? { ...message, pending: false }
          : message,
      ),
    });
  };

  sendMessage = async (input: SendMessageInput): Promise<void> => {
    // Agent-bound: the headless useChat engine owns the whole turn lifecycle
    // (optimistic render, streaming, interrupt-send, stop). An imperative
    // `newChat({ message })` can send before that surface's mount effect, so
    // retain the input until handlers register instead of dropping it.
    if (this.agentBound) {
      if (!this.agentHandlers) {
        this.bufferedAgentSends.push(input);
        return;
      }
      await this.agentHandlers.send(input);
      return;
    }

    let localAbortController: AbortController | undefined;
    try {
      /* ------------------------------------------------------ */
      /*         Prevent sending if there is no content         */
      /* ------------------------------------------------------ */
      if (
        !input.content.trim() &&
        (!input.attachments || input.attachments.length === 0)
      ) {
        console.warn(
          'Cannot send an empty message of no content or attachments',
        );
        return;
      }
      /* ------------------------------------------------------ */
      /*        Prevent sending while waiting for AI res        */
      /* ------------------------------------------------------ */
      const session = this.sessionCtx.sessionState.get().session;
      const assignee = session?.assignee.kind;
      const isAssignedToAI = assignee === 'ai';
      const isSendingToAI = this.state.get().isSendingMessageToAI;
      const lastMessage = this.state.get().messages.at(-1);
      const blockWhileAwaitingAI =
        this.config.disableSendingWhenAwaitingAIReply !== false;

      if (
        blockWhileAwaitingAI &&
        (isSendingToAI ||
          // If last message is from user, then bot response did not arrive yet
          (isAssignedToAI && lastMessage?.type === 'USER'))
      ) {
        console.warn('Cannot send messages while awaiting AI response');
        return;
      }

      /* ------------------------------------------------------ */
      /*                          Start                         */
      /* ------------------------------------------------------ */
      // Abort any prior in-flight send so only the latest call is awaited.
      // We rely on aggressive polling to recover any messages whose responses
      // we drop here.
      this.sendMessageAbortController.abort('Superseded by a newer message');
      this.sendMessageAbortController = new AbortController();
      localAbortController = this.sendMessageAbortController;
      this.state.setPartial({
        lastAIResMightSolveUserIssue: false,
        isSendingMessage: true,
        isSendingMessageToAI: !!isAssignedToAI || !session,
      });
      /* ------------------------------------------------------ */
      /*     Optimistically add message to rendered messages    */
      /* ------------------------------------------------------ */
      const insertableInitialMessages = this.buildPersistentInitialMessages();
      const userMessage = this.toUserMessage(
        input.content.trim(),
        input.attachments || undefined,
        MessageCtx.markedElementNames(input.clientContext),
      );
      const optimisticMessageIds = [
        ...insertableInitialMessages.map((message) => message.id),
        userMessage.id,
      ];
      this.state.setPartial({
        messages: [
          ...insertableInitialMessages,
          ...this.state.get().messages,
          userMessage,
        ],
      });

      let sessionId: string | null;
      try {
        sessionId = await this.ensureSessionId();
      } catch (error) {
        this.rollbackOptimisticMessages(optimisticMessageIds);
        throw error;
      }
      if (!sessionId) {
        this.rollbackOptimisticMessages(optimisticMessageIds);
        return;
      }
      this.notifySendAccepted(input);
      /* ------------------------------------------------------ */
      /*             Send and wait for bot response             */
      /* ------------------------------------------------------ */
      const { data } = await this.api.sendMessage(
        {
          uuid: userMessage.id,
          bot_token: this.config.token,
          headers: this.config.headers,
          query_params: this.config.queryParams,
          body_properties: this.config.bodyProperties,
          session_id: sessionId,
          content: userMessage.content,
          attachments: input.attachments,
          ...mergeSendContext(this.config, input),
          language: this.config.language,
          exit_mode_prompt: input.exitModePrompt,
          initial_messages:
            insertableInitialMessages.length > 0
              ? insertableInitialMessages.map((m) => ({
                  uuid: m.id,
                  content: m.data.message,
                }))
              : undefined,
        },
        localAbortController.signal,
      );

      if (data?.success) {
        /* ------------------------------------------------------ */
        /*      Append bot reply if not fetched from polling      */
        /* ------------------------------------------------------ */
        const botMessage = this.toBotMessage(data);
        if (botMessage) {
          const prevMessages = this.state.get().messages;
          const shouldAppend = !prevMessages.some(
            (m) => m.id === botMessage.id,
          );
          if (!shouldAppend) {
            this.state.setPartial({
              lastAIResMightSolveUserIssue:
                data.autopilotResponse?.mightSolveUserIssue ||
                data.uiResponse?.mightSolveUserIssue,
            });
            return;
          }
          this.state.setPartial({
            messages: [...prevMessages, botMessage],
            lastAIResMightSolveUserIssue:
              data.autopilotResponse?.mightSolveUserIssue ||
              data.uiResponse?.mightSolveUserIssue,
          });
          this.dispatchToOnMessageReceivedHook(botMessage);
        }
        if (data.session) {
          this.sessionCtx.sessionState.setPartial({ session: data.session });
        }
      } else {
        const errorMessage = this.toBotErrorMessage(
          data?.error?.message ||
            'Something went wrong. Please refresh the page or try again.',
        );
        const currentMessages = this.state.get().messages;
        this.state.setPartial({
          messages: [...currentMessages, errorMessage],
        });
      }
    } catch (error) {
      if (!localAbortController?.signal.aborted) {
        console.error('Failed to send message:', error);
      }
    } finally {
      // If our local controller was aborted, a newer send has taken over —
      // don't clear the in-flight flags out from under it.
      if (!localAbortController?.signal.aborted) {
        this.state.setPartial({
          isSendingMessage: false,
          isSendingMessageToAI: false,
        });
      }
    }
  };

  private toUserMessage = (
    content: string,
    attachments?: MessageAttachmentType[],
    markedElements?: Array<{ name: string }>,
  ): WidgetUserMessage => {
    const messageContent = (() => {
      const extraCollectedData = this.contactCtx.state.get().extraCollectedData;
      // Prepend extra collected data if this is the first message in the session
      if (
        this.state.get().messages.length === 0 &&
        extraCollectedData &&
        Object.keys(extraCollectedData).length > 0
      ) {
        const data = Object.entries(extraCollectedData)
          .filter(([_, value]) => !!value)
          .map(([key, value]) => `${key}: ${value}`)
          .join(' \n');
        return `${data} \n\n${content}`;
      }

      return content;
    })();

    return {
      id: genUuid(),
      type: 'USER',
      content: messageContent,
      attachments,
      markedElements,
      timestamp: new Date().toISOString(),
    };
  };

  private toBotMessage = (
    response: SendMessageOutputDto,
  ): WidgetAiMessage | null => {
    if (response.success && response.autopilotResponse) {
      return {
        type: 'AI',
        id: response.autopilotResponse.id || genUuid(),
        timestamp: new Date().toISOString(),
        component: 'bot_message',
        agent: this.config.bot
          ? {
              name: this.config.bot.name || '',
              isAi: true,
              // Do not set avatarUrl here... let it be taken from the config at render time
              avatarUrl: null,
              avatar: null,
              id: null,
            }
          : undefined,
        data: {
          message: response.autopilotResponse.value.content,
          action: response.uiResponse?.value.name
            ? {
                name: response.uiResponse.value.name,
                data: response.uiResponse.value.request_response,
              }
            : undefined,
        },
      };
    }

    return null;
  };

  private toBotErrorMessage = (message: string): WidgetAiMessage => {
    return {
      type: 'AI',
      id: genUuid(),
      timestamp: new Date().toISOString(),
      component: 'bot_message',
      data: {
        message,
        variant: 'error',
        action: undefined,
      },
    };
  };
}
