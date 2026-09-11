import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PrimitiveState, WidgetCtx } from '@opencx/widget-core';
import { useWidget, WidgetProvider } from '../WidgetProvider';

const features = {
  preamble: false,
  inline_ui: false,
  dictation: false,
  attachments: false,
  page_context: false,
  client_tools: false,
};

const token = ({
  accountId,
  expiresAt,
}: {
  accountId: string;
  expiresAt: number;
}) => {
  const encode = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    org_id: 'org-1',
    contact: { id: 'contact-1', verified: true },
    mcp_access: { server_ids: ['server-2', 'server-1'], account_id: accountId },
    exp: expiresAt,
  })}.signature-${expiresAt}`;
};

let currentWidgetCtx: WidgetCtx | null = null;
function Probe() {
  currentWidgetCtx = useWidget().widgetCtx;
  return null;
}

describe('WidgetProvider verified identity lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;
  let authorizationHeaders: string[];
  let configRequests: number;

  beforeEach(() => {
    currentWidgetCtx = null;
    authorizationHeaders = [];
    configRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        const authorization = request.headers.get('authorization');
        if (authorization) authorizationHeaders.push(authorization);
        if (new URL(request.url).pathname.endsWith('/widget/v2/config')) {
          configRequests += 1;
          return new Response(
            JSON.stringify({
              org: { id: 'org-1', name: 'Org One' },
              sessionsPollingIntervalSeconds: 60,
              sessionPollingIntervalSeconds: 10,
              modes: [],
              agent: {
                name: 'Agent',
                avatar_url: null,
                streaming: false,
                features,
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ items: [], next: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const render = async (userToken: string) => {
    await act(async () => {
      root.render(
        <WidgetProvider
          options={{
            token: 'widget-token',
            apiUrl: 'https://widget.example',
            user: { token: userToken, externalId: 'customer-user-1' },
          }}
          components={[{ key: 'fallback', component: () => null }]}
        >
          <Probe />
        </WidgetProvider>,
      );
    });
    await vi.waitFor(() => expect(currentWidgetCtx).not.toBeNull());
  };

  it('renews the real transport for the same owner and resets for an account change', async () => {
    const firstToken = token({ accountId: 'account-a', expiresAt: 1 });
    const renewedToken = token({ accountId: 'account-a', expiresAt: 2 });
    const otherAccountToken = token({ accountId: 'account-b', expiresAt: 3 });

    await render(firstToken);
    const firstContext = currentWidgetCtx;
    if (!firstContext) throw new Error('Widget context was not initialized');
    await firstContext.api.listConnections();

    await render(renewedToken);
    expect(currentWidgetCtx).toBe(firstContext);
    await firstContext.api.listConnections();
    expect(authorizationHeaders.at(-1)).toBe(`Bearer ${renewedToken}`);
    expect(configRequests).toBe(1);

    const disposed = vi.spyOn(firstContext, 'dispose');
    await render(otherAccountToken);
    await vi.waitFor(() => expect(currentWidgetCtx).not.toBe(firstContext));
    expect(disposed).toHaveBeenCalledOnce();
    expect(configRequests).toBe(2);
  });

  it('disposes an obsolete runtime that resolves after an identity flip', async () => {
    let resolveFirst: (widgetCtx: WidgetCtx) => void = () => {};
    const obsolete = {
      dispose: vi.fn(),
      api: { setAuthToken: vi.fn() },
      streaming: false,
    } as unknown as WidgetCtx;
    const active = {
      dispose: vi.fn(),
      api: { setAuthToken: vi.fn() },
      streaming: false,
      messageCtx: {
        state: new PrimitiveState({}),
      },
    } as unknown as WidgetCtx;
    vi.spyOn(WidgetCtx, 'initialize')
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce(active);

    await act(async () => {
      root.render(
        <WidgetProvider
          options={{
            token: 'widget-token',
            user: {
              token: token({ accountId: 'account-a', expiresAt: 1 }),
              externalId: 'customer-user-1',
            },
          }}
          components={[{ key: 'fallback', component: () => null }]}
        >
          <Probe />
        </WidgetProvider>,
      );
    });
    await act(async () => {
      root.render(
        <WidgetProvider
          options={{
            token: 'widget-token',
            user: {
              token: token({ accountId: 'account-b', expiresAt: 2 }),
              externalId: 'customer-user-1',
            },
          }}
          components={[{ key: 'fallback', component: () => null }]}
        >
          <Probe />
        </WidgetProvider>,
      );
      resolveFirst(obsolete);
    });

    await vi.waitFor(() => expect(currentWidgetCtx).toBe(active));
    expect(obsolete.dispose).toHaveBeenCalledOnce();
  });
});
