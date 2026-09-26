import type { WidgetConfig, WidgetMessageU } from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let config: WidgetConfig;
let messages: WidgetMessageU[];
const sendMessage = vi.fn(async ({ content }: { content: string }) => {
  messages = [
    {
      id: 'question',
      type: 'USER',
      content,
      deliveredAt: null,
      timestamp: null,
    },
  ];
});

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => config,
  useMessages: () => ({
    messagesState: { messages },
    sendMessage,
  }),
  useSessions: () => ({ sessionState: { session: null } }),
  useBot: () => undefined,
  useDisplayMode: () => config.displayMode ?? 'popover',

  useIsAwaitingBotReply: () => ({ isAwaitingBotReply: false }),
  useUploadFiles: () => ({ allFiles: [], successFiles: [] }),
  useWidget: () => ({
    widgetCtx: {
      features: { attachments: true, pageContext: false },
    },
    componentStore: { getComponent: () => undefined },
  }),
}));

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, dir: 'ltr' }),
}));
vi.mock('../../../hooks/useIsSmallScreen', () => ({
  useIsSmallScreen: () => ({ isSmallScreen: false }),
}));

vi.mock('../../../components/AgentAvatar', () => ({ AgentAvatar: () => null }));
vi.mock('../../../components/AgentMessage', () => ({
  AgentMessage: ({ data }: { data: { message: string } }) => (
    <p>{data.message}</p>
  ),
}));
vi.mock('../../../components/lib/tooltip', () => ({
  Tooltippy: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../../components/lib/MotionDiv__VerticalReveal', () => ({
  MotionDiv__VerticalReveal: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock('../ChatInput', () => ({ ChatInput: () => <textarea /> }));

import { ChatFooter } from '../ChatFooter';
import { InitialMessages } from '../InitialMessages';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  config = {
    token: 'test',
    initialMessages: ['How can we help?'],
    initialQuestions: ['Track my order', 'Help with a return'],
    requireInitialQuestion: true,
  };
  messages = [];

  sendMessage.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render() {
  act(() =>
    root.render(
      <>
        <InitialMessages />
        <ChatFooter />
      </>,
    ),
  );
}

const composer = () => container.querySelector('textarea');
const questions = () =>
  container.querySelectorAll<HTMLButtonElement>(
    '[data-component="chat/suggested_reply_btn"]',
  );

describe('required initial questions', () => {
  it.each(['above-chat-input', 'below-initial-messages'] as const)(
    'sends the selected question and reveals the composer at %s',
    async (position) => {
      config.initialQuestionsPosition = position;
      render();
      expect(composer()).toBeNull();
      expect(container.querySelector('input[type="file"]')).toBeNull();
      expect(container.textContent).toContain('How can we help?');
      expect(questions()).toHaveLength(2);
      expect(Boolean(questions()[0]!.closest('footer'))).toBe(
        position === 'above-chat-input',
      );

      if (position === 'above-chat-input')
        expect(questions()[0]!.parentElement?.classList.contains('pb-4')).toBe(
          true,
        );
      await act(async () => questions()[0]!.click());
      render();
      expect(sendMessage).toHaveBeenCalledExactlyOnceWith({
        content: 'Track my order',
      });
      expect(composer()).not.toBeNull();
      expect(questions()).toHaveLength(0);

      // Closing/reopening the UI must preserve the conversation's unlock.
      act(() => root.render(null));
      render();
      expect(composer()).not.toBeNull();

      // A reset (or switching to a fresh conversation) requires a new choice.
      messages = [];
      render();
      expect(composer()).toBeNull();
      expect(questions()).toHaveLength(2);
    },
  );

  it.each([undefined, false])(
    'keeps the composer when the option is %s',
    (enabled) => {
      config.requireInitialQuestion = enabled;
      render();
      expect(composer()).not.toBeNull();
      expect(questions()).toHaveLength(2);
    },
  );

  it.each([undefined, [], ['', '   ', '\n']])(
    'keeps the composer when there are no usable questions: %j',
    (initialQuestions) => {
      config.initialQuestions = initialQuestions;
      render();
      expect(composer()).not.toBeNull();
    },
  );

  it('allows follow-ups when reopening a conversation with messages', () => {
    messages = [
      {
        id: 'existing',
        type: 'USER',
        deliveredAt: null,
        content: 'Earlier question',
        timestamp: null,
      },
    ];
    render();
    expect(composer()).not.toBeNull();
    expect(questions()).toHaveLength(0);
  });

  it('offers the choices again if a failed first send rolls back its messages', async () => {
    render();
    await act(async () => questions()[1]!.click());
    render();
    expect(composer()).not.toBeNull();

    messages = [];
    render();
    expect(composer()).toBeNull();
    expect(questions()).toHaveLength(2);
    await act(async () => questions()[1]!.click());
    render();
    expect(composer()).not.toBeNull();
    expect(sendMessage).toHaveBeenLastCalledWith({
      content: 'Help with a return',
    });
  });

  it('reacts to configuration changes', () => {
    config.requireInitialQuestion = false;
    render();
    expect(composer()).not.toBeNull();
    config.requireInitialQuestion = true;
    render();
    expect(composer()).toBeNull();
    config.initialQuestions = [];
    render();
    expect(composer()).not.toBeNull();
  });
});
