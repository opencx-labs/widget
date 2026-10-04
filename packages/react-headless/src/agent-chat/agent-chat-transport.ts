import type { WidgetConfig } from '@opencx/widget-core';
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
  /** Sends and resumes the stream; the global fetch when omitted. */
  fetch?: typeof fetch;
};

/**
 * The reconnect URL carrying the embed's presentation choices. Built as a
 * string: React Native 0.76 (Expo 52) throws "URLSearchParams.set is not
 * implemented".
 */
export function appendPresentationParams(
  url: string,
  presentation: WidgetConfig['presentation'],
): string {
  const params: string[] = [];
  if (presentation?.toolActivity)
    params.push(
      `toolActivity=${encodeURIComponent(presentation.toolActivity)}`,
    );
  if (presentation?.reasoning !== undefined)
    params.push(`reasoning=${String(presentation.reasoning)}`);
  if (params.length === 0) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${params.join('&')}`;
}

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
    fetch: options.fetch,
    // Every send carries its full body; a send without one is a programming
    // error, and an empty body would be rejected server-side just as loudly.
    prepareSendMessagesRequest: ({ body }) => ({ body: body ?? {} }),
    prepareReconnectToStreamRequest: agentChatReconnectPreparer(options),
  });
}
