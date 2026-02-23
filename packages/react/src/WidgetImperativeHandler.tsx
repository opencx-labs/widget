import React from 'react';
import {
  useContact,
  useMessages,
  useWidget,
  useWidgetRouter,
  useWidgetTrigger,
} from '@opencx/widget-react-headless';

export type WidgetRef = {
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
  const { sendMessage } = useMessages();

  React.useImperativeHandle(
    widgetRef,
    () => ({
      newChat: async (options) => {
        if (!contactState.contact?.token) {
          console.warn('Cannot start a new chat: contact not yet initialized.');
          return;
        }

        console.log({ isOpen });
        if (!isOpen) setIsOpen(true);

        if (screen === 'chat') widgetCtx.resetChat();

        toChatScreen();
        if (options?.message) sendMessage({ content: options.message });
      },
    }),
    [
      widgetCtx,
      contactState,
      setIsOpen,
      isOpen,
      screen,
      toChatScreen,
      sendMessage,
    ],
  );

  return null;
}
