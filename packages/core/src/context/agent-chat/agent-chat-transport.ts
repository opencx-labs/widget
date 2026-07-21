import { DefaultChatTransport, type UIMessage } from 'ai';

/** Wiring the api layer hands the v5 transport (send + reconnect URLs + auth). */
export type AgentChatTransportOptions = {
  /** POST endpoint that starts a turn and streams it. */
  api: string;
  /** Session-scoped GET the transport hits to resume an in-flight stream. */
  reconnectApi: (sessionId: string) => string;
  /** Auth headers (X-Bot-Token + Authorization), content-type stripped. */
  headers: Record<string, string>;
};

/**
 * The reconnect-request preparer for `resume`. useChat calls this on mount (and
 * after a disconnect) to reattach to the session's in-flight stream — it points
 * the transport at the session-scoped GET with the same auth headers. Exported
 * standalone so the resume wiring is unit-tested directly.
 */
export function agentChatReconnectPreparer(options: AgentChatTransportOptions) {
  return ({ id }: { id: string }) => ({
    api: options.reconnectApi(id),
    headers: options.headers,
  });
}

/**
 * Build the AI SDK transport for an agent-v3 (v5) chat: POSTs to the streaming
 * endpoint with a custom body (the widget's send payload), and resumes via the
 * session-scoped GET. `buildBody` owns the payload so the transport stays free
 * of widget-config knowledge.
 */
export function buildAgentChatTransport({
  options,
  buildBody,
}: {
  options: AgentChatTransportOptions;
  buildBody: (ctx: {
    messages: UIMessage[];
    requestMetadata: unknown;
    body: Record<string, unknown> | undefined;
  }) => Record<string, unknown>;
}): DefaultChatTransport<UIMessage> {
  return new DefaultChatTransport<UIMessage>({
    api: options.api,
    headers: options.headers,
    prepareSendMessagesRequest: ({ messages, requestMetadata, body }) => ({
      body: buildBody({ messages, requestMetadata, body }),
    }),
    prepareReconnectToStreamRequest: agentChatReconnectPreparer(options),
  });
}

/**
 * Stop a live v5 turn. With resumable streams on, a client abort is just a
 * disconnect (the server keeps generating and a reload would revive it), so a
 * real stop must ALSO tell the backend to cancel generation and clear the resume
 * pointer. Order: abort the client stream, then cancel the server. Exported so
 * the stop path is unit-tested with fakes.
 */
export async function stopAgentChatTurn({
  api,
  sessionId,
  chatStop,
}: {
  api: { stopStream: (sessionId: string) => Promise<void> };
  sessionId: string | null;
  chatStop: () => void | Promise<void>;
}): Promise<void> {
  await chatStop();
  if (sessionId) await api.stopStream(sessionId);
}
