import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const reducedMotion = vi.hoisted(() => ({ enabled: false }));
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => reducedMotion.enabled,
}));

import { TaskPlan } from '../TaskPlan';

type Plan = React.ComponentProps<typeof TaskPlan>['plan'];

const pendingPlan: Plan = [
  { step: 'Review account requirements', status: 'pending' },
  { step: 'Check the dashboard', status: 'pending' },
  { step: 'Summarize the findings', status: 'pending' },
];

describe('TaskPlan disclosure and progress', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    reducedMotion.enabled = false;
    // Framer restores the scroll position after measuring height: auto.
    // jsdom has no scrolling implementation.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const render = (plan: Plan = pendingPlan, active = false) =>
    act(() => root.render(<TaskPlan plan={plan} active={active} />));

  const toggle = () => {
    const button = container.querySelector('button');
    if (!button) throw new Error('Missing plan disclosure button');
    return button;
  };

  const panel = () => {
    const id = toggle().getAttribute('aria-controls');
    if (!id) throw new Error('Missing plan panel relationship');
    const element = document.getElementById(id);
    if (!element) throw new Error('Missing controlled plan panel');
    return element;
  };

  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

  it('starts as a compact native button and keeps keyboard focus when toggled', async () => {
    render();
    expect(toggle().type).toBe('button');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().textContent).toBe('Review account requirements0/3');
    expect(toggle().querySelector('.truncate')).not.toBeNull();
    expect(panel().getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('ol')).toBeNull();

    toggle().focus();
    act(() => toggle().click());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(panel().getAttribute('aria-hidden')).toBe('false');
    expect(document.activeElement).toBe(toggle());
    expect(container.querySelectorAll('li')).toHaveLength(3);

    act(() => toggle().click());
    expect(panel().getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(toggle());
    await settle();
    expect(container.querySelector('ol')).toBeNull();
  });

  it('updates the same open plan and progress ring without remounting its rows', async () => {
    render();
    act(() => toggle().click());
    await settle();
    const card = container.querySelector('[data-task-plan]');
    const list = container.querySelector('ol');
    const firstRow = container.querySelector('li');
    const initialRing = toggle().querySelectorAll('circle')[1];
    const initialOffset = Number(
      initialRing?.getAttribute('stroke-dashoffset'),
    );

    render(
      [
        { step: 'Reviewed account requirements', status: 'completed' },
        { step: 'Check the dashboard', status: 'in_progress' },
        { step: 'Summarize the findings', status: 'pending' },
      ],
      true,
    );

    expect(container.querySelector('[data-task-plan]')).toBe(card);
    expect(container.querySelector('ol')).toBe(list);
    expect(container.querySelector('li')).toBe(firstRow);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().textContent).toBe('Check the dashboard1/3');
    expect(firstRow?.getAttribute('data-plan-status')).toBe('completed');
    await settle();
    const updatedOffset = Number(
      initialRing?.getAttribute('stroke-dashoffset'),
    );
    expect(updatedOffset).toBeLessThan(initialOffset);
    expect(updatedOffset).toBeCloseTo(2 * Math.PI * 8 * (2 / 3));
  });

  it('can reverse a disclosure before its exit finishes without duplicating the list', async () => {
    render();
    act(() => toggle().click());
    await settle();
    const list = container.querySelector('ol');
    act(() => toggle().click());
    act(() => toggle().click());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    await settle();
    expect(container.querySelectorAll('ol')).toHaveLength(1);
    expect(container.querySelector('ol')).toBe(list);
    expect(panel().getAttribute('aria-hidden')).toBe('false');
  });

  it('shows a paused marker instead of a spinner when work stops', () => {
    const plan: Plan = [{ step: 'Check the dashboard', status: 'in_progress' }];
    render(plan, true);
    act(() => toggle().click());
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    render(plan, false);
    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(container.querySelector('.lucide-circle-dashed')).not.toBeNull();
  });

  it('leaves a completed plan available to inspect', async () => {
    render(pendingPlan.map((step) => ({ ...step, status: 'completed' })));
    expect(container.querySelector('[data-task-plan]')).not.toBeNull();
    expect(toggle().textContent).toContain('3/3');
    act(() => toggle().click());
    await settle();
    expect(
      container.querySelectorAll('[data-plan-status="completed"]'),
    ).toHaveLength(3);
    expect(container.querySelectorAll('.line-through')).toHaveLength(3);
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('uses no height travel or animated progress in reduced motion', async () => {
    reducedMotion.enabled = true;
    render([{ step: 'Check the dashboard', status: 'in_progress' }], true);
    act(() => toggle().click());
    const disclosure = panel().firstElementChild;
    if (!(disclosure instanceof HTMLElement))
      throw new Error('Missing disclosure');
    expect(disclosure.style.height).toBe('auto');
    expect(
      container
        .querySelector('.animate-spin')
        ?.classList.contains('motion-reduce:animate-none'),
    ).toBe(true);
    render([{ step: 'Checked the dashboard', status: 'completed' }]);
    await settle();
    expect(
      toggle().querySelectorAll('circle')[1]?.getAttribute('stroke-dashoffset'),
    ).toBe('0');
    expect(disclosure.style.height).toBe('auto');
  });
});
