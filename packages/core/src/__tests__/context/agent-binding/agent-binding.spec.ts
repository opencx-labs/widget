import '../../api-caller.mock';

import { ApiCaller } from '../../../api/api-caller';
import {
  WidgetCtx,
  WidgetInitializationError,
} from '../../../context/widget.ctx';
import { TestUtils } from '../../test-utils';

/**
 * Agents-platform binding (`config.agentId`): the config fetch resolves the
 * bound agent's branding onto `widgetCtx.agent` (snake_case mapped to the
 * widget's camelCase), and every created session carries the agentId so the
 * backend serves it with that agent's published configuration. Unbound embeds
 * behave exactly as before.
 */
suite('agent binding', () => {
  test('bound embed: server agent branding is stored (snake_case mapped) and sessions carry agentId', async () => {
    const agentId = 'e82b4a75-20d6-4258-ac1f-000000000001';
    TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, {
      data: {
        org: { id: 'org-1', name: 'Org One' },
        sessionsPollingIntervalSeconds: 60,
        sessionPollingIntervalSeconds: 10,
        modes: [],
        agent: {
          id: agentId,
          name: 'Agent Two',
          avatar_url: 'https://cdn.example.com/a2.png',
        },
      },
    });

    const widgetCtx = await WidgetCtx.initialize({
      config: { token: '', agentId },
    });

    expect(widgetCtx.agent).toEqual({
      id: agentId,
      name: 'Agent Two',
      avatarUrl: 'https://cdn.example.com/a2.png',
    });

    await widgetCtx.sessionCtx.createSession();
    expect(ApiCaller.prototype.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ agentId }),
    );
  });

  test('bound embed with a null avatar keeps the mapped null (no accidental empty string)', async () => {
    const agentId = 'e82b4a75-20d6-4258-ac1f-000000000002';
    TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, {
      data: {
        org: { id: 'org-1', name: 'Org One' },
        sessionsPollingIntervalSeconds: 60,
        sessionPollingIntervalSeconds: 10,
        modes: [],
        agent: { id: agentId, name: 'No Avatar', avatar_url: null },
      },
    });

    const widgetCtx = await WidgetCtx.initialize({
      config: { token: '', agentId },
    });
    expect(widgetCtx.agent?.avatarUrl).toBeNull();
  });

  test('unbound embed: no agent stored, sessions carry no agentId (regression guard)', async () => {
    TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, {});

    const widgetCtx = await WidgetCtx.initialize({ config: { token: '' } });
    expect(widgetCtx.agent).toBeUndefined();

    await widgetCtx.sessionCtx.createSession();
    expect(ApiCaller.prototype.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: undefined }),
    );
  });

  test('explicit binding cannot silently fall back when the response omits the requested agent', async () => {
    const agentId = 'e82b4a75-20d6-4258-ac1f-000000000003';
    TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, {
      data: {
        org: { id: 'org-1', name: 'Org One' },
        sessionsPollingIntervalSeconds: 60,
        sessionPollingIntervalSeconds: 10,
        modes: [],
      },
    });

    await expect(
      WidgetCtx.initialize({ config: { token: '', agentId } }),
    ).rejects.toMatchObject({
      name: WidgetInitializationError.name,
      code: 'agent-binding-missing',
    });
  });

  test('a thrown create-session request clears its loading state and returns null', async () => {
    TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, {});
    const widgetCtx = await WidgetCtx.initialize({ config: { token: '' } });
    const error = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(ApiCaller.prototype.createSession).mockRejectedValueOnce(error);

    await expect(widgetCtx.sessionCtx.createSession()).resolves.toBeNull();
    expect(widgetCtx.sessionCtx.sessionState.get().isCreatingSession).toBe(
      false,
    );
  });
});
