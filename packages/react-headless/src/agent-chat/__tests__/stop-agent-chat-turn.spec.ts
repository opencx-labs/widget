import { describe, expect, it, vi } from 'vitest';
import { stopAgentChatTurn } from '../stop-agent-chat-turn';

describe('stopAgentChatTurn', () => {
  it('aborts the client, then cancels the server — in order', async () => {
    const calls: string[] = [];
    const api = { stopStream: vi.fn(async () => void calls.push('server')) };
    const chatStop = vi.fn(() => void calls.push('client'));

    await stopAgentChatTurn({ api, sessionId: 'sess-1', chatStop });

    expect(chatStop).toHaveBeenCalledOnce();
    expect(api.stopStream).toHaveBeenCalledWith('sess-1');
    expect(calls).toEqual(['client', 'server']);
  });

  it('does not call the server when there is no session yet', async () => {
    const api = { stopStream: vi.fn(async () => {}) };
    const chatStop = vi.fn();

    await stopAgentChatTurn({ api, sessionId: null, chatStop });

    expect(chatStop).toHaveBeenCalledOnce();
    expect(api.stopStream).not.toHaveBeenCalled();
  });

  it('still cancels server generation when the local abort throws', async () => {
    const api = { stopStream: vi.fn(async () => {}) };
    const clientError = new Error('client abort failed');

    await expect(
      stopAgentChatTurn({
        api,
        sessionId: 'sess-1',
        chatStop: vi.fn(async () => {
          throw clientError;
        }),
      }),
    ).rejects.toBe(clientError);

    expect(api.stopStream).toHaveBeenCalledWith('sess-1');
  });
});
