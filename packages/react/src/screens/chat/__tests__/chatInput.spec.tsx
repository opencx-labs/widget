import type { SendMessageInput } from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const sendMessageSpy = vi.fn();
const rememberSentTextSpy = vi.fn();
const handleCancelUploadSpy = vi.fn();
const detachSpy = vi.fn();
const recallOnSentSpy = vi.fn();
const onStopSpy = vi.fn();
const dictationToggleSpy = vi.fn();
const dictationStopSpy = vi.fn();
let dictationEnabled = false;
let dictationError: 'microphone' | 'unavailable' | null = null;
let isStreaming = false;
let queuedUserMessages: Array<{ id: string; content: string }> = [];
/** `WidgetCtx.features`: the org's features narrowed by the embed. */
let canAttach = true;
let sendsPageContext = true;
let configContext: Record<string, unknown> | undefined;
const mentionSearch = vi.fn(async () => [
  {
    type: 'workflow',
    id: 'wf_1',
    title: 'PostgreSQL Backup',
    icon: 'https://cdn/wf.svg',
  },
]);
let capturedInput: SendMessageInput | null = null;
let marks: Array<{
  shape: string;
  note?: string;
  elements: Array<{ name: string }>;
  snapshotUrl?: string;
}> = [];
/** Marks whose snapshot upload is still in flight, resolved by the test. */
const pendingSnapshots = new Map<object, (url: string | null) => void>();
let allFiles: Array<{
  id: string;
  status: 'success';
  file: File;
  fileUrl: string;
  progress: number;
}> = [];

vi.mock('@opencx/widget-react-headless', () => ({
  useAgentChatUi: () => ({
    isStreaming,
    stop: onStopSpy,
    liveItems: [],
    turnSources: [],
    queuedUserMessages,
    removeQueued: vi.fn(),
    // The composer hands its slot to a pending clarification; these cases
    // have none, so the input renders as before.
    pendingClarification: null,
  }),
  useConfig: () => ({
    context: configContext,
    mentions: { search: mentionSearch },
  }),
  useDictation: () => ({
    enabled: dictationEnabled,
    status: 'idle',
    error: dictationError,
    isActive: false,
    levelRef: { current: 0 },
    start: vi.fn(),
    stop: dictationStopSpy,
    toggle: dictationToggleSpy,
    prewarm: vi.fn(),
  }),
  useIsAwaitingBotReply: () => ({ isAwaitingBotReply: false }),
  useMessages: () => ({
    sendMessage: sendMessageSpy,
    rememberSentText: rememberSentTextSpy,
    getSentTextHistory: () => [],
    messagesState: { messages: [] },
  }),
  useSessions: () => ({ sessionState: { session: null } }),
  useUploadFiles: () => ({
    allFiles,
    handleCancelUpload: handleCancelUploadSpy,
    appendFiles: vi.fn(),
    isUploading: false,
    successFiles: allFiles,
  }),
  useWidget: () => ({
    widgetCtx: {
      streaming: true,
      features: {
        dictation: dictationEnabled,
        attachments: canAttach,
        pageContext: sendsPageContext,
        clientTools: false,
      },
      messageCtx: { blocksSendWhileAwaitingReply: false },
    },
    componentStore: {
      getComponent: (key: string) =>
        key === 'agent_chat_questions' ? () => null : undefined,
    },
  }),
}));

vi.mock('../../../page-marks/mark-thumbnail', () => ({
  awaitSnapshotUrl: (mark: { snapshotUrl?: string }, maxWaitMs: number) => {
    if (mark.snapshotUrl) return Promise.resolve(mark.snapshotUrl);
    const pending = pendingSnapshots.get(mark);
    if (!pending) return Promise.resolve(null);
    return new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), maxWaitMs);
      pendingSnapshots.set(mark, (url) => {
        clearTimeout(timer);
        if (url) mark.snapshotUrl = url;
        resolve(url);
      });
    });
  },
}));

vi.mock('react-dropzone', () => ({
  useDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    open: vi.fn(),
  }),
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../../components/lib/MotionDiv', () => ({
  MotionDiv: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../../components/lib/tooltip', () => ({
  Tooltippy: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../../hooks/useIsSmallScreen', () => ({
  useIsSmallScreen: () => ({ isSmallScreen: false }),
}));

vi.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({
    cssVars: {},
    theme: {
      primaryColor: '#123456',
      widgetContentContainer: { zIndex: 10 },
    },
  }),
}));

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../page-marks/PageMarkOverlay', () => ({
  PageMarkOverlay: () => null,
}));

vi.mock('../../../page-marks/PageMarkPill', () => ({
  PageMarkPill: () => null,
}));

vi.mock('../../../page-marks/PageMarksProvider', () => ({
  usePageMarks: () => ({ marks, detach: detachSpy }),
}));

vi.mock('../../../page-marks/page-mark-theme', () => ({
  resolvePageMarkTheme: () => ({ accent: '#123456', inkZIndex: 11 }),
}));

vi.mock('../../../page-marks/usePageMarking', () => ({
  usePageMarking: () => ({
    isActive: false,
    draft: null,
    hover: null,
    setShape: vi.fn(),
    attach: vi.fn(),
    dropDraft: vi.fn(),
    toggle: vi.fn(),
    disarm: vi.fn(),
  }),
}));

vi.mock('../UploadPreview', () => ({
  AI_FILE_ACCEPT: {},
  HANDED_OFF_FILE_ACCEPT: {},
  MAX_FILE_BYTES: 25 * 1024 * 1024,
  UploadPreview: () => null,
}));

vi.mock('../agent/QueuedSendsPill', () => ({
  QueuedSendsPill: () => null,
}));

vi.mock('../useSentTextRecall', () => ({
  useSentTextRecall: () => ({
    onEdit: vi.fn(),
    onKeyDown: vi.fn(),
    onSent: recallOnSentSpy,
  }),
}));

import { ChatInput } from '../ChatInput';

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  if (!setter) throw new Error('textarea value setter is unavailable');
  setter.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ChatInput send acceptance', () => {
  let container: HTMLDivElement;
  let root: Root;
  let rootMounted: boolean;

  beforeEach(() => {
    vi.resetAllMocks();
    isStreaming = false;
    queuedUserMessages = [];
    canAttach = true;
    sendsPageContext = true;
    dictationEnabled = false;
    dictationError = null;
    capturedInput = null;
    configContext = undefined;
    marks = [{ shape: 'box', elements: [{ name: 'button "Save"' }] }];
    allFiles = [
      {
        id: 'file-1',
        status: 'success',
        file: new File(['proof'], 'proof.txt', { type: 'text/plain' }),
        fileUrl: 'https://files.test/proof.txt',
        progress: 100,
      },
    ];
    sendMessageSpy.mockImplementation((input: SendMessageInput) => {
      capturedInput = input;
      return Promise.resolve();
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    rootMounted = true;
  });

  afterEach(() => {
    if (rootMounted) act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function renderInput() {
    await act(async () => {
      root.render(<ChatInput />);
    });
    const textarea = container.querySelector('textarea');
    if (!textarea) throw new Error('textarea did not render');
    return { textarea };
  }

  async function submit(textarea: HTMLTextAreaElement, text = 'hello') {
    await act(async () => setTextareaValue(textarea, text));
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="send_message"]',
    );
    if (!button) throw new Error('send button did not render');
    await act(async () => button.click());
    if (!capturedInput) throw new Error('send input was not captured');
    return capturedInput;
  }

  it('keeps the draft and owned context when a send is not accepted', async () => {
    const { textarea } = await renderInput();
    await submit(textarea);

    expect(textarea.value).toBe('hello');
    expect(rememberSentTextSpy).not.toHaveBeenCalled();
    expect(recallOnSentSpy).not.toHaveBeenCalled();
    expect(handleCancelUploadSpy).not.toHaveBeenCalled();
    expect(detachSpy).not.toHaveBeenCalled();
  });

  it('handles a rejected send promise without clearing the payload', async () => {
    const error = new Error('session creation threw');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMessageSpy.mockImplementation((input: SendMessageInput) => {
      capturedInput = input;
      return Promise.reject(error);
    });
    const { textarea } = await renderInput();

    await submit(textarea);

    await vi.waitFor(() =>
      expect(consoleSpy).toHaveBeenCalledWith(
        '[opencx] failed to send message',
        error,
      ),
    );
    expect(textarea.value).toBe('hello');
    expect(handleCancelUploadSpy).not.toHaveBeenCalled();
    expect(detachSpy).not.toHaveBeenCalled();
  });

  it('clears only after acceptance', async () => {
    const order: string[] = [];
    detachSpy.mockImplementation(() => order.push('detach'));
    handleCancelUploadSpy.mockImplementation(() => order.push('file'));
    const { textarea } = await renderInput();
    const input = await submit(textarea);

    await act(async () => input.onAccepted?.());

    expect(textarea.value).toBe('');
    expect(rememberSentTextSpy).toHaveBeenCalledWith('hello');
    expect(recallOnSentSpy).toHaveBeenCalledTimes(1);
    expect(handleCancelUploadSpy).toHaveBeenCalledWith('file-1');
    expect(detachSpy).toHaveBeenCalledWith(marks[0]);
    expect(order).toEqual(['detach', 'file']);
  });

  it('does not update or reopen an unmounted composer after delayed acceptance', async () => {
    const { textarea } = await renderInput();
    const input = await submit(textarea);

    act(() => root.unmount());
    rootMounted = false;
    act(() => input.onAccepted?.());

    expect(rememberSentTextSpy).toHaveBeenCalledWith('hello');
    expect(detachSpy).toHaveBeenCalledWith(marks[0]);
    expect(recallOnSentSpy).not.toHaveBeenCalled();
    expect(handleCancelUploadSpy).toHaveBeenCalledWith('file-1');
  });

  it('does not send Enter while an IME composition is active', async () => {
    const { textarea } = await renderInput();
    await act(async () => setTextareaValue(textarea, 'composing'));

    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          isComposing: true,
        }),
      );
    });

    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('sends an attached mark on its own, its note standing in as the message', async () => {
    // Attaching a mark and writing the note on it IS asking the question —
    // the composer must not demand it typed a second time.
    allFiles = [];
    marks = [
      {
        shape: 'box',
        note: 'what is this?',
        elements: [{ name: 'div "Mode"' }],
      },
    ];
    await renderInput();

    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="send_message"]',
    );
    expect(button?.disabled).toBe(false);
    await act(async () => button?.click());

    expect(capturedInput?.content).toBe('what is this?');
    // Both keys: the rich marks for this turn, and the flat picked elements
    // the backend persists and re-surfaces on later turns.
    expect(capturedInput?.clientContext).toEqual({
      page_marks: marks,
      picked_elements: [{ name: 'div "Mode"', note: 'what is this?' }],
    });
  });

  it('carries the mark snapshot URL on the send, so a reload shows the picture', async () => {
    allFiles = [];
    marks = [
      {
        shape: 'box',
        note: 'call failed',
        elements: [{ name: 'div "Call summary"' }],
        snapshotUrl: 'https://storage.test/marks/1.jpg',
      },
    ];
    await renderInput();
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="send_message"]',
    );
    await act(async () => button?.click());

    expect(capturedInput?.clientContext).toEqual({
      page_marks: marks,
      picked_elements: [{ name: 'div "Call summary"', note: 'call failed' }],
    });
    const [sentMark] = capturedInput?.clientContext?.page_marks as Array<{
      snapshotUrl?: string;
    }>;
    expect(sentMark?.snapshotUrl).toBe('https://storage.test/marks/1.jpg');
  });

  it('waits for an in-flight snapshot upload before sending', async () => {
    allFiles = [];
    const mark = {
      shape: 'box',
      note: 'call failed',
      elements: [{ name: 'div "Call summary"' }],
    };
    marks = [mark];
    pendingSnapshots.set(mark, () => undefined);
    await renderInput();
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="send_message"]',
    );
    await act(async () => button?.click());
    // Not sent yet: the upload has not landed and the grace period is open.
    expect(capturedInput).toBeNull();

    await act(async () => {
      pendingSnapshots.get(mark)?.('https://storage.test/marks/late.jpg');
    });
    const [sentMark] = capturedInput?.clientContext?.page_marks as Array<{
      snapshotUrl?: string;
    }>;
    expect(sentMark?.snapshotUrl).toBe('https://storage.test/marks/late.jpg');
    pendingSnapshots.clear();
  });

  it("shows the host page's entity as a context pill, and a send carries it", async () => {
    configContext = {
      page: { url: 'https://app.test/ai-instructions?selectedDocumentId=i-1' },
      entity: { type: 'instruction', id: 'i-1', title: 'Payment questions' },
    };
    const { textarea } = await renderInput();
    expect(container.textContent).toContain('Payment questions');
    const input = await submit(textarea, 'what does this do?');
    expect(input.withPageEntity).toBe(true);
  });

  it('dismissing the pill drops the entity from that send only, then it comes back', async () => {
    configContext = {
      entity: { type: 'instruction', id: 'i-1', title: 'Payment questions' },
    };
    sendMessageSpy.mockImplementation((input: SendMessageInput) => {
      capturedInput = input;
      input.onAccepted?.();
      return Promise.resolve();
    });
    const { textarea } = await renderInput();
    const remove = container.querySelector<HTMLButtonElement>(
      'button[aria-label="page_context_remove"]',
    );
    expect(remove).not.toBeNull();
    await act(async () => remove?.click());
    expect(container.textContent).not.toContain('Payment questions');

    const input = await submit(textarea, 'unrelated question');
    expect(input.withPageEntity).toBe(false);
    // Accepted send: the pill is back for the next message.
    expect(container.textContent).toContain('Payment questions');
  });

  it('renders no pill for a malformed entity, and the send still says withPageEntity', async () => {
    configContext = { entity: { type: 'x' } };
    const { textarea } = await renderInput();
    expect(
      container.querySelector('button[aria-label="page_context_remove"]'),
    ).toBeNull();
    const input = await submit(textarea, 'hi');
    expect(input.withPageEntity).toBe(true);
  });

  it('falls back to the default question for a note-less mark, and stays disabled with nothing at all', async () => {
    allFiles = [];
    marks = [{ shape: 'box', elements: [{ name: 'div "Mode"' }] }];
    await renderInput();
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="send_message"]')
        ?.click(),
    );
    expect(capturedInput?.content).toBe('page_mark_default_message');

    act(() => root.unmount());
    rootMounted = false;
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    rootMounted = true;
    marks = [];
    sendMessageSpy.mockClear();
    await renderInput();
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="send_message"]',
    );
    expect(button?.disabled).toBe(true);
    await act(async () => button?.click());
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('typed text mid-stream sends (queues) even under the default awaiting-reply gate', async () => {
    // The gate belongs to the non-streaming engine; the streaming agent
    // surface queues a mid-turn send instead of blocking it.
    isStreaming = true;
    const { textarea } = await renderInput();
    await act(async () => setTextareaValue(textarea, 'next message'));
    expect(
      container.querySelector('button[aria-label="stop_response"]'),
    ).toBeNull();
    const sendButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="send_message"]',
    );
    expect(sendButton?.disabled).toBe(false);
    await act(async () => sendButton?.click());
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    expect(onStopSpy).not.toHaveBeenCalled();
  });

  it('an empty box mid-stream offers Stop', async () => {
    isStreaming = true;
    marks = [];
    allFiles = [];
    await renderInput();
    const stopButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="stop_response"]',
    );
    expect(stopButton?.disabled).toBe(false);
    await act(async () => stopButton?.click());
    expect(onStopSpy).toHaveBeenCalledTimes(1);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('Enter on an empty box flushes the queue the pill advertises', async () => {
    isStreaming = true;
    marks = [];
    allFiles = [];
    queuedUserMessages = [{ id: 'q-1', content: 'and the invoice too' }];
    const { textarea } = await renderInput();

    await act(async () =>
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      ),
    );

    expect(onStopSpy).toHaveBeenCalledTimes(1);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('leaves a live response alone on a stray Enter with nothing queued', async () => {
    isStreaming = true;
    marks = [];
    allFiles = [];
    const { textarea } = await renderInput();

    await act(async () =>
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      ),
    );

    expect(onStopSpy).not.toHaveBeenCalled();
  });

  it('docks attached context outside the composer so the box never grows', async () => {
    marks = [];
    allFiles = [];
    configContext = {
      entity: { type: 'instruction', id: 'i-1', title: 'Payment questions' },
    };
    await renderInput();

    const composer = container.querySelector(
      '[data-component="chat/input_box/inner_root"]',
    );
    const pills = container.querySelector(
      '[data-component="chat/input_box/page_marks_container"]',
    );
    if (!composer || !pills)
      throw new Error('composer or pills did not render');

    expect(pills.textContent).toContain('Payment questions');
    // Inside the bordered box, every attached pill pushed the textarea down
    // and made the composer taller. It must sit on the outside edge.
    expect(composer.contains(pills)).toBe(false);
    // ...but in the SAME tray, directly above it: that shared frame is what
    // fuses context and composer into one unit instead of a floating chip.
    const tray = container.querySelector(
      '[data-component="chat/input_box/attached_context_tray"]',
    );
    expect(pills.parentElement).toBe(tray);
    expect(composer.parentElement).toBe(tray);
    expect(pills.nextElementSibling).toBe(composer);
    expect(tray?.className).toContain('bg-muted');
    // The box is permanent; only the colour changes. If the padding rode the
    // content, detaching snapped the composer 4px before the row above it had
    // finished collapsing — attach and detach stopped being mirrors.
    expect(tray?.className).toContain('p-[var(--cx-p)]');
  });

  it('collapses the tray to the bare composer with nothing attached', async () => {
    marks = [];
    allFiles = [];
    await renderInput();

    const tray = container.querySelector(
      '[data-component="chat/input_box/attached_context_tray"]',
    );
    expect(
      container.querySelector(
        '[data-component="chat/input_box/page_marks_container"]',
      ),
    ).toBeNull();
    // No context, no second surface — the composer looks exactly as it did
    // before the tray existed.
    expect(tray?.className).not.toContain('bg-muted');
    expect(tray?.className).toContain('bg-transparent');
    // ...but the BOX stays, so nothing snaps when context attaches.
    expect(tray?.className).toContain('p-[var(--cx-p)]');
  });

  it('shows the paperclip when the org has attachments', async () => {
    await renderInput();
    expect(
      container.querySelector('button[aria-label="attach_files"]'),
    ).not.toBeNull();
  });

  it('hides the paperclip when the org has no attachments (agent.features.attachments=false)', async () => {
    canAttach = false;
    await renderInput();
    expect(
      container.querySelector('button[aria-label="attach_files"]'),
    ).toBeNull();
    // The rest of the tool row is untouched.
    expect(
      container.querySelector('button[aria-label="mark_page"]'),
    ).not.toBeNull();
  });

  it('@ opens the mention picker; a pick adds a chip and the send carries the mention', async () => {
    vi.useFakeTimers();
    try {
      const { textarea } = await renderInput();
      await act(async () => setTextareaValue(textarea, 'deploy @Post'));
      textarea.setSelectionRange(12, 12);
      await act(async () =>
        textarea.dispatchEvent(new MouseEvent('click', { bubbles: true })),
      );
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      const option = container.querySelector<HTMLButtonElement>(
        '[data-component="chat/input_box/mention_picker/option"]',
      );
      expect(option?.textContent).toContain('PostgreSQL Backup');

      await act(async () => option?.click());
      expect(textarea.value).toBe('deploy @PostgreSQL Backup ');
      expect(
        container.querySelector(
          '[data-component="chat/input_box/mention_pill"]',
        ),
      ).not.toBeNull();

      const button = container.querySelector<HTMLButtonElement>(
        'button[aria-label="send_message"]',
      );
      await act(async () => button?.click());
      expect(capturedInput?.content).toBe('deploy @PostgreSQL Backup');
      expect(capturedInput?.mentions).toEqual([
        {
          type: 'workflow',
          id: 'wf_1',
          title: 'PostgreSQL Backup',
          icon: 'https://cdn/wf.svg',
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the page-mark button and the entity pill when page context is on', async () => {
    configContext = {
      entity: { type: 'instruction', id: 'i-1', title: 'Payment questions' },
    };
    await renderInput();
    expect(
      container.querySelector('button[aria-label="mark_page"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain('Payment questions');
  });

  it('page context off: no page-mark button, no entity pill, and a send carries no page context', async () => {
    sendsPageContext = false;
    marks = [];
    configContext = {
      page: { url: 'https://app.test/ai-instructions' },
      entity: { type: 'instruction', id: 'i-1', title: 'Payment questions' },
    };
    const { textarea } = await renderInput();
    expect(
      container.querySelector('button[aria-label="mark_page"]'),
    ).toBeNull();
    expect(
      container.querySelector('button[aria-label="page_context_remove"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain('Payment questions');
    // Attachments are a separate feature: the paperclip stays.
    expect(
      container.querySelector('button[aria-label="attach_files"]'),
    ).not.toBeNull();

    const input = await submit(textarea, 'hi');
    expect(input.clientContext).toBeUndefined();
  });

  it('shows no mic when dictation is off for this embed', async () => {
    await renderInput();
    expect(container.querySelector('button[aria-label="dictate"]')).toBeNull();
  });

  it('shows the mic when dictation is on, toggles it, and surfaces errors', async () => {
    dictationEnabled = true;
    dictationError = 'microphone';
    await renderInput();
    const mic = container.querySelector<HTMLButtonElement>(
      'button[aria-label="dictate"]',
    );
    expect(mic).not.toBeNull();
    await act(async () => mic?.click());
    expect(dictationToggleSpy).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('dictation_mic_blocked');
  });

  it('sending stops a live dictation first so half a phrase never ships', async () => {
    dictationEnabled = true;
    const { textarea } = await renderInput();
    await submit(textarea, 'spoken words');
    expect(dictationStopSpy).toHaveBeenCalled();
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
  });
});
