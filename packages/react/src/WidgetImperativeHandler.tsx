import { log } from '@opencx/widget-core';
import React from 'react';
import {
  useContact,
  useWidgetRouter,
  useWidgetTrigger,
} from '@opencx/widget-react-headless';

export type WidgetRef = {
  /** Open the widget on a fresh conversation, optionally sending its first message. */
  newChat: (options?: { message?: string }) => Promise<void>;
};

export function WidgetImperativeHandler({
  widgetRef,
}: {
  widgetRef: React.Ref<WidgetRef>;
}) {
  const { contactState } = useContact();
  const { setIsOpen } = useWidgetTrigger();
  const { toChatScreen } = useWidgetRouter();

  React.useImperativeHandle(
    widgetRef,
    () => ({
      newChat: async (options) => {
        if (!contactState.contact?.token) {
          log.warn('cannot start a new chat: contact not yet initialized');
          return;
        }
        setIsOpen(true);
        // Companion navigation selects an independent runtime synchronously;
        // React may not have rendered its hooks yet, so send to that runtime.
        const conversation = toChatScreen();
        if (conversation && options?.message) {
          await conversation.messageCtx.sendMessage({
            content: options.message,
          });
        }
      },
    }),
    [contactState, setIsOpen, toChatScreen],
  );

  return null;
}
