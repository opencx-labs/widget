import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RequestForm } from '../ElicitationForm';
import type { ElicitationRequest } from '@opencx/widget-core';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const request: ElicitationRequest = {
  id: 'form',
  serverId: 'server',
  serverName: 'Payla',
  expiresAt: Date.now() + 50000,
  form: {
    message: 'Confirm a fictional refund',
    requestedSchema: {
      properties: { approve: { type: 'boolean', title: 'Approve refund' } },
      required: ['approve'],
    },
  },
};
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
it('approves only after an explicit action without a redundant checkbox', async () => {
  const answer = vi.fn().mockResolvedValue(undefined);
  act(() => root.render(<RequestForm request={request} onAnswer={answer} />));
  expect(answer).not.toHaveBeenCalled();
  expect(container.querySelector('input[type=checkbox]')).toBeNull();
  expect(container.textContent).toContain('Approve');
  await act(async () => {
    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(answer).toHaveBeenCalledWith({
    action: 'accept',
    content: { approve: true },
  });
});
it('declines without approval', async () => {
  const answer = vi.fn().mockResolvedValue(undefined);
  act(() => root.render(<RequestForm request={request} onAnswer={answer} />));
  await act(async () => {
    Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Decline')
      ?.click();
  });
  expect(answer).toHaveBeenCalledWith({ action: 'decline' });
});
it('retains failed submissions for retry', async () => {
  act(() =>
    root.render(
      <RequestForm
        request={request}
        onAnswer={async () => {
          throw Error('Expired');
        }}
      />,
    ),
  );
  await act(async () => {
    Array.from(container.querySelectorAll('button'))
      .find((b) => b.getAttribute('aria-label') === 'Cancel request')
      ?.click();
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'Expired',
  );
});

it('returns numeric and multi-select values with their schema types', async () => {
  const answer = vi.fn().mockResolvedValue(undefined);
  const typed: ElicitationRequest = {
    ...request,
    form: {
      message: 'Report settings',
      requestedSchema: {
        properties: {
          count: { type: 'integer', default: 2 },
          colors: {
            type: 'array',
            items: { enum: ['red', 'blue'] },
            default: ['blue'],
          },
        },
      },
    },
  };
  act(() => root.render(<RequestForm request={typed} onAnswer={answer} />));
  await act(async () => {
    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(answer).toHaveBeenCalledWith({
    action: 'accept',
    content: { count: 2, colors: ['blue'] },
  });
});

it('remembers approval only after explicitly selecting Always allow', async () => {
  const answer = vi.fn().mockResolvedValue(undefined);
  act(() =>
    root.render(
      <RequestForm
        request={{ ...request, approvalKey: 'exact-request' }}
        onAnswer={answer}
      />,
    ),
  );
  expect(answer).not.toHaveBeenCalled();
  const option = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent?.includes('Always allow'),
  );
  expect(option).toBeDefined();
  await act(async () => option?.click());
  expect(answer).toHaveBeenCalledWith({
    action: 'accept',
    content: { approve: true },
    remember: true,
  });
});
