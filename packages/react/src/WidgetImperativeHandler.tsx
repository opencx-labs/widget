import { log } from '@opencx/widget-core';
import React from 'react';
import {
  useContact,
  useMessages,
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
  const { sendMessage } = useMessages();

  React.useImperativeHandle(
    widgetRef,
    () => ({
      newChat: async (options) => {
        if (!contactState.contact?.token) {
          log.warn('cannot start a new chat: contact not yet initialized');
          return;
        }
        setIsOpen(true);
        // `toChatScreen` resets the current conversation on its way in.
        toChatScreen();
        if (options?.message) await sendMessage({ content: options.message });
      },
    }),
    [contactState, setIsOpen, toChatScreen, sendMessage],
  );

  return null;
}
