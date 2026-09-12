import type {
  WidgetConfig,
  WidgetCtx,
  WidgetUserMessage,
} from '@opencx/widget-core';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePrimitiveState } from '../hooks/usePrimitiveState';
import type { ConnectionRequest, StreamingTurnItem } from './agent-chat-stream';
import type { TurnRenderSource } from './agent-turn-sources';
import type { AskQuestionsRequest } from './ask-questions';
import { pendingClarification as resolvePendingClarification } from './pending-clarification';
import { useAgentChat, type AgentChatPageEffect } from './useAgentChat';
import { ConnectionAttemptProvider } from './useConnection';

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
  pendingConnection: ConnectionRequest | null;
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
  pendingConnection: null,
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
    handledConnectionRequestIds,
  } = useAgentChat({
    widgetCtx,
    config,
    sessionId: sessionState.session?.id ?? null,
    persistedMessages: messagesState.messages,
  });
  const lastMessageIsFromUser = messagesState.messages.at(-1)?.type === 'USER';
  const handledConnectionsRef = useRef(new Set<string>());
  const handledSessionIdRef = useRef(sessionState.session?.id ?? null);
  const currentSessionId = sessionState.session?.id ?? null;
  if (handledSessionIdRef.current !== currentSessionId) {
    handledSessionIdRef.current = currentSessionId;
    handledConnectionsRef.current.clear();
  }
  handledConnectionRequestIds.forEach((requestId) =>
    handledConnectionsRef.current.add(requestId),
  );
  const connectionCandidate = [
    ...turnSources.flatMap((source) => source.items),
    ...liveItems,
  ].findLast(
    (item): item is Extract<StreamingTurnItem, { kind: 'connection' }> =>
      item.kind === 'connection' &&
      !handledConnectionsRef.current.has(item.request.request_id),
  )?.request;
  const [pendingConnection, setPendingConnection] =
    useState<ConnectionRequest | null>(null);
  const previousSessionIdRef = useRef(sessionState.session?.id ?? null);

  useEffect(() => {
    const sessionId = sessionState.session?.id ?? null;
    const previousSessionId = previousSessionIdRef.current;
    if (previousSessionId === sessionId) return;
    previousSessionIdRef.current = sessionId;
    // null -> id is the first send creating its own session. Every other
    // transition is a real conversation boundary.
    if (previousSessionId === null) return;
    if (pendingConnection) {
      handledConnectionsRef.current.add(pendingConnection.request_id);
      setPendingConnection(null);
    }
  }, [pendingConnection, sessionState.session?.id]);

  useEffect(() => {
    if (currentSessionId === null) {
      setPendingConnection(null);
      return;
    }
    if (
      pendingConnection &&
      handledConnectionsRef.current.has(pendingConnection.request_id)
    ) {
      setPendingConnection(null);
      return;
    }
    if (
      !connectionCandidate ||
      handledConnectionsRef.current.has(connectionCandidate.request_id)
    ) {
      return;
    }
    setPendingConnection((current) => current ?? connectionCandidate);
  }, [
    currentSessionId,
    connectionCandidate,
    handledConnectionRequestIds,
    pendingConnection,
  ]);

  const handleConnection = useCallback((requestId: string) => {
    handledConnectionsRef.current.add(requestId);
    setPendingConnection((current) =>
      current?.request_id === requestId ? null : current,
    );
  }, []);
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
      pendingConnection,
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
      pendingConnection,
    ],
  );
  const content = (
    <AgentChatContext.Provider value={value}>
      {children}
    </AgentChatContext.Provider>
  );
  return (
    <ConnectionAttemptProvider
      request={pendingConnection}
      widgetCtx={widgetCtx}
      onHandled={handleConnection}
    >
      {content}
    </ConnectionAttemptProvider>
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
