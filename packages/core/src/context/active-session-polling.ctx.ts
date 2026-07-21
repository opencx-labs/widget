import type { ApiCaller } from '../api/api-caller';
import type { ActionCallDto, MessageDto } from '../types/dtos';
import {
  type WidgetMessageU,
  type WidgetSystemMessageU,
} from '../types/messages';
import type { WidgetConfig } from '../types/widget-config';
import { isExhaustive } from '../utils/is-exhaustive';
import { Poller } from '../utils/Poller';
import { runCatching } from '../utils/run-catching';
import type { MessageCtx } from './message.ctx';
import type { SessionCtx } from './session.ctx';

export class ActiveSessionPollingCtx {
  private api: ApiCaller;
  private config: WidgetConfig;
  private sessionCtx: SessionCtx;
  private messageCtx: MessageCtx;
  private sessionPollingIntervalSeconds: number;

  private poller = new Poller();
  private fetchSessionAndFullHistoryAbortController = new AbortController();

  constructor({
    api,
    config,
    sessionCtx,
    messageCtx,
    sessionPollingIntervalSeconds,
  }: {
    api: ApiCaller;
    config: WidgetConfig;
    sessionCtx: SessionCtx;
    messageCtx: MessageCtx;
    sessionPollingIntervalSeconds: number;
  }) {
    this.api = api;
    this.config = config;
    this.sessionCtx = sessionCtx;
    this.messageCtx = messageCtx;
    this.sessionPollingIntervalSeconds = sessionPollingIntervalSeconds;

    // v5 streamed turns end with one immediate ingest of the canonical rows
    // the backend persisted — this ctx owns history mapping/dedupe, so the
    // hook lives here rather than duplicating that logic in MessageCtx.
    this.messageCtx.reconcileAfterStream = (sessionId) =>
      this.fetchSessionAndHistory({
        sessionId,
        abortSignal: new AbortController().signal,
      });

    this.registerPolling();
  }

  private registerPolling = () => {
    this.sessionCtx.sessionState.subscribe(({ session }) => {
      if (session?.id) {
        this.poller.startPolling(async (abortSignal) => {
          this.fetchSessionAndHistory({ sessionId: session.id, abortSignal });
        }, this.sessionPollingIntervalSeconds * 1000);
      } else {
        this.poller.reset();
      }
    });

    /**
     * When the session is closed, fetch immediately instead of waiting for the
     * next poll tick, so closing messages (e.g. csat_requested) show up right away.
     */
    this.sessionCtx.sessionState.subscribe(({ session }) => {
      if (session?.id && !session.isOpened) {
        try {
          this.fetchSessionAndFullHistoryAbortController =
            new AbortController();
          this.fetchSessionAndHistory({
            sessionId: session.id,
            abortSignal: this.fetchSessionAndFullHistoryAbortController.signal,
          });
        } catch (error) {
          if (!this.fetchSessionAndFullHistoryAbortController.signal.aborted) {
            console.error('Failed to fetch session and full history:', error);
          }
        }
      } else {
        this.fetchSessionAndFullHistoryAbortController.abort();
      }
    });
  };

  fetchSessionAndHistory = async ({
    sessionId,
    abortSignal,
  }: {
    sessionId: string;
    abortSignal: AbortSignal;
  }): Promise<void> => {
    /**
     * This is a bit of an implicit contract... there are two cases here
     * 1. If there are no messages in state, it means the user selected a previous session from the sessions screen and got routed to the chat,
     *    in this case, we want to show a loading indicator until the initial fetch is done
     * 2. There is a single message in state, which is the optimistically rendered user message,
     *    in this case, we don't want to show a loading indicator
     */
    const isInitialFetch = this.messageCtx.state.get().messages.length === 0;
    if (isInitialFetch) {
      this.messageCtx.state.setPartial({ isInitialFetchLoading: true });
    }

    const { data } = await this.api.pollSessionAndHistory({
      sessionId,
      abortSignal,
    });

    if (data?.session) {
      this.sessionCtx.sessionState.setPartial({ session: data.session });
      this.sessionCtx.setSessions([data.session]);
    }

    if (data?.history && data.history.length > 0) {
      // Get a fresh reference to current messages after the poll is done
      const prevMessages = this.messageCtx.state.get().messages;
      const newMessages = data.history
        .map(this.mapHistoryToMessage)
        .filter((msg): msg is WidgetMessageU => msg !== null)
        .filter(
          (newMsg) =>
            !prevMessages.some((existingMsg) => existingMsg.id === newMsg.id),
        );
      this.messageCtx.state.setPartial({
        messages: [...prevMessages, ...newMessages],
      });
      if (isInitialFetch) {
        // Opening an existing session: history flows in as one batch. The user
        // is loading context, not receiving new messages — suppress the hook
        // but seed the dedup set so later polls don't re-fire these ids.
        this.messageCtx.markAsDispatchedToOnMessageReceivedHook(
          newMessages.map((m) => m.id),
        );
      } else {
        for (const newMessage of newMessages) {
          this.messageCtx.dispatchToOnMessageReceivedHook(newMessage);
        }
      }
    }

    if (this.messageCtx.state.get().isInitialFetchLoading) {
      this.messageCtx.state.setPartial({ isInitialFetchLoading: false });
    }

    // Reopening an existing session mid-stream (reload, tab switch): reattaching
    // to a still-live v5 turn is now owned by the agent-chat surface's
    // `useChat({ resume: true })`, which probes the reconnect endpoint on mount.
    // Nothing to do here.
  };

  mapHistoryToMessage = (history: MessageDto): WidgetMessageU | null => {
    const commonFields = {
      id: history.publicId,
      timestamp: history.sentAt || '',
      attachments: history.attachments || undefined,
    };

    if (history.sender.kind === 'user') {
      return {
        ...commonFields,
        type: 'USER',
        content: history.content.text || '',
        deliveredAt: history.sentAt || '',
      };
    }

    if (history.sender.kind === 'agent') {
      return {
        ...commonFields,
        type: 'AGENT',
        component: 'agent_message',
        data: {
          message: history.content.text || '',
        },
        agent: {
          name: history.sender.name || '',
          // Do not set avatarUrl from config here... let it be taken from the config at render time
          // Only set avatar url from the backend's response
          avatarUrl: history.sender.avatar || null,
          avatar: history.sender.avatar || null,
          id: null,
          isAi: false,
        },
      };
    }

    if (history.sender.kind === 'ai') {
      const action =
        history.actionCalls && history.actionCalls.length > 0
          ? history.actionCalls[history.actionCalls.length - 1]
          : undefined;

      return {
        ...commonFields,
        type: 'AI',
        component: 'bot_message',
        agent: {
          id: null,
          name: this.config.bot?.name || '',
          isAi: true,
          // Do not set avatarUrl from config here... let it be taken from the config at render time
          avatarUrl: null,
          avatar: null,
        },
        data: {
          message: history.content.text || '',
          action: action
            ? {
                name: action.actionName,
                data: this.extractActionResult(action),
              }
            : undefined,
        },
        stepsBefore:
          history.stepsBefore && history.stepsBefore.length > 0
            ? history.stepsBefore
            : undefined,
      };
    }

    if (history.sender.kind === 'system') {
      const message = this.constructSystemMessage(history);
      if (message === null) return null;

      return { ...message };
    }

    return null;
  };

  constructSystemMessage = (
    history: MessageDto,
  ): WidgetSystemMessageU | null => {
    if (!history || !history.systemMessagePayload) return null;
    switch (history.systemMessagePayload.type) {
      case 'state_checkpoint':
        return {
          id: history.publicId,
          type: 'SYSTEM',
          subtype: 'state_checkpoint',
          data: { payload: history.systemMessagePayload.payload },
          timestamp: history.sentAt || '',
          attachments: undefined,
        };
      case 'csat_requested':
        return {
          id: history.publicId,
          type: 'SYSTEM',
          subtype: 'csat_requested',
          data: { payload: undefined },
          timestamp: history.sentAt || '',
          attachments: undefined,
        };
      case 'csat_submitted':
        return {
          id: history.publicId,
          type: 'SYSTEM',
          subtype: 'csat_submitted',
          data: {
            payload: {
              score: history.systemMessagePayload.payload.score ?? undefined,
              feedback:
                history.systemMessagePayload.payload.feedback ?? undefined,
            },
          },
          timestamp: history.sentAt || '',
          attachments: undefined,
        };
      case 'none':
        return null;
      default:
        isExhaustive(
          history.systemMessagePayload,
          this.constructSystemMessage.name,
        );
        return null;
    }
  };

  extractActionResult = (action: ActionCallDto) => {
    const result = action.result;

    if (result === null) return result;
    if (typeof result !== 'object') return result;

    if (
      'responseBodyText' in result &&
      typeof result.responseBodyText === 'string'
    ) {
      const responseBodyText = result.responseBodyText;
      const parsed = runCatching(() => JSON.parse(responseBodyText)).data;
      if (parsed) return parsed;
    }

    return action.result;
  };
}
