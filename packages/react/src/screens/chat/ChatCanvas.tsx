import React, { useState } from 'react';
import {
  useMessages,
  useModes,
  useSessions,
} from '@opencx/widget-react-headless';
import { useComponentContext } from '../../hooks/useComponentContext';

export function ChatCanvas() {
  const props = useComponentContext();
  const { activeMode, Component } = useModes();
  const { sendMessage } = useMessages();
  const { createStateCheckpoint } = useSessions();

  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const handleSendMessage = async (args: Parameters<typeof sendMessage>[0]) => {
    try {
      setIsSendingMessage(true);
      await sendMessage(args);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSendingMessage(false);
    }
  };

  if (!activeMode || !Component) return null;

  return (
    <Component
      {...props}
      mode={activeMode}
      createStateCheckpoint={createStateCheckpoint}
      sendMessage={handleSendMessage}
      isSendingMessage={isSendingMessage}
    />
  );
}
