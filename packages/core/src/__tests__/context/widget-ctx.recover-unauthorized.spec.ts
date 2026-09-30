import '../api-caller.mock';

import { ApiCaller } from '../../api/api-caller';
import { WidgetCtx } from '../../context/widget.ctx';
import type { WidgetConfig } from '../../types/widget-config';
import { TestUtils } from '../test-utils';

/**
 * A live tab whose contact token the backend stops accepting (the contact
 * was removed, or the token predates a server change) must heal itself: mint
 * a fresh anonymous contact, drop the dead session, and reload history — not
 * fail every send until the visitor reloads.
 */
suite('WidgetCtx — recovery from a rejected contact token', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function init(config?: Partial<WidgetConfig>) {
    TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, {
      data: {
        org: { id: 'org-1', name: 'Org One' },
        sessionsPollingIntervalSeconds: 3600,
        sessionPollingIntervalSeconds: 3600,
        modes: [],
        agent: {
          name: 'Agent',
          avatar_url: null,
          streaming: true,
          features: TestUtils.agentFeatures({}),
        },
      },
    });
    const ctx = await WidgetCtx.initialize({
      config: { token: 'tok', ...config },
    });
    await settle();
    return ctx;
  }

  test('a 401 mints a fresh contact, drops the session and reloads history', async () => {
    const ctx = await init();
    const mint = vi.mocked(ctx.api.createUnverifiedContact);
    const sessions = vi.mocked(ctx.api.getSessions);
    const mintsBefore = mint.mock.calls.length;
    const sessionsBefore = sessions.mock.calls.length;
    await ctx.contactCtx.setUnverifiedContact('dead-token');
    ctx.sessionCtx.sessionState.setPartial({
      session: {
        id: 's-dead',
        ticketNumber: 1,
        title: null,
        createdAt: '',
        updatedAt: '',
        isHandedOff: false,
        isOpened: true,
        assignee: { kind: 'ai', name: null, avatarUrl: null },
        channel: 'web',
        isVerified: false,
        lastMessage: null,
        modeId: null,
        latestStateCheckpointPayload: null,
        sessionAttributes: {},
        customStatus: null,
      },
    });
    const resetChat = vi.spyOn(ctx, 'resetChat');

    ctx.api.onUnauthorized?.();
    await settle();
    await settle();

    expect(mint.mock.calls.length).toBe(mintsBefore + 1);
    expect(ctx.contactCtx.state.get().contact?.token).toBe('some-token');
    expect(resetChat).toHaveBeenCalledTimes(1);
    expect(ctx.sessionCtx.sessionState.get().session).toBeNull();
    expect(sessions.mock.calls.length).toBeGreaterThan(sessionsBefore);
    ctx.dispose();
  });

  test('overlapping 401s recover once', async () => {
    const ctx = await init();
    const mint = vi.mocked(ctx.api.createUnverifiedContact);
    const before = mint.mock.calls.length;
    ctx.api.onUnauthorized?.();
    ctx.api.onUnauthorized?.();
    ctx.api.onUnauthorized?.();
    await settle();
    await settle();
    expect(mint.mock.calls.length).toBe(before + 1);
    ctx.dispose();
  });

  test('a host-provided user token is never replaced', async () => {
    const ctx = await init({ user: { token: 'host-signed' } });
    const mint = vi.mocked(ctx.api.createUnverifiedContact);
    const before = mint.mock.calls.length;
    const resetChat = vi.spyOn(ctx, 'resetChat');
    ctx.api.onUnauthorized?.();
    await settle();
    expect(mint.mock.calls.length).toBe(before);
    expect(resetChat).not.toHaveBeenCalled();
    ctx.dispose();
  });
});
