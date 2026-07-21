import React from 'react';
import {
  useContact,
  useMessages,
  useWidget,
  useWidgetRouter,
  useWidgetTrigger,
} from '@opencx/widget-react-headless';

export type WidgetRef = {
  /** Open the widget. No-op if already open (no remount). */
  open: () => void;
  /** Close the widget. */
  close: () => void;
  /** Toggle the widget between open and closed. */
  toggle: () => void;
  /**
   * Open the widget, go to the chat screen, and pre-fill the composer with
   * `message` WITHOUT sending it — the visitor presses Enter to send. An
   * already-open conversation is left intact (only the draft is set).
   */
  prefill: (message: string) => void;
  /**
   * Open the widget on a fresh chat and send `message` immediately. Alias of
   * `newChat({ message })`.
   */
  ask: (message: string) => Promise<void>;
  /**
   * Open the widget on a fresh chat and show `message` as a canned AI bubble.
   * The bubble is client-only: not persisted and not part of the AI's context.
   * The visitor can keep chatting normally afterwards.
   */
  presentAnswer: (message: string) => void;
  /** Open the widget on a fresh chat, optionally sending an initial `message`. */
  newChat: (options?: { message?: string }) => Promise<void>;
};

export function WidgetImperativeHandler({
  widgetRef,
}: {
  widgetRef: React.Ref<WidgetRef>;
}) {
  const { widgetCtx } = useWidget();
  const { contactState } = useContact();
  const { setIsOpen, isOpen } = useWidgetTrigger();
  const {
    toChatScreen,
    routerState: { screen },
  } = useWidgetRouter();
  const { sendMessage, injectLocalAgentMessage } = useMessages();

  React.useImperativeHandle(widgetRef, () => {
    const newChat: WidgetRef['newChat'] = async (options) => {
      if (!contactState.contact?.token) {
        console.warn('Cannot start a new chat: contact not yet initialized.');
        return;
      }

      if (!isOpen) setIsOpen(true);

      if (screen === 'chat') widgetCtx.resetChat();

      toChatScreen();
      if (options?.message) sendMessage({ content: options.message });
    };

    return {
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((prev) => !prev),
      prefill: (message) => {
        if (!isOpen) setIsOpen(true);
        // Navigating to chat resets the conversation (and clears the draft),
        // so only navigate when not already chatting, and set the draft AFTER.
        if (screen !== 'chat') toChatScreen();
        widgetCtx.setComposerDraft(message);
      },
      ask: (message) => newChat({ message }),
      presentAnswer: (message) => {
        if (!isOpen) setIsOpen(true);
        // Start a fresh chat (toChatScreen resets), then inject the canned bubble.
        toChatScreen();
        injectLocalAgentMessage(message);
      },
      newChat,
    };
  }, [
    widgetCtx,
    contactState,
    setIsOpen,
    isOpen,
    screen,
    toChatScreen,
    sendMessage,
    injectLocalAgentMessage,
  ]);

  return null;
}
