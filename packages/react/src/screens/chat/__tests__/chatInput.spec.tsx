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
let isStreaming = false;
let enablePageMarks = true;
let capturedInput: SendMessageInput | null = null;
let marks: Array<{ shape: string; elements: Array<{ name: string }> }> = [];
let allFiles: Array<{
  id: string;
  status: 'success';
  file: File;
  fileUrl: string;
  progress: number;
}> = [];

vi.mock('@opencx/widget-react-headless', () => ({
  useAgentChatUi: () => ({ isStreaming, onStop: onStopSpy }),
  useConfig: () => ({ enablePageMarks }),
  useIsAwaitingBotReply: () => ({ isAwaitingBotReply: false }),
  useMessages: () => ({
    sendMessage: sendMessageSpy,
    rememberSentText: rememberSentTextSpy,
    getSentTextHistory: () => [],
  }),
  useSessions: () => ({ sessionState: { session: null } }),
  useUploadFiles: () => ({
    allFiles,
    handleCancelUpload: handleCancelUploadSpy,
    appendFiles: vi.fn(),
    isUploading: false,
    successFiles: allFiles,
  }),
  useWidget: () => ({ widgetCtx: { isAgentBound: true } }),
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

vi.mock('../../../page-marks/usePageMarks', () => ({
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
    enablePageMarks = true;
    capturedInput = null;
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

  async function renderInput(onMessageSent = vi.fn()) {
    await act(async () => {
      root.render(<ChatInput onMessageSent={onMessageSent} />);
    });
    const textarea = container.querySelector('textarea');
    if (!textarea) throw new Error('textarea did not render');
    return { textarea, onMessageSent };
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
    const { textarea, onMessageSent } = await renderInput();
    await submit(textarea);

    expect(textarea.value).toBe('hello');
    expect(rememberSentTextSpy).not.toHaveBeenCalled();
    expect(recallOnSentSpy).not.toHaveBeenCalled();
    expect(handleCancelUploadSpy).not.toHaveBeenCalled();
    expect(detachSpy).not.toHaveBeenCalled();
    expect(onMessageSent).not.toHaveBeenCalled();
  });

  it('handles a rejected send promise without clearing the payload', async () => {
    const error = new Error('session creation threw');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMessageSpy.mockImplementation((input: SendMessageInput) => {
      capturedInput = input;
      return Promise.reject(error);
    });
    const { textarea, onMessageSent } = await renderInput();

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
    expect(onMessageSent).not.toHaveBeenCalled();
  });

  it('clears only after acceptance and notifies the parent last', async () => {
    const order: string[] = [];
    detachSpy.mockImplementation(() => order.push('detach'));
    handleCancelUploadSpy.mockImplementation(() => order.push('file'));
    const onMessageSent = vi.fn(() => order.push('parent'));
    const { textarea } = await renderInput(onMessageSent);
    const input = await submit(textarea);

    await act(async () => input.onAccepted?.());

    expect(textarea.value).toBe('');
    expect(rememberSentTextSpy).toHaveBeenCalledWith('hello');
    expect(recallOnSentSpy).toHaveBeenCalledTimes(1);
    expect(handleCancelUploadSpy).toHaveBeenCalledWith('file-1');
    expect(detachSpy).toHaveBeenCalledWith(marks[0]);
    expect(order).toEqual(['detach', 'file', 'parent']);
  });

  it('does not update or reopen an unmounted composer after delayed acceptance', async () => {
    const { textarea, onMessageSent } = await renderInput();
    const input = await submit(textarea);

    act(() => root.unmount());
    rootMounted = false;
    act(() => input.onAccepted?.());

    expect(rememberSentTextSpy).toHaveBeenCalledWith('hello');
    expect(detachSpy).toHaveBeenCalledWith(marks[0]);
    expect(recallOnSentSpy).not.toHaveBeenCalled();
    expect(handleCancelUploadSpy).toHaveBeenCalledWith('file-1');
    expect(onMessageSent).not.toHaveBeenCalled();
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

  it('keeps Stop accessible with typed text under the default streaming gate', async () => {
    isStreaming = true;
    const { textarea } = await renderInput();
    await act(async () => setTextareaValue(textarea, 'next message'));
    const stopButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="stop_response"]',
    );

    expect(stopButton).not.toBeNull();
    expect(stopButton?.disabled).toBe(false);
    await act(async () => stopButton?.click());
    expect(onStopSpy).toHaveBeenCalledTimes(1);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });
});
