import { DefaultChatTransport, type UIMessage } from 'ai';

/** Wiring the api layer hands the agent-chat transport (send + reconnect URLs + auth). */
export type AgentChatTransportOptions = {
  /** POST endpoint that starts a turn and streams it. */
  api: string;
  /** Session-scoped GET the transport hits to resume an in-flight stream. */
  reconnectApi: (sessionId: string) => string;
  /**
   * Auth headers (X-Bot-Token + Authorization), content-type stripped,
   * resolved PER REQUEST: the contact JWT is minted lazily on first contact
   * creation, so a snapshot taken at mount would send every stream request
   * without Authorization (401) for the rest of the session.
   */
  headers: () => Record<string, string>;
};

/** Build the reconnect request used by `useChat` to resume a session stream. */
export function agentChatReconnectPreparer(options: AgentChatTransportOptions) {
  return ({ id }: { id: string }) => ({
    api: options.reconnectApi(id),
    headers: options.headers(),
  });
}

/**
 * The AI SDK adapter for agent chat. It owns only SDK request wiring: the
 * whole wire body is handed to each send (`buildSendMessageBody`) and
 * forwarded as-is.
 */
export function buildAgentChatTransport(
  options: AgentChatTransportOptions,
): DefaultChatTransport<UIMessage> {
  return new DefaultChatTransport<UIMessage>({
    api: options.api,
    headers: () => options.headers(),
    // Every send carries its full body; a send without one is a programming
    // error, and an empty body would be rejected server-side just as loudly.
    prepareSendMessagesRequest: ({ body }) => ({ body: body ?? {} }),
    prepareReconnectToStreamRequest: agentChatReconnectPreparer(options),
  });
}
