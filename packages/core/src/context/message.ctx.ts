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
};

/**
 * The seam the v5 (agent-bound) surface registers so the shared `sendMessage` /
 * `stopStreaming` entry points — called from the composer, suggested replies,
 * the imperative handle, and the canvas — all route to the `useChat`-based
 * engine. The streaming state now lives entirely in that react hook (single
 * `status` source of truth); this context only owns v1/v2 and the shared
 * message list.
 */
export type AgentChatHandlers = {
  send: (input: SendMessageInput) => Promise<void> | void;
  stop: () => void;
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
   * v5: the embed is bound to an agents-platform agent — turns stream over the
   * AI SDK `useChat` surface instead of the blocking send. Set by WidgetCtx once
   * the config resolves; a widget is agent-bound for its whole lifetime.
   */
  public agentBound = false;

  /**
   * Ingest the canonical rows after a streamed turn (wired by
   * ActiveSessionPollingCtx — it owns history mapping/dedupe). Called by the v5
   * surface when a turn finishes.
   */
  public reconcileAfterStream: ((sessionId: string) => Promise<void>) | null = null;

  /** Registered by the v5 `useAgentChat` hook while its surface is mounted. */
  private agentHandlers: AgentChatHandlers | null = null;

  /**
   * Sends dispatched while NO agent surface is mounted. The companion
   * quick-ask bar renders ONLY the composer (the chat pane — and with it
   * `useAgentChat` — mounts right after, on `onMessageSent`), so the first
   * message of a conversation arrives before the handlers exist. Dropping it
   * opened a fresh empty chat; instead it is held here and flushed the moment
   * the surface registers.
   */
  private pendingAgentSends: SendMessageInput[] = [];

  private sendMessageAbortController = new AbortController();

  private messageIdsDispatchedToOnMessageReceivedHook = new Set<string>();

  constructor({
    config,
    api,
    sessionCtx,
    contactCtx,
  }: {
    config: WidgetConfig;
    api: ApiCaller;
    sessionCtx: SessionCtx;
    contactCtx: ContactCtx;
  }) {
    this.config = config;
    this.api = api;
    this.sessionCtx = sessionCtx;
    this.contactCtx = contactCtx;
  }

  reset = () => {
    this.sendMessageAbortController.abort('Resetting chat');
    this.state.reset();
    this.messageIdsDispatchedToOnMessageReceivedHook.clear();
    // A reset discards conversation state — a held quick-ask send must not
    // resurface into the NEXT conversation when the surface mounts.
    this.pendingAgentSends = [];
  };

  /**
   * Wiring for the v5 surface: the `useAgentChat` hook registers its useChat
   * `send`/`stop` here on mount and clears them on unmount, so the shared
   * `sendMessage`/`stopStreaming` API delegates to it for agent-bound embeds.
   */
  registerAgentHandlers = (handlers: AgentChatHandlers): void => {
    this.agentHandlers = handlers;
    // Flush sends that raced the surface mount (quick-ask first message), in
    // order — the v5 engine's own queue serializes the actual turns.
    const pending = this.pendingAgentSends;
    this.pendingAgentSends = [];
    for (const input of pending) void handlers.send(input);
  };

  unregisterAgentHandlers = (handlers: AgentChatHandlers): void => {
    // Only clear if we still own them — guards a late unmount racing a remount.
    if (this.agentHandlers === handlers) this.agentHandlers = null;
  };

  /**
   * Stop a live turn. v1/v2 has no stoppable stream (blocking send), so this is
   * a no-op there; for agent-bound embeds it delegates to the v5 surface, which
   * aborts the client stream AND tells the backend to cancel generation.
   */
  stopStreaming = () => {
    this.agentHandlers?.stop();
  };

  /**
   * Fires `config.hooks.onMessageReceived` for AI or human-agent messages exactly
   * once per id. Safe to call from any path that ingests messages from the server
   * (send-message response, polling, initial history fetch).
   */
  dispatchToOnMessageReceivedHook = (message: WidgetMessageU): void => {
    if (message.type === 'USER') return;
    if (this.messageIdsDispatchedToOnMessageReceivedHook.has(message.id)) return;
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
   * Front-half of a v5 (agent-bound) send, shared by the composer and every
   * other send caller via the registered handler: validate, optimistically
   * render the user message (plus any persistent initial messages on the first
   * turn), and ensure a session exists. The `useAgentChat` hook then streams the
   * reply through useChat. Returns `null` when there is nothing to send.
   */
  beginAgentTurn = async (
    input: SendMessageInput,
  ): Promise<{ sessionId: string; userMessage: WidgetUserMessage } | null> => {
    const userMessage = this.prepareAgentUserMessage(input);
    if (!userMessage) return null;

    const currentMessages = this.state.get().messages;
    const shouldInsertInitialMessages =
      !this.sessionCtx.sessionState.get().session?.id &&
      currentMessages.length === 0 &&
      this.config.advancedInitialMessages?.some((m) => m.persistent);
    const insertableInitialMessages = shouldInsertInitialMessages
      ? (this.config.advancedInitialMessages || [])
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
          )
      : [];
    this.state.setPartial({
      messages: [...insertableInitialMessages, ...currentMessages, userMessage],
    });

    if (!this.sessionCtx.sessionState.get().session?.id) {
      const createdSession = await this.sessionCtx.createSession();
      if (!createdSession) {
        console.error('Failed to create session');
        return null;
      }
      void this.sessionCtx.refreshSessions();
    }
    const sessionId = this.sessionCtx.sessionState.get().session?.id;
    if (!sessionId) return null;

    return { sessionId, userMessage };
  };

  /**
   * Build the user message for a QUEUED (multi-send) v5 turn WITHOUT rendering
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
   * Shared front-half of both v5 send paths: validate the input and build the
   * user message, `pending` until the turn's answer starts streaming (the UI
   * dims the bubble; the engine clears the flag via
   * `markUserMessagesDelivered`). Returns `null` when there is nothing to send.
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
        MessageCtx.pickedElementNames(input.clientContext),
      ),
      pending: true,
    };
  };

  /**
   * Defensive read of `clientContext.picked_elements` → display names for the
   * user bubble's context chips. Entries without a usable name are dropped.
   */
  private static pickedElementNames(
    clientContext: Record<string, unknown> | undefined,
  ): Array<{ name: string }> | undefined {
    const raw = clientContext?.['picked_elements'];
    if (!Array.isArray(raw)) return undefined;
    const names = raw.flatMap((item: unknown): Array<{ name: string }> => {
      if (typeof item !== 'object' || item === null || !('name' in item)) return [];
      const name: unknown = item.name;
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
   * Clear the `pending` flag on every user message. Called by the v5 engine
   * when a turn starts streaming (sends are serialized, so the server has by
   * then received every message posted before it) and on turn end (safety —
   * a bubble must never stay dimmed forever).
   */
  markUserMessagesDelivered = (): void => {
    const messages = this.state.get().messages;
    if (!messages.some((m) => m.type === 'USER' && m.pending)) return;
    this.state.setPartial({
      messages: messages.map((m) =>
        m.type === 'USER' && m.pending ? { ...m, pending: false } : m,
      ),
    });
  };

  sendMessage = async (input: SendMessageInput): Promise<void> => {
    // Agent-bound (v5): the useChat surface owns the whole turn lifecycle
    // (optimistic render, streaming, interrupt-send, stop). Delegate and return.
    if (this.agentBound) {
      if (!this.agentHandlers) {
        // Surface not mounted yet (companion quick-ask bar) — hold the send;
        // `registerAgentHandlers` flushes it as soon as the chat pane mounts.
        this.pendingAgentSends.push(input);
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
      const currentMessages = this.state.get().messages;
      const shouldInsertInitialMessages =
        !this.sessionCtx.sessionState.get().session?.id &&
        currentMessages.length === 0 &&
        this.config.advancedInitialMessages?.some((m) => m.persistent);
      const insertableInitialMessages = shouldInsertInitialMessages
        ? (this.config.advancedInitialMessages || [])
            .filter((m) => m.persistent)
            .map(
              (m) =>
                ({
                  id: genUuid(),
                  component: 'bot_message',
                  type: 'AI',
                  timestamp: new Date().toISOString(),
                  data: {
                    message: m.message,
                  },
                  agent: this.config.bot ? { ...this.config.bot, isAi: true, id: null } : undefined,
                }) satisfies WidgetAiMessage,
            )
        : [];
      const userMessage = this.toUserMessage(
        input.content.trim(),
        input.attachments || undefined,
        MessageCtx.pickedElementNames(input.clientContext),
      );
      this.state.setPartial({
        messages: [
          ...insertableInitialMessages,
          ...currentMessages,
          userMessage,
        ],
      });

      /* ------------------------------------------------------ */
      /*              Create session if not exists              */
      /* ------------------------------------------------------ */
      if (!this.sessionCtx.sessionState.get().session?.id) {
        const createdSession = await this.sessionCtx.createSession();

        // TODO: apply some retry logic here
        if (!createdSession) {
          console.error('Failed to create session');
          return;
        }

        // Refresh sessions list instantly to get the newly created session in the sessions list
        void this.sessionCtx.refreshSessions();
      }
      const sessionId = this.sessionCtx.sessionState.get().session?.id;
      if (!sessionId) return;
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
          clientContext: input.clientContext
            ? { ...this.config.context, ...input.clientContext }
            : this.config.context,
          custom_data: {
            ...(this.config.messageCustomData || {}),
            ...(input.customData || {}),
          },
          language: this.config.language,
          exit_mode_prompt: input.exitModePrompt,
          initial_messages: shouldInsertInitialMessages
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
          data?.error?.message || 'Something went wrong. Please refresh the page or try again.',
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
    pickedElements?: Array<{ name: string }>,
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
      deliveredAt: new Date().toISOString(),
      attachments,
      pickedElements,
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
