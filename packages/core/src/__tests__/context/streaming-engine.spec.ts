import '../api-caller.mock';

import { ApiCaller } from '../../api/api-caller';
import { WidgetCtx, WidgetInitializationError } from '../../context/widget.ctx';
import { TestUtils } from '../test-utils';

/** The org must support streaming AND the client must explicitly opt in. */
suite('streaming engine selection (explicit client opt-in)', () => {
  test.each([undefined, false, true])(
    'streaming org respects client opt-in: %s',
    async (streaming) => {
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

      const widgetCtx = await WidgetCtx.initialize({
        config: { token: '', streaming },
      });

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
      expect(widgetCtx.streaming).toBe(streaming === true);
      expect(widgetCtx.messageCtx.streaming).toBe(streaming === true);
    },
  );

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
