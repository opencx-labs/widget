import type { StreamingTurnItem, WidgetUserMessage } from '@opencx/widget-core';
import React, { createContext, useContext, useMemo } from 'react';
import { useAgentChat } from './useAgentChat';

/**
 * Streaming state for the agent-v3 (v5) surface, produced by the single
 * `useAgentChat` (one useChat instance) at the surface root and consumed by the
 * message list (live overlay) and the shared composer (stop button + the
 * queue pill above the input).
 *
 * Outside an agent-bound surface (v1/v2 embeds) there is no provider, so the
 * defaults below apply: `isAgentSurface: false` keeps the composer on the
 * v1/v2 blocking behaviour; inside the provider it is `true`, so the composer
 * drives entirely off useChat `status` and never blocks (it queues).
 */
export type AgentChatUiValue = {
  isStreaming: boolean;
  /** True only under `AgentChatProvider` — disables the v1/v2 awaiting-AI gate. */
  isAgentSurface: boolean;
  liveItems: StreamingTurnItem[];
  /** Messages the user queued mid-turn — rendered in the composer's queue pill. */
  queuedUserMessages: WidgetUserMessage[];
  /** Drop one queued (not-yet-sent) message from the pill. */
  onRemoveQueued: (messageId: string) => void;
  onStop: () => void;
};

const DEFAULT: AgentChatUiValue = {
  isStreaming: false,
  isAgentSurface: false,
  liveItems: [],
  queuedUserMessages: [],
  onRemoveQueued: () => {},
  onStop: () => {},
};

const AgentChatContext = createContext<AgentChatUiValue | null>(null);

/** Reads the agent streaming state; safe defaults when not in an agent surface. */
export function useAgentChatUi(): AgentChatUiValue {
  return useContext(AgentChatContext) ?? DEFAULT;
}

/**
 * Mounts the v5 chat engine (one `useChat`) and exposes its streaming state to
 * the surface. Wrap the agent-bound `ChatMain`/`ChatFooter` in this.
 */
export function AgentChatProvider({ children }: { children: React.ReactNode }) {
  const { isStreaming, liveItems, queuedUserMessages, removeQueued, stop } =
    useAgentChat();
  // Memoized so consumers (message list, composer) don't re-render on every
  // provider render — only when the streaming state actually changes.
  const value: AgentChatUiValue = useMemo(
    () => ({
      isStreaming,
      isAgentSurface: true,
      liveItems,
      queuedUserMessages,
      onRemoveQueued: removeQueued,
      onStop: stop,
    }),
    [isStreaming, liveItems, queuedUserMessages, removeQueued, stop],
  );
  return <AgentChatContext.Provider value={value}>{children}</AgentChatContext.Provider>;
}
