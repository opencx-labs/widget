import '../api-caller.mock';
import { ApiCaller } from '../../api/api-caller';
import { WidgetCtx } from '../../context/widget.ctx';
import type { SessionDto } from '../../types/dtos';
import { TestUtils } from '../test-utils';

function buildSession(overrides: Partial<SessionDto> = {}): SessionDto {
  return {
    id: 'a3a3a3a3-0000-4000-8000-000000000001',
    ticketNumber: 1,
    title: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isHandedOff: false,
    isOpened: true,
    assignee: { kind: 'ai', name: null, avatarUrl: null },
    channel: 'web',
    isVerified: false,
    lastMessage: 'Hi',
    unread: false,
    modeId: null,
    latestStateCheckpointPayload: null,
    sessionAttributes: {},
    customStatus: null,
    ...overrides,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

suite('unread sessions across the widget runtime', () => {
  test('companion conversations share the root count, and a viewed session is reported through the real API', async () => {
    TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, undefined);
    const root = await WidgetCtx.initialize({
      config: { token: 'test', user: { token: 'visitor' } },
    });
    const child = root.createConversation();
    expect(child.unreadCtx).toBe(root.unreadCtx);

    const a = buildSession({ id: 'a', unread: true });
    const b = buildSession({ id: 'b', unread: true });
    root.sessionCtx.setSessions([a, b]);
    expect(root.unreadCtx.state.get().count).toBe(2);

    vi.mocked(root.api.markSessionRead).mockResolvedValueOnce({
      response: new Response(),
      data: { ...a, unread: false },
    });
    child.unreadCtx.setViewingSessionId('a');
    await settle();
    expect(root.api.markSessionRead).toHaveBeenCalledExactlyOnceWith({
      sessionId: 'a',
    });
    expect(
      root.sessionCtx.sessionsState.get().data.find((s) => s.id === 'a')
        ?.unread,
    ).toBe(false);
    expect(root.unreadCtx.state.get()).toEqual({
      unreadSessionIds: ['b'],
      count: 1,
    });

    child.releaseConversation();
    root.dispose();
    root.sessionCtx.setSessions([
      { ...b, unread: true, lastMessage: 'after dispose' },
    ]);
    expect(root.unreadCtx.state.get().count).toBe(1);
  });

  test('a failed first sessions request does not make replies that were already waiting count as new', async () => {
    vi.useFakeTimers();
    try {
      TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, undefined);
      const waiting = buildSession({ id: 'waiting', unread: true });
      vi.mocked(ApiCaller.prototype.getSessions)
        .mockClear()
        .mockResolvedValueOnce({
          response: new Response(null, { status: 503 }),
          data: undefined,
          error: { message: 'unavailable' },
        })
        .mockResolvedValue({
          response: new Response(),
          data: { items: [waiting], next: null },
        });
      const replies: string[] = [];
      const root = await WidgetCtx.initialize({
        config: {
          token: 'test',
          user: { token: 'visitor' },
          hooks: { onUnreadReply: ({ session }) => replies.push(session.id) },
        },
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(ApiCaller.prototype.getSessions).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(60_000);
      // Positive control: the second poll landed and the session counts.
      expect(root.unreadCtx.state.get().count).toBe(1);
      expect(replies).toEqual([]);

      const reply = new Date(Date.now() + 1_000).toISOString();
      vi.mocked(ApiCaller.prototype.getSessions).mockResolvedValue({
        response: new Response(),
        data: { items: [{ ...waiting, updatedAt: reply }], next: null },
      });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(replies).toEqual(['waiting']);
      root.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
