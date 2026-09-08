import type { StreamingStep } from '@opencx/widget-react-headless';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({}),
  useWidget: () => ({ widgetCtx: { agent: {} } }),
}));
vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, dir: 'ltr' }),
}));
vi.mock('../RichText', () => ({ RichText: () => null }));

import { StepsGroup } from '../StepsGroup';

const tool = (label: string, done: boolean): StreamingStep => ({
  kind: 'tool',
  label,
  done,
});

/**
 * The trace stays open for the whole turn. Between two tool calls every step
 * is briefly done while the model decides the next one — that must not fold
 * the trace and unfold it a moment later.
 */
describe('StepsGroup open/collapsed', () => {
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

  const rows = () =>
    container.querySelectorAll(
      '[data-component="chat/streaming_turn/steps"] .opencx-fade-up',
    ).length;
  const render = (steps: StreamingStep[], active: boolean) =>
    act(() => root.render(<StepsGroup steps={steps} active={active} />));

  it('stays open between tool calls while the turn is live', () => {
    render([tool('lookup', false)], true);
    expect(rows()).toBe(1);
    // The call returned; nothing is running for a moment.
    render([tool('lookup', true)], true);
    expect(rows()).toBe(1);
    // The next call starts.
    render([tool('lookup', true), tool('report', false)], true);
    expect(rows()).toBe(2);
  });

  it('collapses once the turn ends, and a settled turn mounts collapsed', () => {
    render([tool('lookup', false)], true);
    render([tool('lookup', true)], false);
    expect(rows()).toBe(0);

    act(() => root.unmount());
    root = createRoot(container);
    render([tool('lookup', true)], false);
    expect(rows()).toBe(0);
  });
});
