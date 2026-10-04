import type { WidgetAgentMessage, WidgetMessageU } from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageOptions } from '../MessageOptions';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let messages: WidgetMessageU[];
let isOpened: boolean;
const sendMessage = vi.fn(async () => {});

vi.mock('@opencx/widget-react-headless', () => ({
  useMessages: () => ({ messagesState: { messages }, sendMessage }),
  useSessions: () => ({ sessionState: { session: { isOpened } } }),
}));

const options = {
  options: [
    { id: 'opt-yes', label: 'Yes' },
    { id: 'opt-no', label: 'No' },
  ],
  pickedOptionId: null,
};

function agentMessage(
  id: string,
  messageOptions: WidgetAgentMessage['messageOptions'] = options,
): WidgetAgentMessage {
  return {
    id,
    type: 'AGENT',
    component: 'agent_message',
    data: { message: 'Can we access your account?' },
    timestamp: null,
    messageOptions,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  isOpened = true;
  sendMessage.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(message: WidgetAgentMessage) {
  const messageOptions = message.messageOptions;
  if (!messageOptions) throw new Error('message has no options');
  act(() =>
    root.render(
      <MessageOptions messageId={message.id} messageOptions={messageOptions} />,
    ),
  );
  return Array.from(container.querySelectorAll('button'));
}

describe('MessageOptions', () => {
  it('the newest unpicked options message of an open session is tappable and sends the tap', () => {
    const newest = agentMessage('newest');
    messages = [newest];

    const buttons = render(newest);
    act(() => buttons[0]?.click());

    expect(buttons.map((b) => [b.textContent, b.disabled])).toEqual([
      ['Yes', false],
      ['No', false],
    ]);
    expect(sendMessage).toHaveBeenCalledWith({
      content: 'Yes',
      optionReply: { messageId: 'newest', optionId: 'opt-yes' },
    });
  });

  it('an older unpicked options message shows nothing while the newest stays tappable', () => {
    const older = agentMessage('older');
    const newest = agentMessage('newest');
    messages = [older, newest];

    expect(render(older)).toEqual([]);
    expect(container.textContent).toBe('');
    expect(render(newest).map((b) => [b.textContent, b.disabled])).toEqual([
      ['Yes', false],
      ['No', false],
    ]);
  });

  it('a picked message keeps only the picked option, pressed and not tappable', () => {
    const picked = agentMessage('picked', {
      ...options,
      pickedOptionId: 'opt-no',
    });
    messages = [picked];

    const buttons = render(picked);
    act(() => buttons[0]?.click());

    expect(
      buttons.map((b) => [
        b.textContent,
        b.disabled,
        b.dataset.picked,
        b.getAttribute('aria-pressed'),
      ]),
    ).toEqual([['No', true, 'true', 'true']]);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('a picked message keeps its receipt after a newer options message arrives and after the session closes', () => {
    const picked = agentMessage('picked', {
      ...options,
      pickedOptionId: 'opt-yes',
    });
    const newest = agentMessage('newest');
    messages = [picked, newest];

    expect(render(picked).map((b) => b.textContent)).toEqual(['Yes']);
    isOpened = false;
    expect(render(picked).map((b) => b.textContent)).toEqual(['Yes']);
  });

  it('a closed session shows nothing for an unpicked message; the same message is tappable while open', () => {
    const newest = agentMessage('newest');
    messages = [newest];

    expect(render(newest).map((b) => b.disabled)).toEqual([false, false]);
    isOpened = false;
    expect(render(newest)).toEqual([]);
    expect(container.textContent).toBe('');
  });
});
