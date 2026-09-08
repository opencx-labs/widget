import type { WidgetMessageU } from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let messages: WidgetMessageU[] = [];
let awaitingReply = true;
const writeText = vi.fn(async () => {});
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  'clipboard',
);
vi.mock('@opencx/widget-react-headless', () => ({
  useMessages: () => ({ messagesState: { messages } }),
  useIsAwaitingBotReply: () => ({ isAwaitingBotReply: awaitingReply }),
  useBot: () => undefined,
  useConfig: () => ({}),
  useDisplayMode: () => 'companion',
  useWidget: () => ({
    componentStore: { getComponent: () => () => <span>Still working</span> },
  }),
}));
vi.mock('../../../components/AgentMessage', () => ({
  AgentMessage: (message: WidgetMessageU) => (
    <p data-message-id={message.id}>
      {message.type === 'AI' ? message.data.message : null}
    </p>
  ),
}));
vi.mock('../../../components/UserMessageGroup', () => ({
  UserMessageGroup: ({ messages }: { messages: WidgetMessageU[] }) => (
    <div>
      {messages.map((message) => (
        <p key={message.id} data-message-id={message.id}>
          {message.type === 'USER' ? message.content : null}
        </p>
      ))}
    </div>
  ),
}));
vi.mock('../../../components/AgentAvatar', () => ({ AgentAvatar: () => null }));
vi.mock('../../../components/lib/tooltip', () => ({
  Tooltippy: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, dir: 'ltr' }),
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
  vi.useFakeTimers();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
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
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard);
  } else {
    Reflect.deleteProperty(navigator, 'clipboard');
  }
  writeText.mockClear();
  vi.useRealTimers();
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
  expect(container.textContent).not.toContain('Still working');
  act(() => vi.advanceTimersByTime(600));
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

it('pauses for each new update without restarting the pause for repeated polls', () => {
  act(() => root.render(<ChatMain />));
  for (const id of ['balance-progress', 'revenue-progress']) {
    messages = [
      ...messages,
      {
        id,
        type: 'AI',
        component: 'bot_message',
        data: { message: `Checking ${id}.` },
        timestamp: null,
      },
    ];
    act(() => root.render(<ChatMain />));
    expect(container.textContent).toContain(`Checking ${id}.`);
    expect(container.textContent).not.toContain('Still working');
    act(() => vi.advanceTimersByTime(300));
    messages = [...messages];
    act(() => root.render(<ChatMain />));
    expect(container.textContent).not.toContain('Still working');
    act(() => vi.advanceTimersByTime(300));
    expect(container.textContent).toContain('Still working');
  }
});

it('does not resume typing when the reply finishes during the pause', () => {
  act(() => root.render(<ChatMain />));
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
  expect(container.textContent).not.toContain('Still working');
  awaitingReply = false;
  act(() => root.render(<ChatMain />));
  act(() => vi.advanceTimersByTime(1_000));
  expect(container.textContent).toContain('Your balance is 468 dollars.');
  expect(container.textContent).not.toContain('Still working');
});

it('keeps typing visible when mounting with an existing progress message', () => {
  messages = [
    ...messages,
    {
      id: 'existing-progress',
      type: 'AI',
      component: 'bot_message',
      data: { message: 'I am checking your balance.' },
      timestamp: null,
    },
  ];
  act(() => root.render(<ChatMain />));
  expect(container.textContent).toContain('I am checking your balance.');
  expect(container.textContent).toContain('Still working');
});

it('omits the pending reply action row until completion, including during the typing pause', async () => {
  messages = [
    {
      id: 'earlier-reply',
      type: 'AI',
      component: 'bot_message',
      data: { message: 'An earlier completed reply.' },
      timestamp: null,
    },
    ...messages,
  ];
  const actionRows = () =>
    container.querySelectorAll(
      '[data-component="chat/agent_msg_group/actions"]',
    );
  act(() => root.render(<ChatMain />));
  expect(actionRows()).toHaveLength(1);

  messages = [
    ...messages,
    {
      id: 'progress',
      type: 'AI',
      component: 'bot_message',
      data: { message: 'Checking your balance.' },
      timestamp: null,
    },
  ];
  act(() => root.render(<ChatMain />));
  expect(container.textContent).toContain('Checking your balance.');
  expect(container.textContent).not.toContain('Still working');
  expect(actionRows()).toHaveLength(1);
  act(() => vi.advanceTimersByTime(600));
  expect(container.textContent).toContain('Still working');
  expect(actionRows()).toHaveLength(1);

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
  expect(actionRows()).toHaveLength(1);

  awaitingReply = false;
  act(() => root.render(<ChatMain />));
  expect(container.textContent).not.toContain('Still working');
  expect(actionRows()).toHaveLength(2);
  const copyButtons = container.querySelectorAll<HTMLButtonElement>(
    '[data-component="chat/agent_msg_group/actions/copy"]',
  );
  await act(async () => copyButtons.item(1).click());
  expect(writeText).toHaveBeenCalledWith(
    'Checking your balance.\n\nYour balance is 468 dollars.',
  );
});
