import { describe, expect, it } from 'vitest';
import { agentChatRoutes } from '../../api/agent-chat-routes';

describe('agentChatRoutes', () => {
  it('builds every route from one normalized base URL', () => {
    expect(agentChatRoutes.stream('https://api.example.com/')).toBe(
      'https://api.example.com/backend/widget/v5/chat/stream',
    );
    expect(agentChatRoutes.reconnect('https://api.example.com', 'a/b')).toBe(
      'https://api.example.com/backend/widget/v5/chat/a%2Fb/stream',
    );
    expect(agentChatRoutes.stop('https://api.example.com', 'session')).toBe(
      'https://api.example.com/backend/widget/v5/chat/session/stop',
    );
    expect(agentChatRoutes.messages('https://api.example.com', 'session')).toBe(
      'https://api.example.com/backend/widget/v5/chat/session/messages',
    );
  });
});
