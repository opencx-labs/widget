import { transferableAbortController } from 'node:util';
import type { WidgetConfig } from '@opencx/widget-core';
import {
  WidgetProvider,
  WidgetTriggerProvider,
} from '@opencx/widget-react-headless';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InitialQuestions } from '../../../components/InitialQuestions';
import { AgentMessageDefaultComponent } from '../../../components/custom-components/AgentMessageDefaultComponent';
import { FallbackDefaultComponent } from '../../../components/custom-components/FallbackDefaultComponent';
import { TooltipProvider } from '../../../components/lib/tooltip';
import { WidgetImperativeHandler } from '../../../WidgetImperativeHandler';
import type { WidgetRef } from '../../../WidgetImperativeHandler';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('initial question lifecycle with the real widget runtime', () => {
  const requests: Array<{ path: string; body: unknown }> = [];
  const declined = vi.fn();
  let options: WidgetConfig;
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let widgetRef: React.RefObject<WidgetRef | null>;

  beforeEach(() => {
    requests.length = 0;
    declined.mockClear();
    options = {
      token: 'test',
      apiUrl: 'https://fixture.test',
      user: { token: 'visitor' },
      streaming: false,
      initialQuestions: [
        {
          text: 'Cancel my order',
          confirm: {
            message: 'Cancel this order?',
            confirmLabel: 'Yes',
            cancelLabel: 'No',
            cancelMessage: 'You can ask another question.',
          },
        },
      ],
      hooks: { onInitialQuestionDeclined: declined },
    };
    vi.stubGlobal(
      'AbortController',
      class {
        constructor() {
          return transferableAbortController();
        }
      },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        const path = new URL(request.url).pathname;
        const body: unknown =
          request.method === 'POST' ? await request.json() : undefined;
        requests.push({ path, body });
        const json = (data: unknown) =>
          new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        const session = {
          id: 'session',
          ticketNumber: 1,
          title: null,
          channel: 'web',
          assignee: { kind: 'ai', name: null, avatarUrl: null },
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          isHandedOff: false,
          isOpened: true,
          isVerified: false,
          lastMessage: '',
          latestStateCheckpointPayload: null,
          modeId: null,
          sessionAttributes: {},
          customStatus: null,
        };
        if (path.endsWith('/config'))
          return json({
            org: { id: 'org', name: 'Org' },
            modes: [],
            sessionPollingIntervalSeconds: 3600,
            sessionsPollingIntervalSeconds: 3600,
            agent: {
              name: 'Agent',
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
          });
        if (path.endsWith('/sessions')) return json({ items: [], next: null });
        if (path.endsWith('/create-session')) return json(session);
        if (path.includes('/poll/')) return json({ session, history: [] });
        if (path.endsWith('/chat/send'))
          return json({
            success: true,
            autopilotResponse: {
              type: 'text',
              value: { error: false, content: 'Reply' },
              id: 'reply',
              mightSolveUserIssue: false,
              completelyAndFullyCoveredUserIssue: false,
              assistMode: false,
            },
          });
        throw new Error(`Unexpected request: ${request.url}`);
      }),
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    widgetRef = React.createRef<WidgetRef>();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const render = () =>
    act(async () => {
      root.render(
        <WidgetProvider
          options={options}
          components={[
            { key: 'bot_message', component: AgentMessageDefaultComponent },
            { key: 'fallback', component: FallbackDefaultComponent },
          ]}
        >
          <WidgetTriggerProvider>
            <WidgetImperativeHandler widgetRef={widgetRef} />
            <TooltipProvider>
              <InitialQuestions />
            </TooltipProvider>
          </WidgetTriggerProvider>
        </WidgetProvider>,
      );
    });
  const button = (text: string) => {
    const found = Array.from(container.querySelectorAll('button')).find(
      (element) => element.textContent === text,
    );
    if (!found) throw new Error(`Missing button: ${text}`);
    return found;
  };
  const click = (text: string) => act(async () => button(text).click());
  const sends = () =>
    requests.filter(({ path }) => path.endsWith('/chat/send'));
  const creates = () =>
    requests.filter(({ path }) => path.endsWith('/create-session'));
  const newChat = () =>
    act(async () => {
      if (!widgetRef.current) throw new Error('Widget is not ready');
      await widgetRef.current.newChat();
    });

  it('clears the prompt and declined reply when choices change, preserving equivalent rerenders', async () => {
    await render();
    await click('Cancel my order');
    expect(container.textContent).toContain('Cancel this order?');
    options = {
      ...options,
      initialQuestions: structuredClone(options.initialQuestions),
    };
    await render();
    expect(container.textContent).toContain('Cancel this order?');
    const oldConfirm = button('Yes');
    options = {
      ...options,
      initialQuestions: [
        {
          text: 'Cancel my order',
          confirm: {
            message: 'Still cancel this order?',
            confirmLabel: 'Confirm',
            cancelLabel: 'Back',
          },
        },
      ],
    };
    await render();
    expect(container.textContent).not.toContain('Cancel this order?');
    await act(async () => oldConfirm.click());
    expect(sends()).toHaveLength(0);
    await click('Cancel my order');
    expect(container.textContent).toContain('Still cancel this order?');
    options = {
      ...options,
      initialQuestions: [
        {
          text: 'Return my order',
          confirm: {
            message: 'Return this order?',
            confirmLabel: 'Yes',
            cancelLabel: 'No',
            cancelMessage: 'Return declined.',
          },
        },
      ],
    };
    await render();
    expect(container.textContent).not.toContain('Still cancel this order?');
    expect(button('Return my order')).toBeDefined();
    expect(declined).not.toHaveBeenCalled();
    await click('Return my order');
    await click('No');
    expect(container.textContent).toContain('Return declined.');
    options = { ...options, initialQuestions: ['Track my order'] };
    await render();
    expect(container.textContent).not.toContain('Return declined.');
    expect(sends()).toHaveLength(0);
    expect(creates()).toHaveLength(0);
    await click('Track my order');
    expect(sends()).toHaveLength(1);
    expect(sends()[0]?.body).toMatchObject({ content: 'Track my order' });
    expect(creates()).toHaveLength(1);
  });

  it('clears the prompt and declined reply on same-screen newChat before any message exists', async () => {
    await render();
    await click('Cancel my order');
    expect(container.textContent).toContain('Cancel this order?');
    await newChat();
    expect(container.textContent).not.toContain('Cancel this order?');
    expect(button('Cancel my order')).toBeDefined();
    expect(declined).not.toHaveBeenCalled();
    await click('Cancel my order');
    await click('No');
    expect(container.textContent).toContain('You can ask another question.');
    expect(declined).toHaveBeenCalledExactlyOnceWith({
      question: 'Cancel my order',
    });
    await newChat();
    expect(container.textContent).not.toContain(
      'You can ask another question.',
    );
    expect(sends()).toHaveLength(0);
    expect(creates()).toHaveLength(0);
    await click('Cancel my order');
    await click('Yes');
    expect(sends()).toHaveLength(1);
    expect(sends()[0]?.body).toMatchObject({ content: 'Cancel my order' });
    expect(creates()).toHaveLength(1);
    expect(declined).toHaveBeenCalledTimes(1);
  });
});
