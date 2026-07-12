import React from 'react';
import type { WidgetCompanionLayoutU } from '@opencx/widget-core';
import {
  useContact,
  useMessages,
  useWidget,
  useWidgetLayout,
  useWidgetRouter,
  useWidgetTrigger,
} from '@opencx/widget-react-headless';

export type WidgetRef = {
  newChat: (options?: { message?: string }) => Promise<void>;
  setLayout: (layout: WidgetCompanionLayoutU) => void;
};

export function WidgetImperativeHandler({
  widgetRef,
}: {
  widgetRef: React.Ref<WidgetRef>;
}) {
  const { widgetCtx } = useWidget();
  const { contactState } = useContact();
  const { setIsOpen, isOpen } = useWidgetTrigger();
  const { setLayout } = useWidgetLayout();
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
      setLayout: (layout) => setLayout(layout),
    }),
    [
      widgetCtx,
      contactState,
      setIsOpen,
      isOpen,
      screen,
      toChatScreen,
      sendMessage,
      setLayout,
    ],
  );

  return null;
}
