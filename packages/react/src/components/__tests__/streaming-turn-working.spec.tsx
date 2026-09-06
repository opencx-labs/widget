import type { StreamingTurnState } from '@opencx/widget-react-headless';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@opencx/widget-react-headless', () => ({
  useWidget: () => ({
    componentStore: {
      getComponent: () => () => <div data-steps />,
    },
  }),
}));
vi.mock('../AgentMessageGroup', () => ({ AgentMessageGroup: () => null }));

import { StreamingTurn } from '../StreamingTurn';

/**
 * A turn that has shown something and is still streaming keeps a "still
 * working" spinner at its tail, except while a running steps group (which
 * has its own loader) is the last item.
 */
describe('StreamingTurn working indicator', () => {
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
  });

  const working = () =>
    container.querySelector('[data-component="chat/streaming_turn/working"]');
  const render = (turn: StreamingTurnState) =>
    act(() => root.render(<StreamingTurn turn={turn} agent={undefined} />));

  it('shows while the turn is active after its first text', () => {
    render({ active: true, items: [{ kind: 'text', text: 'Looking…' }] });
    expect(working()).not.toBeNull();
  });

  it('stays quiet while a running steps group is the last item', () => {
    render({
      active: true,
      items: [
        { kind: 'text', text: 'Looking…' },
        {
          kind: 'steps',
          steps: [{ kind: 'tool', label: 'lookup', done: false }],
        },
      ],
    });
    expect(working()).toBeNull();
  });

  it('returns once the steps settle but the turn is still streaming', () => {
    render({
      active: true,
      items: [
        {
          kind: 'steps',
          steps: [{ kind: 'tool', label: 'lookup', done: true }],
        },
      ],
    });
    expect(working()).not.toBeNull();
  });

  it('is gone once the turn ends', () => {
    render({ active: false, items: [{ kind: 'text', text: 'Done.' }] });
    expect(working()).toBeNull();
  });
});
