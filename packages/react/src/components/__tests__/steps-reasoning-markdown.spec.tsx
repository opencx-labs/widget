import type { StreamingStep } from '@opencx/widget-react-headless';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * Reasoning is markdown. The collapsed labels are plain text nodes, so they
 * get the syntax FLATTENED; the expanded body goes through RichText, so it
 * gets the syntax RENDERED. Getting either backwards is what put literal
 * `**asterisks**` in the companion's trace.
 */

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({ showStepToolIO: false }),
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { StepsGroup } from '../StepsGroup';

const REASONING = [
  '**Clarifying profile check**',
  '',
  'I need to call `get_ai_profile` and read the *identity* block.',
].join('\n');

describe('StepsGroup reasoning markdown', () => {
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

  function render(steps: StreamingStep[]) {
    // A settled turn mounts collapsed; open it so the rows are in the DOM.
    act(() => root.render(<StepsGroup steps={steps} active={false} />));
    act(() => container.querySelector('button')?.click());
  }

  const thought: StreamingStep = {
    kind: 'reasoning',
    label: REASONING,
    done: true,
  };

  it('flattens markdown in the row label', () => {
    render([thought]);
    expect(container.textContent).toContain('Clarifying profile check');
    expect(container.textContent).not.toContain('**');
  });

  it('flattens markdown in the collapsed breadcrumb', () => {
    act(() => root.render(<StepsGroup steps={[thought]} active={false} />));
    const breadcrumb = container.querySelector('button')?.textContent ?? '';
    expect(breadcrumb).toContain('Clarifying profile check');
    expect(breadcrumb).not.toContain('*');
  });

  it('renders the expanded body as markdown, not as text', () => {
    render([thought]);
    // The row is a disclosure because the label is only its first line.
    const row = Array.from(container.querySelectorAll<HTMLElement>('div')).find(
      (el) => el.className.includes('cursor-pointer'),
    );
    expect(row).toBeTruthy();
    act(() => row!.click());

    expect(container.querySelector('strong')?.textContent).toBe(
      'Clarifying profile check',
    );
    expect(container.querySelector('code')?.textContent).toBe('get_ai_profile');
    expect(container.querySelector('em')?.textContent).toBe('identity');
    expect(container.textContent).not.toContain('**');
  });

  it('offers no disclosure when flattening is the only difference', () => {
    render([{ kind: 'reasoning', label: '**Thinking it over**', done: true }]);
    expect(container.textContent).toContain('Thinking it over');
    expect(
      Array.from(container.querySelectorAll<HTMLElement>('div')).some((el) =>
        el.className.includes('cursor-pointer'),
      ),
    ).toBe(false);
  });
});
