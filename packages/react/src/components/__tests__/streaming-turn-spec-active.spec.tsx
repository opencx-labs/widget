import type { WidgetConfig } from '@opencx/widget-core';
import type { StreamingTurnState } from '@opencx/widget-react-headless';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { StreamingSpec, StreamingTurn } from '../StreamingTurn';

/**
 * The turn's `active` flag reaches the spec component, so the default
 * `StreamingSpec` can shimmer an empty container while the spec streams and
 * settle it (no pulse) when the turn ends — and a custom `agent_chat_spec`
 * gets the same signal.
 */

// Patches for a Card whose only child has not been streamed yet.
const EMPTY_CARD_PARTS = [
  {
    type: 'data-spec' as const,
    data: { type: 'patch', patch: { op: 'add', path: '/root', value: 'card' } },
  },
  {
    type: 'data-spec' as const,
    data: {
      type: 'patch',
      patch: {
        op: 'add',
        path: '/elements/card',
        value: { type: 'Card', props: { title: 'Orders' }, children: ['m'] },
      },
    },
  },
];

const turnWith = (active: boolean): StreamingTurnState => ({
  active,
  items: [{ kind: 'spec', parts: EMPTY_CARD_PARTS }],
});

describe('StreamingTurn spec `active`', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    components.clear();
  });

  const render = (turn: StreamingTurnState) =>
    act(() => root.render(<StreamingTurn turn={turn} agent={undefined} />));
  const shimmer = () => container.querySelector('.animate-pulse');

  it('passes the turn state to a custom agent_chat_spec component', () => {
    components.set(
      'agent_chat_spec',
      ({ parts, active }: { parts: unknown[]; active: boolean }) => (
        <div data-spec-active={String(active)} data-parts={parts.length} />
      ),
    );
    render(turnWith(true));
    expect(container.querySelector('[data-spec-active="true"]')).not.toBeNull();
    expect(container.querySelector('[data-parts="2"]')).not.toBeNull();

    render(turnWith(false));
    expect(
      container.querySelector('[data-spec-active="false"]'),
    ).not.toBeNull();
  });

  it('default StreamingSpec: an empty Card shimmers while the turn streams and settles when it ends', () => {
    components.set('agent_chat_spec', StreamingSpec);
    render(turnWith(true));
    expect(container.textContent).toContain('Orders');
    expect(shimmer()).not.toBeNull();

    render(turnWith(false));
    // Positive control: the card is still rendered; only the pulse is gone.
    expect(container.textContent).toContain('Orders');
    expect(shimmer()).toBeNull();
  });

  it('default StreamingSpec: a settled turn never shimmers', () => {
    components.set('agent_chat_spec', StreamingSpec);
    render(turnWith(false));
    expect(container.textContent).toContain('Orders');
    expect(shimmer()).toBeNull();
  });
});
