import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PageActionCard } from '../PageActionCard';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const resolve = vi.hoisted(() => vi.fn());
vi.mock('@opencx/widget-react-headless', () => ({
  useAgentChatUi: () => ({ resolvePageAction: resolve }),
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  resolve.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it.each(['fill', 'select'])(
  'shows the proposed %s value as text before permission',
  (action) => {
    const value = '<img src=x onerror=alert(1)>';
    act(() =>
      root.render(
        <PageActionCard
          request={{
            callId: 'call',
            action,
            controlName: 'Account label',
            value,
          }}
        />,
      ),
    );
    expect(container.textContent).toContain(`New value: ${value}`);
    expect(container.querySelector('img')).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
    const allow = container.querySelector('button');
    if (!allow) throw new Error('missing Allow button');
    act(() => allow.click());
    expect(resolve).toHaveBeenCalledWith('call', true);
  },
);

it('shows clearing a field explicitly and No declines the matching call', () => {
  act(() =>
    root.render(
      <PageActionCard
        request={{
          callId: 'clear',
          action: 'fill',
          controlName: 'Nickname',
          value: '',
        }}
      />,
    ),
  );
  expect(container.textContent).toContain('New value: (empty)');
  const no = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'No',
  );
  if (!no) throw new Error('missing No button');
  act(() => no.click());
  expect(resolve).toHaveBeenCalledWith('clear', false);
});
