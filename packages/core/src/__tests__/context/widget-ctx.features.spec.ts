import '../api-caller.mock';

import { ApiCaller } from '../../api/api-caller';
import type { Dto } from '../../api/client';
import { WidgetCtx } from '../../context/widget.ctx';
import type { WidgetConfig } from '../../types/widget-config';
import { TestUtils } from '../test-utils';

/**
 * `/config` returns the org's EFFECTIVE `agent.features`; an embed's
 * `config.features` can only switch one OFF (narrow), never ON (widen).
 * `WidgetCtx.features` is the single place that rule lives, so every UI
 * surface asks it instead of the raw flags.
 */
suite('WidgetCtx.features (server-enabled, embed-narrowed)', () => {
  function serverFeatures(overrides: Partial<Dto['WidgetAgentFeaturesDto']>) {
    TestUtils.mock.ApiCaller.getExternalWidgetConfig(ApiCaller, {
      data: {
        org: { id: 'org-1', name: 'Org One' },
        sessionsPollingIntervalSeconds: 60,
        sessionPollingIntervalSeconds: 10,
        modes: [],
        agent: {
          name: 'Agent',
          avatar_url: null,
          streaming: true,
          features: TestUtils.agentFeatures(overrides),
        },
      },
    });
  }

  const everythingOn = {
    preamble: true,
    inline_ui: true,
    dictation: true,
    attachments: true,
    page_context: true,
    client_tools: true,
  };

  const init = (config?: Partial<WidgetConfig>) =>
    WidgetCtx.initialize({ config: { token: '', ...config } });

  test('stores the client-facing server features camelCased on the agent', async () => {
    serverFeatures({ page_context: true, attachments: true });
    const ctx = await init();
    expect(ctx.agent.features).toEqual({
      dictation: false,
      attachments: true,
      pageContext: true,
      clientTools: false,
    });
  });

  test('org on + embed silent → every feature is on', async () => {
    serverFeatures(everythingOn);
    const ctx = await init();
    expect(ctx.features).toEqual({
      dictation: true,
      attachments: true,
      pageContext: true,
      clientTools: true,
    });
    expect(ctx.messageCtx.sendsPageContext).toBe(true);
  });

  test('org on + embed `false` → off (narrowing)', async () => {
    serverFeatures(everythingOn);
    const ctx = await init({
      features: {
        preamble: false,
        inlineUi: false,
        dictation: false,
        pageContext: false,
        clientTools: false,
      },
    });
    expect(ctx.features).toEqual({
      dictation: false,
      // Attachments have no embed toggle: the org decides alone.
      attachments: true,
      pageContext: false,
      clientTools: false,
    });
    expect(ctx.messageCtx.sendsPageContext).toBe(false);
  });

  test('org off + embed `true` → still off (never widens)', async () => {
    serverFeatures({});
    const ctx = await init({
      features: {
        preamble: true,
        inlineUi: true,
        dictation: true,
        pageContext: true,
        clientTools: true,
      },
    });
    expect(ctx.features).toEqual({
      dictation: false,
      attachments: false,
      pageContext: false,
      clientTools: false,
    });
  });

  test('each embed toggle narrows only its own feature', async () => {
    serverFeatures({ page_context: true, client_tools: true, dictation: true });
    const ctx = await init({
      features: { pageContext: false },
    });
    expect(ctx.features.pageContext).toBe(false);
    expect(ctx.features.clientTools).toBe(true);
    expect(ctx.features.dictation).toBe(true);
  });

  test('keeps sends buffered before provider mount when streaming is opted out', async () => {
    serverFeatures({});
    let config: WidgetConfig = { token: '', streaming: true };
    const ctx = await WidgetCtx.initialize({
      config,
      getRequestConfig: () => config,
    });
    await ctx.messageCtx.sendMessage({ content: 'accepted before mount' });
    config = { ...config, streaming: false };
    expect(ctx.streaming).toBe(true);
    const send = vi.fn();
    ctx.messageCtx.registerAgentHandlers({ send });
    expect(send).toHaveBeenCalledExactlyOnceWith({
      content: 'accepted before mount',
    });
    expect(ctx.streaming).toBe(false);
  });

  test('waits for a blocking send to settle before opting into streaming', async () => {
    serverFeatures({});
    let config: WidgetConfig = { token: '', streaming: false };
    const ctx = await WidgetCtx.initialize({
      config,
      getRequestConfig: () => config,
    });
    expect(ctx.streaming).toBe(false);
    ctx.messageCtx.state.setPartial({ isSendingMessage: true });
    config = { ...config, streaming: true };
    expect(ctx.streaming).toBe(false);
    ctx.messageCtx.state.setPartial({ isSendingMessage: false });
    expect(ctx.streaming).toBe(true);
  });
});
