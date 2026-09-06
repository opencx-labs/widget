import '../api-caller.mock';

import { ApiCaller } from '../../api/api-caller';
import { WidgetCtx, WidgetInitializationError } from '../../context/widget.ctx';
import { TestUtils } from '../test-utils';

/**
 * The SERVER decides which engine an embed runs: `/config` always returns the
 * org's agent (`name`, `avatar_url`, `streaming`). `streaming: true` selects
 * the v5 streaming engine, `false` the classic blocking send. The widget
 * stores the branding (snake_case mapped to camelCase).
 */
suite('streaming engine selection (server-decided)', () => {
  test('streaming org: agent branding is stored and the streaming engine is selected', async () => {
    TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, {
      data: {
        org: { id: 'org-1', name: 'Org One' },
        sessionsPollingIntervalSeconds: 60,
        sessionPollingIntervalSeconds: 10,
        modes: [],
        agent: {
          name: 'Agent Two',
          avatar_url: 'https://cdn.example.com/a2.png',
          streaming: true,
          features: TestUtils.agentFeatures(),
        },
      },
    });

    const widgetCtx = await WidgetCtx.initialize({ config: { token: '' } });

    expect(widgetCtx.agent).toEqual({
      name: 'Agent Two',
      avatarUrl: 'https://cdn.example.com/a2.png',
      streaming: true,
      features: {
        dictation: false,
        attachments: false,
        pageContext: false,
        clientTools: false,
      },
    });
    expect(widgetCtx.streaming).toBe(true);
    expect(widgetCtx.messageCtx.streaming).toBe(true);
  });

  test('non-streaming org: the blocking engine is selected, null avatar stays null', async () => {
    TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, {
      data: {
        org: { id: 'org-1', name: 'Org One' },
        sessionsPollingIntervalSeconds: 60,
        sessionPollingIntervalSeconds: 10,
        modes: [],
        agent: {
          name: 'No Avatar',
          avatar_url: null,
          streaming: false,
          features: TestUtils.agentFeatures(),
        },
      },
    });

    const widgetCtx = await WidgetCtx.initialize({ config: { token: '' } });

    expect(widgetCtx.agent.avatarUrl).toBeNull();
    expect(widgetCtx.streaming).toBe(false);
    expect(widgetCtx.messageCtx.streaming).toBe(false);
  });

  test('a backend without an agent block runs the classic widget', async () => {
    TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, {
      data: {
        org: { id: 'org-1', name: 'Org One' },
        sessionsPollingIntervalSeconds: 60,
        sessionPollingIntervalSeconds: 10,
        modes: [],
        // A pre-v5 backend: no `agent` at all.
        agent: undefined as never,
      },
    });
    const widgetCtx = await WidgetCtx.initialize({ config: { token: '' } });

    expect(widgetCtx.agent).toEqual({
      name: 'Org One',
      avatarUrl: null,
      streaming: false,
      features: {
        dictation: false,
        attachments: true,
        pageContext: false,
        clientTools: false,
      },
    });
    expect(widgetCtx.streaming).toBe(false);
    expect(widgetCtx.features.attachments).toBe(true);
    expect(widgetCtx.features.pageContext).toBe(false);
  });

  test('a failed config fetch surfaces as a coded initialization error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(
      ApiCaller.prototype.getExternalWidgetConfig,
    ).mockResolvedValueOnce({
      response: new Response(null, { status: 500 }),
      data: undefined,
      error: { message: 'boom' },
    });

    await expect(
      WidgetCtx.initialize({ config: { token: '' } }),
    ).rejects.toMatchObject({
      name: WidgetInitializationError.name,
      code: 'config-fetch-failed',
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
