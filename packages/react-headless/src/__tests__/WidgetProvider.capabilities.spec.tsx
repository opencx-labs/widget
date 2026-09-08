import { transferableAbortController } from 'node:util';
import type { SessionDto, WidgetConfig, WidgetCtx } from '@opencx/widget-core';
import React, { act, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WidgetProvider, useWidget } from '../WidgetProvider';
import { useMessages } from '../hooks/useMessages';

const session: SessionDto = {
  id: 'a3a3a3a3-0000-4000-8000-000000000001',
  ticketNumber: 1,
  title: null,
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
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
};

function SendProbe({ onContext }: { onContext: (ctx: WidgetCtx) => void }) {
  const { widgetCtx } = useWidget();
  const { sendMessage } = useMessages();
  useLayoutEffect(() => {
    widgetCtx.sessionCtx.sessionState.setPartial({ session });
    onContext(widgetCtx);
  }, [widgetCtx, onContext]);
  return (
    <button onClick={() => void sendMessage({ content: 'hello' })}>Send</button>
  );
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('WidgetProvider blocking capability updates', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the latest declaration on the same initialized client after opt-in, opt-out, and removal', async () => {
    // Node's Request requires its own AbortSignal, rather than jsdom's version.
    vi.stubGlobal(
      'AbortController',
      class {
        constructor() {
          return transferableAbortController();
        }
      },
    );
    const bodies: unknown[] = [];
    let configFetches = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        if (request.url.endsWith('/config')) {
          configFetches += 1;
          return jsonResponse({
            org: { id: 'org-1', name: 'Org' },
            sessionPollingIntervalSeconds: 3600,
            sessionsPollingIntervalSeconds: 3600,
            modes: [],
            agent: {
              name: 'Agent',
              avatar_url: null,
              streaming: true,
              features: {
                preamble: false,
                inline_ui: false,
                dictation: false,
                attachments: true,
                page_context: true,
                client_tools: false,
              },
            },
          });
        }
        if (request.url.includes('/poll'))
          return jsonResponse({ session, history: [] });
        if (request.url.endsWith('/chat/send')) {
          const body: unknown = JSON.parse(await request.text());
          bodies.push(body);
          return jsonResponse({
            success: true,
            autopilotResponse: { value: { content: 'Reply' } },
          });
        }
        throw new Error(`Unexpected request: ${request.method} ${request.url}`);
      }),
    );
    const contexts = new Set<WidgetCtx>();
    const onContext = (ctx: WidgetCtx) => {
      contexts.add(ctx);
    };
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      for (const structuredQuestions of [undefined, true, false, undefined]) {
        const options: WidgetConfig = {
          token: 'token',
          streaming: false,
          presentation: {
            toolActivity: structuredQuestions ? 'details' : 'hidden',
            reasoning: structuredQuestions === true,
          },
          features: {
            preamble: structuredQuestions === true,
            pageContext: structuredQuestions === true,
          },
          collectUserData: true,
          capabilities:
            structuredQuestions === undefined
              ? undefined
              : { structuredQuestions },
        };
        await act(async () =>
          root.render(
            <WidgetProvider
              options={options}
              components={[{ key: 'fallback', component: () => null }]}
            >
              <SendProbe onContext={onContext} />
            </WidgetProvider>,
          ),
        );
        const button = container.querySelector('button');
        if (!button) throw new Error('Widget did not initialize');
        const before = bodies.length;
        await act(async () => button.click());
        expect(bodies).toHaveLength(before + 1);
        expect(bodies.at(-1)).toMatchObject({
          presentation: options.presentation,
          features: { preamble: options.features?.preamble },
        });
        expect(Array.from(contexts)[0]?.streaming).toBe(false);
        expect(Array.from(contexts)[0]?.features.pageContext).toBe(
          structuredQuestions === true,
        );
        expect(Array.from(contexts)[0]?.messageCtx.sendsPageContext).toBe(
          structuredQuestions === true,
        );
        if (structuredQuestions === undefined)
          expect(bodies.at(-1)).not.toHaveProperty('capabilities');
        else
          expect(bodies.at(-1)).toMatchObject({
            capabilities: { structured_questions: structuredQuestions },
          });
      }
      expect(configFetches).toBe(1);
      expect(contexts.size).toBe(1);
      expect(
        Array.from(contexts)[0]?.messageCtx.state.get().messages,
      ).toHaveLength(8);
    } finally {
      act(() => {
        root.unmount();
        contexts.forEach((ctx) => ctx.resetChat());
      });
    }
  });
});
