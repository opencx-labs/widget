import { ApiCaller } from '../api/api-caller';
import type { WidgetConfig, WidgetMention } from '../types/widget-config';
import {
  type MarkedElementRef,
  type WidgetAiMessage,
  type WidgetMessageU,
  type WidgetUserMessage,
} from '../types/messages';
import type {
  MessageAttachmentType,
  SendMessageDto,
  SendMessageOutputDto,
} from '../types/dtos';
import { translate } from '../translation';
import { log } from '../utils/log';
import { PrimitiveState } from '../utils/PrimitiveState';
import { genUuid } from '../utils/uuid';
import { SessionCtx } from './session.ctx';
import type { ContactCtx } from './contact.ctx';

/** The shape a caller passes to `sendMessage` (and `stageUserTurn`). */
export type SendMessageInput = {
  content: SendMessageDto['content'];
  attachments?: SendMessageDto['attachments'];
  customData?: SendMessageDto['custom_data'];
  /**
   * Per-message AI-visible context (e.g. the composer's picked page elements),
   * merged over the config-level `context` on the wire.
   */
  clientContext?: Record<string, unknown>;
  /**
   * What the visitor @-mentioned (host items picked from `config.mentions`).
   * Sent as `clientContext.mentions`.
   */
  mentions?: WidgetMention[];
  /**
   * False when the visitor dismissed the page's entity pill for this message:
   * the send goes out without `context.entity`, everything else intact.
   * @default true
   */
  withPageEntity?: boolean;
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

/** What `stageUserTurn` hands the engine that finishes the send. */
export type StagedUserTurn = {
  sessionId: string;
  userMessage: WidgetUserMessage;
  /** Persistent greetings riding a fresh conversation's first turn. */
  initialMessages: WidgetAiMessage[];
};

/**
 * The seam the headless agent-chat provider registers so the shared
 * `sendMessage` entry point routes to its `useChat` streaming engine. Core
 * stays framework-neutral and owns only the blocking bot-chat path plus the
 * shared persisted message list.
 */
export type AgentChatHandlers = {
  send: (input: SendMessageInput) => Promise<void> | void;
};

/**
 * The per-message wire context shared by both send engines: the host's
 * config-level `context` (resolved fresh when it is a function) with the
 * widget's own per-send page context merged over it.
 *
 * `sendsPageContext` is `WidgetCtx.features.pageContext` — the org's
 * page-context feature narrowed by the embed. Off → the widget adds nothing
 * of its own (no page marks, no picked elements) but the host's `context`
 * still rides along exactly as it did in v4; `custom_data` is unaffected.
 */
export const mergeSendContext = (
  config: WidgetConfig,
  input: SendMessageInput,
  { sendsPageContext }: { sendsPageContext: boolean },
): {
  clientContext: Record<string, unknown> | undefined;
  custom_data: Record<string, unknown>;
} => {
  const configContext = resolveConfigContext(config);
  const mentions =
    sendsPageContext && input.mentions && input.mentions.length > 0
      ? { mentions: input.mentions.map(mentionOnTheWire) }
      : undefined;
  const merged =
    sendsPageContext && (input.clientContext || mentions)
      ? { ...configContext, ...input.clientContext, ...mentions }
      : configContext;
  return {
    clientContext:
      input.withPageEntity === false && merged && 'entity' in merged
        ? withoutKey(merged, 'entity')
        : merged,
    custom_data: {
      ...(config.messageCustomData || {}),
      ...(input.customData || {}),
    },
  };
};

/** A mention as the agent reads it: what identifies it, never the icon. */
const mentionOnTheWire = ({ type, id, title, meta }: WidgetMention) => ({
  type,
  id,
  title,
  ...(meta ? { meta } : {}),
});

const withoutKey = (
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined => {
  const { [key]: _dropped, ...rest } = record;
  return Object.keys(rest).length > 0 ? rest : undefined;
};

export const resolveConfigContext = (
  config: WidgetConfig,
): Record<string, unknown> | undefined => {
  if (typeof config.context !== 'function') return config.context;
  try {
    return config.context();
  } catch (err) {
    log.error('context getter threw; sending without context', err);
    return undefined;
  }
};

/** Wire shape of the per-embed feature toggles (`config.features`). */
type SendFeaturesBody = NonNullable<SendMessageDto['features']>;

/**
 * `config.features` (camelCase) → the snake_cased `features` field both send
 * engines carry. Undefined when the embedder set nothing, so the body stays
 * byte-identical to before for embeds that never touch the option.
 */
export const resolveSendFeatures = (
  config: WidgetConfig,
): SendFeaturesBody | undefined => {
  const features = config.features;
  if (!features) return undefined;
  const body: SendFeaturesBody = {};
  if (features.preamble !== undefined) body.preamble = features.preamble;
  if (features.inlineUi !== undefined) body.inline_ui = features.inlineUi;
  if (features.pageContext !== undefined) {
    body.page_context = features.pageContext;
  }
  if (features.clientTools !== undefined) {
    body.client_tools = features.clientTools;
  }
  return Object.keys(body).length > 0 ? body : undefined;
};

/**
 * Everything one send carries on the wire — the SAME body for the blocking
 * send and the streaming turn (both endpoints take `WidgetSendMessageInputDto`).
 * Config is read at call time so function-form `context` and a refreshed
 * embedder config are reflected on every request.
 */
export const buildSendMessageBody = ({
  config,
  input,
  uuid,
  sessionId,
  content,
  initialMessages,
  sendsPageContext,
}: {
  config: WidgetConfig;
  input: SendMessageInput;
  /** The user message's wire id (a retry sends a fresh one). */
  uuid: string;
  sessionId: string;
  /** The rendered user message text (extra collected data already prepended). */
  content: string;
  /** Persistent greetings riding a fresh conversation's first turn. */
  initialMessages: readonly WidgetAiMessage[];
  sendsPageContext: boolean;
}): SendMessageDto => ({
  uuid,
  bot_token: config.token,
  headers: config.headers,
  query_params: config.queryParams,
  body_properties: config.bodyProperties,
  session_id: sessionId,
  content,
  attachments: input.attachments,
  ...mergeSendContext(config, input, { sendsPageContext }),
  language: config.language,
  features: resolveSendFeatures(config),
  capabilities:
    config.capabilities?.structuredQuestions === undefined
      ? undefined
      : { structured_questions: config.capabilities.structuredQuestions },
  exit_mode_prompt: input.exitModePrompt,
  initial_messages:
    initialMessages.length > 0
      ? initialMessages.map((m) => ({ uuid: m.id, content: m.data.message }))
      : undefined,
});

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
  private readonly getClientCapabilities: () => WidgetConfig['capabilities'];
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

  /** One reactive draft per conversation, including while its composer is unmounted. */
  public draftState = new PrimitiveState({
    text: '',
    mentions: [] as WidgetMention[],
  });

  /**
   * The org's web channel runs the streaming engine — turns stream over the
   * AI SDK `useChat` surface instead of the blocking send. Decided by the
   * server at init and constant for the widget's whole lifetime.
   */
  public readonly streaming: boolean;

  /**
   * `WidgetCtx.features.pageContext`: whether the widget's own page context
   * (page marks, picked elements) rides along with each message. Off → the
   * user bubble shows no page-mark chips either.
   */
  public readonly sendsPageContext: boolean;

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
    streaming,
    sendsPageContext,
    getClientCapabilities,
  }: {
    config: WidgetConfig;
    api: ApiCaller;
    sessionCtx: SessionCtx;
    contactCtx: ContactCtx;
    streaming: boolean;
    sendsPageContext: boolean;
    /** Read renderer support at send time; React options may change after initialization. */
    getClientCapabilities?: () => WidgetConfig['capabilities'];
  }) {
    this.config = config;
    this.getClientCapabilities =
      getClientCapabilities ?? (() => this.config.capabilities);
    this.api = api;
    this.sessionCtx = sessionCtx;
    this.contactCtx = contactCtx;
    this.streaming = streaming;
    this.sendsPageContext = sendsPageContext;
  }

  reset = () => {
    this.sendMessageAbortController.abort('Resetting chat');
    this.bufferedAgentSends = [];
    this.state.reset();
    this.messageIdsDispatchedToOnMessageReceivedHook.clear();
    this.sentTextHistory = [];
    this.draftState.reset();
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
   * `send` here and clears it on unmount, so every streaming headless or
   * styled consumer shares the same lifecycle. Imperative sends can arrive in
   * the render gap before registration; drain those in FIFO order once ready.
   */
  registerAgentHandlers = (handlers: AgentChatHandlers): void => {
    this.agentHandlers = handlers;
    const buffered = this.bufferedAgentSends;
    this.bufferedAgentSends = [];
    buffered.forEach((input) => {
      MessageCtx.dispatchToEngine(handlers, input);
    });
  };

  /** Hand a send to the streaming engine; its failure can never propagate. */
  private static dispatchToEngine(
    handlers: AgentChatHandlers,
    input: SendMessageInput,
  ): void {
    try {
      Promise.resolve(handlers.send(input)).catch((err: unknown) => {
        log.error('streaming send failed', err);
      });
    } catch (err) {
      log.error('streaming send failed', err);
    }
  }

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
      if (!createdSession) return null;
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

  /**
   * Fire the caller's `onAccepted` once a send is validated, has a session,
   * and is owned by an engine. A consumer callback must never be able to
   * break an accepted send.
   */
  notifySendAccepted = (input: SendMessageInput): void => {
    try {
      input.onAccepted?.();
    } catch (error) {
      log.error('send acceptance callback failed', error);
    }
  };

  /**
   * The front half every send shares, whichever engine finishes it: validate,
   * build the user message (plus the persistent greetings on a fresh
   * conversation's first turn), render it optimistically, and make sure a
   * session exists — rolling the optimistic rows back if it cannot. Returns
   * `null` when there is nothing to send or no session could be created.
   */
  stageUserTurn = async (
    input: SendMessageInput,
    { pending }: { pending: boolean },
  ): Promise<StagedUserTurn | null> => {
    const built = this.buildUserMessage(input);
    if (!built) return null;
    const userMessage = pending ? { ...built, pending: true } : built;

    const initialMessages = this.buildPersistentInitialMessages();
    const optimisticMessageIds = [
      ...initialMessages.map((message) => message.id),
      userMessage.id,
    ];
    this.state.setPartial({
      messages: [...initialMessages, ...this.state.get().messages, userMessage],
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
    return { sessionId, userMessage, initialMessages };
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
    const built = this.buildUserMessage(input);
    if (!built) return null;
    const sessionId = this.sessionCtx.sessionState.get().session?.id;
    if (!sessionId) return null;
    return { sessionId, userMessage: { ...built, pending: true } };
  };

  /** Validate the input and build its user message; `null` when empty. */
  private buildUserMessage = (
    input: SendMessageInput,
  ): WidgetUserMessage | null => {
    if (
      !input.content.trim() &&
      (!input.attachments || input.attachments.length === 0)
    ) {
      log.warn('cannot send an empty message of no content or attachments');
      return null;
    }
    return this.toUserMessage(
      input.content.trim(),
      input.attachments || undefined,
      this.sendsPageContext
        ? MessageCtx.markedElementNames(input.clientContext)
        : undefined,
      this.sendsPageContext && input.mentions?.length
        ? input.mentions
        : undefined,
    );
  };

  /**
   * Defensive read of `clientContext.page_marks` → the user bubble's context
   * chips: each mark contributes the element it was placed on, the note the
   * visitor wrote, and a reference back to the mark itself (the UI renders
   * the same presentation the composer showed, thumbnail included). Entries
   * without a usable name are dropped.
   */
  private static markedElementNames(
    clientContext: Record<string, unknown> | undefined,
  ): MarkedElementRef[] | undefined {
    const raw = clientContext?.['page_marks'];
    if (!Array.isArray(raw)) return undefined;
    const marked = raw.flatMap((mark: unknown): MarkedElementRef[] => {
      if (typeof mark !== 'object' || mark === null) return [];
      const elements: unknown = (mark as { elements?: unknown }).elements;
      const first = Array.isArray(elements) ? elements[0] : undefined;
      const name: unknown =
        typeof first === 'object' && first !== null && 'name' in first
          ? (first as { name: unknown }).name
          : undefined;
      if (typeof name !== 'string' || name.length === 0) return [];
      const note: unknown = (mark as { note?: unknown }).note;
      const snapshotUrl: unknown = (mark as { snapshotUrl?: unknown })
        .snapshotUrl;
      return [
        {
          name,
          ...(typeof note === 'string' && note.length > 0 ? { note } : {}),
          ...(typeof snapshotUrl === 'string' && snapshotUrl.length > 0
            ? { snapshotUrl }
            : {}),
          mark,
        },
      ];
    });
    return marked.length > 0 ? marked : undefined;
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
   * The blocking engine refuses a send while the AI reply is pending unless
   * the embed opted out. The streaming engine never blocks (it queues).
   */
  get blocksSendWhileAwaitingReply(): boolean {
    return (
      !this.streaming && this.config.disableSendingWhenAwaitingAIReply !== false
    );
  }

  sendMessage = async (input: SendMessageInput): Promise<void> => {
    // Streaming: the headless useChat engine owns the whole turn lifecycle
    // (optimistic render, streaming, interrupt-send, stop). An imperative
    // `newChat({ message })` can send before that surface's mount effect, so
    // retain the input until handlers register instead of dropping it.
    if (this.streaming) {
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
      /*        Prevent sending while waiting for AI res        */
      /* ------------------------------------------------------ */
      const session = this.sessionCtx.sessionState.get().session;
      const assignee = session?.assignee.kind;
      const isAssignedToAI = assignee === 'ai';
      const isSendingToAI = this.state.get().isSendingMessageToAI;
      const lastMessage = this.state.get().messages.at(-1);

      if (
        this.blocksSendWhileAwaitingReply &&
        (isSendingToAI ||
          // If last message is from user, then bot response did not arrive yet
          (isAssignedToAI && lastMessage?.type === 'USER'))
      ) {
        log.warn('cannot send messages while awaiting AI response');
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

      const staged = await this.stageUserTurn(input, { pending: false });
      if (!staged) return;
      const { sessionId, userMessage, initialMessages } = staged;
      this.notifySendAccepted(input);
      /* ------------------------------------------------------ */
      /*             Send and wait for bot response             */
      /* ------------------------------------------------------ */
      const { data } = await this.api.sendMessage(
        buildSendMessageBody({
          config: {
            ...this.config,
            capabilities: this.getClientCapabilities(),
          },
          input,
          uuid: userMessage.id,
          sessionId,
          content: userMessage.content,
          initialMessages,
          sendsPageContext: this.sendsPageContext,
        }),
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
          data?.error?.message || translate(this.config, 'turn_failed_message'),
        );
        const currentMessages = this.state.get().messages;
        this.state.setPartial({
          messages: [...currentMessages, errorMessage],
        });
      }
    } catch (error) {
      if (!localAbortController?.signal.aborted) {
        log.error('failed to send message', error);
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
    markedElements?: MarkedElementRef[],
    mentions?: WidgetMention[],
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
      mentions,
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
