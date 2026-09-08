import type { WidgetMessageU } from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let messages: WidgetMessageU[] = [];
let awaitingReply = true;
vi.mock('@opencx/widget-react-headless', () => ({
  useMessages: () => ({ messagesState: { messages } }),
  useIsAwaitingBotReply: () => ({ isAwaitingBotReply: awaitingReply }),
  useBot: () => undefined,
  useWidget: () => ({
    componentStore: { getComponent: () => () => <span>Still working</span> },
  }),
}));
vi.mock('../MessageGroups', () => ({
  MessageGroups: ({ groups }: { groups: WidgetMessageU[][] }) => (
    <div>
      {groups.flat().map((message) => (
        <p key={message.id} data-message-id={message.id}>
          {message.type === 'USER'
            ? message.content
            : message.type === 'AI'
              ? message.data.message
              : null}
        </p>
      ))}
    </div>
  ),
}));
vi.mock('../ChatCustomStatus', () => ({ ChatCustomStatus: () => null }));
vi.mock('../ChatBannerItems', () => ({ ChatBannerItems: () => null }));
vi.mock('../InitialMessages', () => ({ InitialMessages: () => null }));
vi.mock('../../../components/custom-components/ChatBottomComponents', () => ({
  ChatBottomComponents: () => null,
}));
vi.mock(
  '../../../components/custom-components/SessionResolvedComponent',
  () => ({ SessionResolvedComponent: () => null }),
);

import { ChatMain } from '../ChatMain';

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  awaitingReply = true;
  messages = [
    { id: 'user', type: 'USER', content: 'Check my balance.', timestamp: null },
  ];
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('shows polled progress while the blocking send is pending and keeps it after completion', () => {
  act(() => root.render(<ChatMain />));
  expect(container.textContent).toContain('Check my balance.');
  expect(container.textContent).toContain('Still working');
  messages = [
    ...messages,
    {
      id: 'progress',
      type: 'AI',
      component: 'bot_message',
      data: { message: 'I am checking your balance.' },
      timestamp: null,
    },
  ];
  act(() => root.render(<ChatMain />));
  expect(container.textContent).toContain('I am checking your balance.');
  expect(container.textContent).toContain('Still working');
  messages = [
    ...messages,
    {
      id: 'final',
      type: 'AI',
      component: 'bot_message',
      data: { message: 'Your balance is 468 dollars.' },
      timestamp: null,
    },
  ];
  act(() => root.render(<ChatMain />));
  expect(container.textContent).toContain('Your balance is 468 dollars.');
  awaitingReply = false;
  act(() => root.render(<ChatMain />));
  expect(
    container.querySelectorAll('[data-message-id="progress"]'),
  ).toHaveLength(1);
  expect(container.querySelectorAll('[data-message-id="final"]')).toHaveLength(
    1,
  );
  expect(container.textContent).not.toContain('Still working');
});
