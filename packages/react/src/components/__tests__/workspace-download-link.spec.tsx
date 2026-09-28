import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PrimitiveState, WidgetCtx } from '@opencx/widget-core';

const state = vi.hoisted(() => ({
  widget: undefined as
    | undefined
    | {
        api: WidgetCtx['api'];
        sessionCtx: {
          sessionState: PrimitiveState<{ session: { id: string } | null }>;
        };
      },
}));
vi.mock('@opencx/widget-react-headless', async (original) => ({
  ...(await original<typeof import('@opencx/widget-react-headless')>()),
  useConfig: () => ({}),
  useDocumentDir: () => ({ dir: 'ltr' }),
  useWidget: () => ({ widgetCtx: state.widget }),
}));
import { RichText } from '../RichText';
import { SpecRenderer } from '../../json-render/SpecRenderer';

const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const url = `http://localhost:8080/backend/widget/v5/workspace/${sessionId}/files/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`;
let root: Root;
let runtime: WidgetCtx;
let container: HTMLDivElement;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            org: { id: 'org', name: 'Org' },
            modes: [],
            sessionPollingIntervalSeconds: 3600,
            sessionsPollingIntervalSeconds: 3600,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
  runtime = await WidgetCtx.initialize({
    config: {
      token: 'org',
      collectUserData: true,
      apiUrl: 'http://localhost:8080',
    },
  });
  runtime.api.setAuthToken('user');
  state.widget = {
    api: runtime.api,
    sessionCtx: {
      sessionState: new PrimitiveState<{ session: { id: string } | null }>({
        session: { id: sessionId },
      }),
    },
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = vi.fn(() => 'blob:private-report');
      static override revokeObjectURL = vi.fn();
    },
  );
});
afterEach(async () => {
  act(() => root.unmount());
  await runtime.dispose();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('a reply download is fetched on click with current authentication and saved locally', async () => {
  const fetcher = vi.fn(
    async () =>
      new Response('csv', {
        headers: {
          'content-disposition': "attachment; filename*=UTF-8''report.csv",
        },
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  const clicks: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push(this.download);
  });
  await act(async () =>
    root.render(<RichText>{`[Download report](${url})`}</RichText>),
  );
  expect(fetcher).not.toHaveBeenCalled();
  state.widget?.api.setAuthToken('renewed');
  await act(async () =>
    container
      .querySelector('a')
      ?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      ),
  );
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0]).toEqual([
    url,
    expect.objectContaining({
      headers: { 'X-Bot-Token': 'org', Authorization: 'Bearer renewed' },
    }),
  ]);
  expect(clicks).toEqual(['report.csv']);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

test.each(['unmount', 'session'])(
  'a pending report is discarded on %s',
  async (change) => {
    let resolve: ((value: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await act(async () =>
      root.render(<RichText>{`[Report](${url})`}</RichText>),
    );
    await act(async () =>
      container
        .querySelector('a')
        ?.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true }),
        ),
    );
    await act(async () => {
      if (change === 'unmount') root.render(null);
      else state.widget?.sessionCtx.sessionState.set({ session: null });
      resolve?.(new Response('previous user bytes'));
    });
    expect(click).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  },
);

test('shows an expired authentication error without navigation or a download', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('expired', { status: 401 })),
  );
  await act(async () => root.render(<RichText>{`[Report](${url})`}</RichText>));
  await act(async () =>
    container
      .querySelector('a')
      ?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      ),
  );
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'Sign in again',
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

test.each([false, true])(
  'a rich list report authenticates in a reply with active=%s',
  async (active) => {
    const fetcher = vi.fn(async () => new Response('private csv'));
    vi.stubGlobal('fetch', fetcher);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await act(async () =>
      root.render(
        <SpecRenderer
          active={active}
          spec={{
            root: 'report',
            elements: {
              report: {
                type: 'List',
                props: { items: [{ label: 'Download report', href: url }] },
              },
            },
          }}
        />,
      ),
    );
    const link = container.querySelector('a');
    expect(link?.textContent).toContain('Download report');
    expect(link?.className).toContain('grid');
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () =>
      link?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      ),
    );
    expect(fetcher).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        headers: { 'X-Bot-Token': 'org', Authorization: 'Bearer user' },
      }),
    );
    expect(click).toHaveBeenCalledOnce();
  },
);

test('a pending download survives the next text delta in a live reply', async () => {
  let resolve: ((value: Response) => void) | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  await act(async () => root.render(<RichText>{`[Report](${url})`}</RichText>));
  await act(async () =>
    container
      .querySelector('a')
      ?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      ),
  );
  await act(async () =>
    root.render(<RichText>{`[Report](${url})\n\nThe total is 200.`}</RichText>),
  );
  await act(async () => {
    resolve?.(new Response('report'));
  });
  expect(click).toHaveBeenCalledOnce();
});
