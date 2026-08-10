import { DefaultChatTransport } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import {
  agentChatReconnectPreparer,
  buildAgentChatTransport,
  stopAgentChatTurn,
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

describe('stopAgentChatTurn (stop)', () => {
  it('aborts the client, then cancels the server — in order', async () => {
    const calls: string[] = [];
    const api = { stopStream: vi.fn(async () => void calls.push('server')) };
    const chatStop = vi.fn(() => void calls.push('client'));

    await stopAgentChatTurn({ api, sessionId: 'sess-1', chatStop });

    expect(chatStop).toHaveBeenCalledOnce();
    expect(api.stopStream).toHaveBeenCalledWith('sess-1');
    expect(calls).toEqual(['client', 'server']);
  });

  it('does NOT call the server when there is no session yet', async () => {
    const api = { stopStream: vi.fn(async () => {}) };
    const chatStop = vi.fn();

    await stopAgentChatTurn({ api, sessionId: null, chatStop });

    expect(chatStop).toHaveBeenCalledOnce();
    expect(api.stopStream).not.toHaveBeenCalled();
  });
});
