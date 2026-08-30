import { DefaultChatTransport } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  agentChatReconnectPreparer,
  buildAgentChatTransport,
  type AgentChatTransportOptions,
} from '../agent-chat-transport';

const options: AgentChatTransportOptions = {
  api: 'https://api.test/backend/widget/v5/chat/stream',
  reconnectApi: (id) => `https://api.test/backend/widget/v5/chat/${id}/stream`,
  headers: { 'X-Bot-Token': 'tok', Authorization: 'Bearer user' },
};

describe('agentChatReconnectPreparer (resume wiring)', () => {
  it('points a resume at the session-scoped GET with the auth headers', () => {
    const prepare = agentChatReconnectPreparer(options);
    expect(prepare({ id: 'sess-1' })).toEqual({
      api: 'https://api.test/backend/widget/v5/chat/sess-1/stream',
      headers: { 'X-Bot-Token': 'tok', Authorization: 'Bearer user' },
    });
  });
});

describe('buildAgentChatTransport', () => {
  it('constructs a DefaultChatTransport', () => {
    const transport = buildAgentChatTransport({
      options,
      buildBody: ({ messages }) => ({ n: messages.length }),
    });
    expect(transport).toBeInstanceOf(DefaultChatTransport);
  });
});
