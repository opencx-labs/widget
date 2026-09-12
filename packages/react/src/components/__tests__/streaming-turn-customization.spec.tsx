import type { WidgetConfig } from '@opencx/widget-core';
import type { StreamingTurnState } from '@opencx/widget-react-headless';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const components = new Map<string, React.ElementType>();
const config = vi.hoisted((): WidgetConfig => ({ token: 'test' }));

vi.mock('@opencx/widget-react-headless', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@opencx/widget-react-headless')>()),
  useConfig: () => config,
  useDisplayMode: () => 'popover',
  useWidget: () => ({
    widgetCtx: { agent: {} },
    config,
    componentStore: {
      getComponent: (key: string) => components.get(key) ?? null,
    },
  }),
}));

vi.mock('../AgentMessageGroup', () => ({ AgentMessageGroup: () => null }));

import { StreamingTurn } from '../StreamingTurn';

describe('StreamingTurn customization', () => {
  afterEach(() => components.clear());

  it('routes activity and specs through the component registry', () => {
    components.set('agent_chat_steps', ({ active }: { active: boolean }) => (
      <div data-custom-steps={String(active)} />
    ));
    components.set('agent_chat_spec', ({ parts }: { parts: unknown[] }) => (
      <div data-custom-spec={String(parts.length)} />
    ));
    const turn: StreamingTurnState = {
      active: true,
      items: [
        {
          kind: 'steps',
          steps: [{ kind: 'tool', label: 'lookup', done: false }],
        },
        {
          kind: 'spec',
          parts: [{ type: 'data-spec', data: { op: 'set' } }],
        },
      ],
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => root.render(<StreamingTurn turn={turn} agent={undefined} />));

    expect(
      container.querySelector('[data-custom-steps="true"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-custom-spec="1"]')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});

it('narrows already loaded activity after a widget opts out without mutating the source turn', () => {
  components.set('agent_chat_steps', ({ steps }: { steps: unknown[] }) => (
    <pre>{JSON.stringify(steps)}</pre>
  ));
  const turn: StreamingTurnState = {
    active: false,
    items: [
      {
        kind: 'steps',
        steps: [
          {
            kind: 'tool',
            label: 'find_order',
            done: true,
            input: { secret: 'input-canary' },
            output: { secret: 'output-canary' },
          },
          { kind: 'reasoning', label: 'reasoning-canary', done: true },
        ],
      },
    ],
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    config.presentation = { toolActivity: 'details', reasoning: true };
    act(() => root.render(<StreamingTurn turn={turn} agent={undefined} />));
    expect(container.textContent).toContain('input-canary');
    expect(container.textContent).toContain('reasoning-canary');
    config.presentation = { toolActivity: 'status', reasoning: false };
    act(() => root.render(<StreamingTurn turn={turn} agent={undefined} />));
    expect(container.textContent).toContain('find_order');
    expect(container.textContent).not.toContain('canary');
    config.presentation = { toolActivity: 'hidden', reasoning: false };
    act(() => root.render(<StreamingTurn turn={turn} agent={undefined} />));
    expect(container.textContent).not.toContain('find_order');
    expect(JSON.stringify(turn)).toContain('input-canary');
  } finally {
    act(() => root.unmount());
    config.presentation = undefined;
    components.clear();
  }
});
