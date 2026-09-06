import type { StreamingStep } from '@opencx/widget-react-headless';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * `showStepToolIO` opens each tool step onto the call's arguments and result.
 * Default OFF: a customer sees what the agent did, never the JSON it did it
 * with — so the flag being off has to leave the row exactly as it was.
 */

let showStepToolIO: boolean | undefined;

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({ showStepToolIO }),
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { StepsGroup } from '../StepsGroup';

const toolStep: StreamingStep = {
  kind: 'tool',
  label: 'search_knowledge_base',
  done: true,
  input: { query: 'refund policy' },
  output: { hits: 3 },
};

describe('StepsGroup tool IO', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    showStepToolIO = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(steps: StreamingStep[]) {
    // A settled turn mounts collapsed; open it so the rows are in the DOM.
    act(() => {
      root.render(<StepsGroup steps={steps} active={false} />);
    });
    act(() => {
      container.querySelector('button')?.click();
    });
  }

  const rowChevron = () => container.querySelectorAll('svg').length;

  it('expands a tool step onto its arguments and result', () => {
    render([toolStep]);
    expect(container.textContent).toContain('Search knowledge base');
    expect(container.textContent).not.toContain('refund policy');

    act(() => {
      container.querySelectorAll<HTMLElement>('.cursor-pointer')[0]?.click();
    });

    expect(container.textContent).toContain('step_arguments');
    expect(container.textContent).toContain('refund policy');
    expect(container.textContent).toContain('step_result');
    expect(container.textContent).toContain('"hits": 3');
  });

  it('leaves the row alone when the option is off', () => {
    showStepToolIO = undefined;
    render([toolStep]);

    expect(container.textContent).toContain('Search knowledge base');
    expect(container.querySelector('.cursor-pointer')).toBeNull();
    const chevrons = rowChevron();

    act(() => {
      container.querySelectorAll<HTMLElement>('div')[0]?.click();
    });
    expect(container.textContent).not.toContain('refund policy');
    expect(rowChevron()).toBe(chevrons);
  });

  it('shows only what the step carries — a running call has no result yet', () => {
    render([{ kind: 'tool', label: 'lookup', done: false, input: { id: 7 } }]);
    act(() => {
      container.querySelectorAll<HTMLElement>('.cursor-pointer')[0]?.click();
    });

    expect(container.textContent).toContain('step_arguments');
    expect(container.textContent).toContain('"id": 7');
    expect(container.textContent).not.toContain('step_result');
  });

  it('never opens a tool step that carried nothing', () => {
    render([{ kind: 'tool', label: 'noop', done: true }]);
    expect(container.querySelector('.cursor-pointer')).toBeNull();
  });
});
