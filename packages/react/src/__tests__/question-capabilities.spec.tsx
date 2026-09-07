import { transferableAbortController } from 'node:util';
import type { WidgetConfig } from '@opencx/widget-core';
import type { WidgetComponentType } from '@opencx/widget-react-headless';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const captured = vi.hoisted(
  (): {
    options?: WidgetConfig;
    renderer?: WidgetComponentType['component'];
  } => ({}),
);
vi.mock('@opencx/widget-react-headless', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@opencx/widget-react-headless')>();
  function RendererProbe() {
    const { config, componentStore } = actual.useWidget();
    captured.options = config;
    captured.renderer = componentStore.getComponent('agent_chat_questions');
    return null;
  }
  return {
    ...actual,
    // Keep the real provider and registry; replace only the unrelated widget UI.
    WidgetProvider: (
      props: React.ComponentProps<typeof actual.WidgetProvider>,
    ) => (
      <actual.WidgetProvider {...props}>
        <RendererProbe />
      </actual.WidgetProvider>
    ),
  };
});

import { Widget } from '../index';
import { ClarificationQuestions } from '../components/ClarificationQuestions';

describe('Widget receiving question renderer', () => {
  beforeEach(() => {
    captured.options = undefined;
    captured.renderer = undefined;
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      },
      removeItem: (key: string) => {
        stored.delete(key);
      },
    } satisfies Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>);
    // Node's Request requires its own AbortSignal, rather than jsdom's version.
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
        if (!request.url.endsWith('/config'))
          throw new Error(`Unexpected request: ${request.url}`);
        return new Response(
          JSON.stringify({
            org: { id: 'org-1', name: 'Org' },
            sessionPollingIntervalSeconds: 3600,
            sessionsPollingIntervalSeconds: 3600,
            modes: [],
            agent: {
              name: 'Agent',
              avatar_url: null,
              streaming: false,
              features: {
                preamble: false,
                inline_ui: false,
                dictation: false,
                attachments: true,
                page_context: false,
                client_tools: false,
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    'agent_chat_questions',
    'AGENT_CHAT_QUESTIONS',
    'Agent_Chat_Questions',
  ])(
    'keeps declared support aligned with the active %s renderer after rerenders',
    async (key) => {
      const container = document.createElement('div');
      const root = createRoot(container);
      const CustomQuestions = () => null;
      try {
        await act(async () =>
          root.render(
            <Widget options={{ token: 't', collectUserData: true }} />,
          ),
        );
        expect(captured.options?.capabilities?.structuredQuestions).toBe(true);
        expect(captured.renderer).toBe(ClarificationQuestions);
        for (const structuredQuestions of [undefined, true, false]) {
          await act(async () =>
            root.render(
              <Widget
                options={{
                  token: 't',
                  collectUserData: true,
                  capabilities: { structuredQuestions },
                }}
                components={[{ key, component: CustomQuestions }]}
              />,
            ),
          );
          expect(captured.options?.capabilities?.structuredQuestions).toBe(
            structuredQuestions ?? false,
          );
          expect(captured.renderer).toBe(CustomQuestions);
        }
        await act(async () =>
          root.render(
            <Widget options={{ token: 't', collectUserData: true }} />,
          ),
        );
        expect(captured.options?.capabilities?.structuredQuestions).toBe(true);
        expect(captured.renderer).toBe(ClarificationQuestions);
        expect(fetch).toHaveBeenCalledTimes(1);
      } finally {
        act(() => root.unmount());
      }
    },
  );

  it('declares the default renderer, respects opt-outs, and requires custom renderers to opt in', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const components: WidgetComponentType[] = [
      { key: 'agent_chat_questions', component: () => null },
    ];
    try {
      await act(async () =>
        root.render(<Widget options={{ token: 't', collectUserData: true }} />),
      );
      expect(captured.options?.capabilities?.structuredQuestions).toBe(true);
      await act(async () =>
        root.render(
          <Widget
            options={{
              token: 't',
              collectUserData: true,
              capabilities: { structuredQuestions: false },
            }}
          />,
        ),
      );
      expect(captured.options?.capabilities?.structuredQuestions).toBe(false);
      await act(async () =>
        root.render(
          <Widget
            options={{ token: 't', collectUserData: true }}
            components={components}
          />,
        ),
      );
      expect(captured.options?.capabilities?.structuredQuestions).toBe(false);
      await act(async () =>
        root.render(
          <Widget
            options={{
              token: 't',
              collectUserData: true,
              capabilities: { structuredQuestions: true },
            }}
            components={components}
          />,
        ),
      );
      expect(captured.options?.capabilities?.structuredQuestions).toBe(true);
    } finally {
      act(() => root.unmount());
    }
  });
});
