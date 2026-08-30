import type { StreamingTurnState } from '@opencx/widget-react-headless';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const components = new Map<string, React.ElementType>();

vi.mock('@opencx/widget-react-headless', () => ({
  useWidget: () => ({
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
