const CHAT_ROOT = '/backend/widget/v5/chat';

function join(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function sessionPath(sessionId: string, suffix: string): string {
  return `${CHAT_ROOT}/${encodeURIComponent(sessionId)}/${suffix}`;
}

/** Single source for the v5 agent-chat endpoints that are not yet present in
 * the generated OpenAPI client. */
export const agentChatRoutes = {
  stream: (baseUrl: string) => join(baseUrl, `${CHAT_ROOT}/stream`),
  reconnect: (baseUrl: string, sessionId: string) =>
    join(baseUrl, sessionPath(sessionId, 'stream')),
  stop: (baseUrl: string, sessionId: string) =>
    join(baseUrl, sessionPath(sessionId, 'stop')),
  messages: (baseUrl: string, sessionId: string) =>
    join(baseUrl, sessionPath(sessionId, 'messages')),
} as const;
