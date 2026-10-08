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
});
