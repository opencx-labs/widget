import { describe, expect, it } from 'vitest';
import { resolveSendFeatures } from '../../context/message.ctx';
import {
  resolveClientFeatures,
  resolveWidgetAgent,
} from '../../context/widget-agent';

const config = (pageActions?: boolean) => ({
  token: 'test',
  features: { pageContext: true, clientTools: true, pageActions },
});

function agent(pageActions?: boolean) {
  const server = {
    name: 'Test',
    avatar_url: null,
    streaming: true,
    features: {
      preamble: true,
      inline_ui: true,
      dictation: false,
      attachments: true,
      page_context: true,
      client_tools: true,
      ...(pageActions === undefined ? {} : { page_actions: pageActions }),
    },
  };
  return resolveWidgetAgent({ org: { name: 'Test' }, agent: server });
}

describe('independent page action authority', () => {
  it('allows pointing without permitting clicks or typing', () => {
    expect(resolveClientFeatures(agent(true), config())).toMatchObject({
      pageContext: true,
      clientTools: true,
      pageActions: false,
    });
    expect(resolveSendFeatures(config())).toMatchObject({
      page_context: true,
      client_tools: true,
      page_actions: false,
    });
  });

  it('requires both backend support and explicit embed permission', () => {
    expect(resolveClientFeatures(agent(true), config(true))).toMatchObject({
      pageActions: true,
    });
    expect(resolveSendFeatures(config(true))).toMatchObject({
      page_actions: true,
    });
    for (const enabled of [false, undefined]) {
      expect(resolveClientFeatures(agent(enabled), config(true))).toMatchObject(
        { pageActions: false },
      );
    }
    expect(resolveClientFeatures(agent(true), config(false))).toMatchObject({
      pageActions: false,
    });
  });

  it('cannot act without the page-reading and pointing permissions', () => {
    for (const features of [
      { pageActions: true },
      { pageContext: true, pageActions: true },
      { clientTools: true, pageActions: true },
    ]) {
      expect(resolveSendFeatures({ token: 'test', features })).toMatchObject({
        page_actions: false,
      });
      expect(
        resolveClientFeatures(agent(true), { token: 'test', features }),
      ).toMatchObject({ pageActions: false });
    }
  });
});
