import type {
  WidgetConfig,
  WidgetCtx,
  WidgetUserMessage,
} from '@opencx/widget-core';
import React, { createContext, useContext, useMemo } from 'react';
import { usePrimitiveState } from '../hooks/usePrimitiveState';
import type { ConnectionRequest, StreamingTurnItem } from './agent-chat-stream';
import type { TurnRenderSource } from './agent-turn-sources';
import type { AskQuestionsRequest } from './ask-questions';
import { pendingClarification as resolvePendingClarification } from './pending-clarification';
import { useAgentChat, type AgentChatPageEffect } from './useAgentChat';

/**
 * Streaming state for the agent-chat surface, produced by the single
 * `useAgentChat` (one useChat instance) and consumed by the message list
 * (live overlay) and the shared composer (stop button + the queue pill above
 * the input).
 *
 * On embeds whose org does not stream there is no provider, so the defaults
 * below apply.
 */
export type AgentChatUiValue = {
  isStreaming: boolean;
  liveItems: StreamingTurnItem[];
  /**
   * Finished turns' render sources: the transcript rows each covers and the
   * streaming items that replace those rows' plain bubbles (retained live
   * turns + server-fetched historical `ui_parts`).
   */
  turnSources: TurnRenderSource[];
  /**
   * The live turn's node key — stable through the retained promotion. Null
   * while no turn is live or settling.
   */
  liveTurnKey: string | null;
  /** The last turn failed — the transcript shows an error row with retry. */
  turnFailed: boolean;
  retryFailedTurn: () => void;
  /** Messages the user queued mid-turn — rendered in the composer's queue pill. */
  queuedUserMessages: WidgetUserMessage[];
  /** Drop one queued (not-yet-sent) message from the pill. */
  removeQueued: (messageId: string) => void;
  /** Stop the live response; queued messages survive and drain next. */
  stop: () => void;
  /** Host-page effects normalized from the current assistant tool parts. */
  pageEffects: AgentChatPageEffect[];
  /**
   * The clarification the agent is waiting on — the composer shows the
   * questionnaire in its place — or null.
   */
  pendingClarification: AskQuestionsRequest | null;
  pendingConnection?: ConnectionRequest | null;
};

export const DEFAULT_AGENT_CHAT_UI: AgentChatUiValue = {
  isStreaming: false,
  liveItems: [],
  turnSources: [],
  liveTurnKey: null,
  turnFailed: false,
  retryFailedTurn: () => {},
  queuedUserMessages: [],
  removeQueued: () => {},
  stop: () => {},
  pageEffects: [],
  pendingClarification: null,
};

export const AgentChatContext = createContext<AgentChatUiValue | null>(null);

/** Reads the agent streaming state; safe defaults when not in an agent surface. */
export function useAgentChatUi(): AgentChatUiValue {
  return useContext(AgentChatContext) ?? DEFAULT_AGENT_CHAT_UI;
}

/**
 * The streaming engine mount. WidgetProvider is the sole mount site, so every
 * headless and styled consumer shares one useChat lifecycle.
 */
function ActiveAgentChatProvider({
  children,
  widgetCtx,
  config,
}: {
  children: React.ReactNode;
  widgetCtx: WidgetCtx;
  config: WidgetConfig;
}) {
  const sessionState = usePrimitiveState(widgetCtx.sessionCtx.sessionState);
  const messagesState = usePrimitiveState(widgetCtx.messageCtx.state);
  const {
    isStreaming,
    liveItems,
    turnSources,
    liveTurnKey,
    turnFailed,
    retryFailedTurn,
    queuedUserMessages,
    removeQueued,
    stop,
    pageEffects,
  } = useAgentChat({
    widgetCtx,
    config,
    sessionId: sessionState.session?.id ?? null,
    persistedMessages: messagesState.messages,
  });
  const lastMessageIsFromUser = messagesState.messages.at(-1)?.type === 'USER';
  // Memoized so consumers (message list, composer) don't re-render on every
  // provider render — only when the streaming state actually changes.
  const value: AgentChatUiValue = useMemo(
    () => ({
      isStreaming,
      liveItems,
      turnSources,
      liveTurnKey,
      turnFailed,
      retryFailedTurn,
      queuedUserMessages,
      removeQueued,
      stop,
      pageEffects,
      pendingConnection:
        isStreaming || lastMessageIsFromUser
          ? null
          : ((liveItems.length
              ? liveItems
              : (turnSources.at(-1)?.items ?? [])
            ).findLast((item) => item.kind === 'connection')?.request ?? null),
      pendingClarification: resolvePendingClarification({
        turnSources,
        liveItems,
        isStreaming,
        lastMessageIsFromUser,
      }),
    }),
    [
      isStreaming,
      liveItems,
      turnSources,
      liveTurnKey,
      turnFailed,
      retryFailedTurn,
      queuedUserMessages,
      removeQueued,
      stop,
      pageEffects,
      lastMessageIsFromUser,
    ],
  );
  return (
    <AgentChatContext.Provider value={value}>
      {children}
    </AgentChatContext.Provider>
  );
}

/**
 * WidgetProvider-owned engine mount. Non-streaming widgets get the same safe
 * context interface without loading a useChat instance.
 */
export function AgentChatProvider({
  children,
  widgetCtx,
  config,
}: {
  children: React.ReactNode;
  widgetCtx: WidgetCtx;
  config: WidgetConfig;
}) {
  // A blocking send settling can make a deferred streaming opt-in effective.
  usePrimitiveState(widgetCtx.messageCtx.state);
  if (!widgetCtx.streaming) {
    return (
      <AgentChatContext.Provider value={DEFAULT_AGENT_CHAT_UI}>
        {children}
      </AgentChatContext.Provider>
    );
  }
  return (
    <ActiveAgentChatProvider widgetCtx={widgetCtx} config={config}>
      {children}
    </ActiveAgentChatProvider>
  );
}
