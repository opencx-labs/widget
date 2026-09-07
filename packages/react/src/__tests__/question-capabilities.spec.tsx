import type { WidgetConfig } from '@opencx/widget-core';
import type { WidgetComponentType } from '@opencx/widget-react-headless';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const captured = vi.hoisted((): { options?: WidgetConfig } => ({}));
vi.mock('@opencx/widget-react-headless', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@opencx/widget-react-headless')>()),
  WidgetProvider: ({ options }: { options: WidgetConfig }) => {
    captured.options = options;
    return null;
  },
}));

import { Widget } from '../index';

describe('Widget receiving question renderer', () => {
  it('recognizes custom question keys regardless of casing', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      act(() => root.render(<Widget options={{ token: 't' }} />));
      expect(captured.options?.capabilities?.structuredQuestions).toBe(true);
      act(() =>
        root.render(
          <Widget
            options={{ token: 't' }}
            components={[
              { key: 'AGENT_CHAT_QUESTIONS', component: () => null },
            ]}
          />,
        ),
      );
      expect(captured.options?.capabilities?.structuredQuestions).toBe(false);
    } finally {
      act(() => root.unmount());
    }
  });

  it('declares the default renderer, respects opt-outs, and requires custom renderers to opt in', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const components: WidgetComponentType[] = [
      { key: 'agent_chat_questions', component: () => null },
    ];
    try {
      act(() => root.render(<Widget options={{ token: 't' }} />));
      expect(captured.options?.capabilities?.structuredQuestions).toBe(true);
      act(() =>
        root.render(
          <Widget
            options={{
              token: 't',
              capabilities: { structuredQuestions: false },
            }}
          />,
        ),
      );
      expect(captured.options?.capabilities?.structuredQuestions).toBe(false);
      act(() =>
        root.render(
          <Widget options={{ token: 't' }} components={components} />,
        ),
      );
      expect(captured.options?.capabilities?.structuredQuestions).toBe(false);
      act(() =>
        root.render(
          <Widget
            options={{
              token: 't',
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
