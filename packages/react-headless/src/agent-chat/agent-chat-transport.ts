import { DefaultChatTransport, type UIMessage } from 'ai';

/** Wiring the api layer hands the agent-chat transport (send + reconnect URLs + auth). */
export type AgentChatTransportOptions = {
  /** POST endpoint that starts a turn and streams it. */
  api: string;
  /** Session-scoped GET the transport hits to resume an in-flight stream. */
  reconnectApi: (sessionId: string) => string;
  /**
   * Auth headers (X-Bot-Token + Authorization), content-type stripped.
   * Pass a thunk when auth can arrive AFTER the transport is built (the
   * contact JWT is minted lazily on first contact creation) — a static
   * snapshot taken at mount sends every stream request without
   * Authorization (401) for the rest of the session.
   */
  headers: Record<string, string> | (() => Record<string, string>);
};

const resolveHeaders = (
  headers: AgentChatTransportOptions['headers'],
): Record<string, string> =>
  typeof headers === 'function' ? headers() : headers;

/** Build the reconnect request used by `useChat` to resume a session stream. */
export function agentChatReconnectPreparer(options: AgentChatTransportOptions) {
  return ({ id }: { id: string }) => ({
    api: options.reconnectApi(id),
    headers: resolveHeaders(options.headers),
  });
}

/**
 * Build the AI SDK adapter for agent chat. Widget-specific payload knowledge
 * stays in `buildBody`; this module owns only SDK request wiring.
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
    // Resolve auth per request: the contact JWT may be minted after mount.
    headers: () => resolveHeaders(options.headers),
    prepareSendMessagesRequest: ({ messages, requestMetadata, body }) => ({
      body: buildBody({ messages, requestMetadata, body }),
    }),
    prepareReconnectToStreamRequest: agentChatReconnectPreparer(options),
  });
}
