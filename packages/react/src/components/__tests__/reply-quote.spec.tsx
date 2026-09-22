import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { WidgetProvider } from '@opencx/widget-react-headless';
import { ReplyQuote } from '../ReplyQuote';
import type { MessageDto, WidgetConfig } from '@opencx/widget-core';

const QUOTED_ID = 'b1b1b1b1-0000-4000-8000-0000000000ff';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      const data = new URL(request.url).pathname.endsWith('/widget/v2/config')
        ? {
            org: { id: 'org-1', name: 'Payla' },
            sessionsPollingIntervalSeconds: 3600,
            sessionPollingIntervalSeconds: 3600,
            modes: [],
            agent: {
              name: 'Payla Assistant',
              avatar_url: null,
              streaming: false,
              features: {
                preamble: false,
                inline_ui: false,
                dictation: false,
                attachments: false,
                page_context: false,
                client_tools: false,
              },
            },
          }
        : { items: [], next: null };
      return new Response(JSON.stringify(data), {
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

async function renderQuote(
  sender: MessageDto['sender'],
  config: WidgetConfig = { token: 'tok' },
) {
  const replyTo = { id: QUOTED_ID, text: 'Earlier message', sender };
  await act(async () => {
    root.render(
      <WidgetProvider
        options={config}
        components={[{ key: 'fallback', component: () => null }]}
      >
        <ReplyQuote replyTo={replyTo} />
      </WidgetProvider>,
    );
  });
  await vi.waitFor(() =>
    expect(container.querySelector('button')).not.toBeNull(),
  );
  return container.querySelector('button');
}

test('an AI quote uses dashboard branding without an embed override', async () => {
  const quote = await renderQuote({ kind: 'ai' });
  expect(quote?.textContent).toBe('Payla AssistantEarlier message');
});

test('an AI quote uses the same embed override as the transcript', async () => {
  const quote = await renderQuote(
    { kind: 'ai' },
    { token: 'tok', bot: { name: 'Payments Assistant', avatarUrl: null } },
  );
  expect(quote?.textContent).toBe('Payments AssistantEarlier message');
});

test('only the visitor is labelled You', async () => {
  expect(
    (await renderQuote({ kind: 'user', name: 'Customer' }))?.textContent,
  ).toBe('YouEarlier message');
  expect((await renderQuote({ kind: 'agent' }))?.textContent).toBe(
    'TeamEarlier message',
  );
});

test('a named teammate keeps their name unless the embed overrides it', async () => {
  expect(
    (await renderQuote({ kind: 'agent', name: 'Rana' }))?.textContent,
  ).toBe('RanaEarlier message');
  expect(
    (
      await renderQuote(
        { kind: 'agent', name: 'Rana' },
        { token: 'tok', humanAgent: { name: 'Support Team', avatarUrl: null } },
      )
    )?.textContent,
  ).toBe('Support TeamEarlier message');
});

test('unknown senders do not become the visitor', async () => {
  expect(
    (await renderQuote({ kind: 'unknown', name: 'Previous agent' }))
      ?.textContent,
  ).toBe('Previous agentEarlier message');
  expect((await renderQuote({ kind: 'unknown' }))?.textContent).toBe(
    'Earlier message',
  );
});

test('clicking a quote finds its original message in the containing document', async () => {
  const original = document.createElement('div');
  original.dataset.messageId = QUOTED_ID;
  const scrollIntoView = vi.fn();
  const animate = vi.fn();
  Object.assign(original, { scrollIntoView, animate });
  const quote = await renderQuote({ kind: 'user' });
  container.append(original);
  act(() => quote?.click());
  expect(scrollIntoView).toHaveBeenCalledWith({
    behavior: 'smooth',
    block: 'center',
  });
  expect(animate).toHaveBeenCalledOnce();
  original.remove();
  act(() => quote?.click());
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
});
