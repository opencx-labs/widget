import type {
  WidgetConfig,
  WidgetCtx,
  WidgetUserMessage,
} from '@opencx/widget-core';
import React, { createContext, useContext, useMemo } from 'react';
import { usePrimitiveState } from '../hooks/usePrimitiveState';
import type { StreamingTurnItem } from './agent-chat-stream';
import {
  LIVE_TURN_FALLBACK_KEY,
  type TurnRenderSource,
} from './agent-turn-sources';
import { useAgentChat, type AgentChatPageEffect } from './useAgentChat';

/**
 * Streaming state for the agent-chat surface, produced by the single
 * `useAgentChat` (one useChat instance) and consumed by the message list
 * (live overlay) and the shared composer (stop button + the queue pill above
 * the input).
 *
 * On embeds that are not agent-bound there is no provider, so the defaults
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
  /** The live turn's node key — stable through the retained promotion. */
  liveTurnKey: string;
  /** The last turn failed — the transcript shows an error row with retry. */
  turnFailed: boolean;
  onRetryFailedTurn: () => void;
  /** Messages the user queued mid-turn — rendered in the composer's queue pill. */
  queuedUserMessages: WidgetUserMessage[];
  /** Drop one queued (not-yet-sent) message from the pill. */
  onRemoveQueued: (messageId: string) => void;
  onStop: () => void;
  /** Host-page effects normalized from the current assistant tool parts. */
  pageEffects: AgentChatPageEffect[];
};

const DEFAULT: AgentChatUiValue = {
  isStreaming: false,
  liveItems: [],
  turnSources: [],
  liveTurnKey: LIVE_TURN_FALLBACK_KEY,
  turnFailed: false,
  onRetryFailedTurn: () => {},
  queuedUserMessages: [],
  onRemoveQueued: () => {},
  onStop: () => {},
  pageEffects: [],
};

const AgentChatContext = createContext<AgentChatUiValue | null>(null);

/** Reads the agent streaming state; safe defaults when not in an agent surface. */
export function useAgentChatUi(): AgentChatUiValue {
  return useContext(AgentChatContext) ?? DEFAULT;
}

/**
 * Active agent-bound implementation. WidgetProvider is the sole mount site,
 * so every headless and styled consumer shares one useChat lifecycle.
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
  // Memoized so consumers (message list, composer) don't re-render on every
  // provider render — only when the streaming state actually changes.
  const value: AgentChatUiValue = useMemo(
    () => ({
      isStreaming,
      liveItems,
      turnSources,
      liveTurnKey,
      turnFailed,
      onRetryFailedTurn: retryFailedTurn,
      queuedUserMessages,
      onRemoveQueued: removeQueued,
      onStop: stop,
      pageEffects,
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
    ],
  );
  return (
    <AgentChatContext.Provider value={value}>
      {children}
    </AgentChatContext.Provider>
  );
}

/**
 * WidgetProvider-owned engine mount. Non-agent widgets get the same safe
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
  if (!widgetCtx.isAgentBound) {
    return (
      <AgentChatContext.Provider value={DEFAULT}>
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
