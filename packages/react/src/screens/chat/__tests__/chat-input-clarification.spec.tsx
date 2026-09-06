import type { AskQuestionsRequest } from '@opencx/widget-react-headless';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * The composer is where the customer says things, so a pending clarification
 * REPLACES it rather than stacking a card above it. `ChatInput` owns that
 * swap because the companion shell renders `ChatInput` directly and never
 * mounts `ChatFooter` — a rule living in the footer silently did nothing in
 * companion mode, which is the whole dashboard. WHICH clarification is
 * pending is the engine's call (`pendingClarification` on the context).
 */

const agentChatUi = {
  isStreaming: false,
  stop: vi.fn(),
  queuedUserMessages: [] as Array<{ id: string }>,
  liveItems: [],
  turnSources: [],
  pendingClarification: null as AskQuestionsRequest | null,
};
const messages: Array<{ type: string }> = [];

vi.mock('@opencx/widget-react-headless', async () => {
  const actual = await vi.importActual<
    typeof import('@opencx/widget-react-headless')
  >('@opencx/widget-react-headless');
  return {
    // Real module, with only the context hooks this component reads swapped
    // for stubs — so a new hook in ChatInput cannot silently fail the suite.
    ...actual,
    useAgentChatUi: () => agentChatUi,
    useConfig: () => ({}),
    useDictation: () => ({ isAvailable: false, isDictating: false }),
    useIsAwaitingBotReply: () => false,
    useMessages: () => ({
      sendMessage: vi.fn(),
      rememberSentText: vi.fn(),
      getSentTextHistory: () => [],
      messagesState: { messages },
    }),
    useSessions: () => ({ sessionState: { session: null } }),
    useUploadFiles: () => ({
      allFiles: [],
      successFiles: [],
      handleCancelUpload: vi.fn(),
      appendFiles: vi.fn(),
      isUploading: false,
    }),
    useWidget: () => ({
      widgetCtx: {
        features: {
          dictation: false,
          attachments: true,
          pageContext: false,
          clientTools: false,
        },
        messageCtx: { blocksSendWhileAwaitingReply: false },
      },
      componentStore: {
        getComponent: (key: string) =>
          key === 'agent_chat_questions' ? ClarificationQuestions : undefined,
      },
    }),
  };
});

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, dir: 'ltr' }),
}));

// Page marking is host-page machinery with its own provider; irrelevant to
// which control occupies the composer slot.
vi.mock('../../../page-marks/PageMarksProvider', () => ({
  usePageMarks: () => ({ marks: [], detach: vi.fn() }),
}));
vi.mock('../../../page-marks/usePageMarking', () => ({
  usePageMarking: () => ({ isMarking: false, start: vi.fn(), stop: vi.fn() }),
}));

import { ClarificationQuestions } from '../../../components/ClarificationQuestions';
import { TooltipProvider } from '../../../components/lib/tooltip';
import { ChatInput } from '../ChatInput';

function request(prompt: string): AskQuestionsRequest {
  return {
    request_id: 'r1',
    questions: [
      {
        id: 'q0',
        prompt,
        selection: 'single',
        options: [{ id: 'a', label: 'A' }],
      },
    ],
  };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  agentChatUi.isStreaming = false;
  agentChatUi.pendingClarification = null;
  messages.length = 0;
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
      <TooltipProvider>
        <ChatInput />
      </TooltipProvider>,
    ),
  );
}

const composer = () =>
  container.querySelector('[data-component="chat/input_box/textarea"]');
const card = () =>
  container.querySelector(
    '[data-component="chat/clarification_questions/root"]',
  );

describe('ChatInput with a pending clarification', () => {
  it('renders the composer when nothing was asked', () => {
    render();
    expect(composer()).not.toBeNull();
    expect(card()).toBeNull();
  });

  it('replaces the composer with the questionnaire', () => {
    agentChatUi.pendingClarification = request('Which session?');
    render();
    expect(card()).not.toBeNull();
    expect(composer()).toBeNull();
    expect(container.textContent).toContain('Which session?');
  });
});
