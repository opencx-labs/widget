import React from 'react';
import type { WidgetAiMessage } from '@opencx/widget-core';
import { useBot, useMessages, useConfig } from '@opencx/widget-react-headless';
import { AgentMessageGroup } from '../../components/AgentMessageGroup';

export function InitialMessages() {
  const {
    messagesState: { messages },
  } = useMessages();
  const config = useConfig();
  const bot = useBot();
  const {
    advancedInitialMessages = [],
    initialQuestions,
    initialQuestionsPosition,
  } = config;

  const initialMessages = (() => {
    if (advancedInitialMessages.length) return [];
    if (messages.length) return [];
    // TODO translate default welcome message
    if (!config.initialMessages?.length) return ['Hello, how can I help you?'];
    return config.initialMessages;
  })();

  return (
    <>
      {messages.length === 0 && initialMessages.length > 0 && (
        <AgentMessageGroup
          messages={initialMessages.map(
            (m, index) =>
              ({
                component: 'bot_message',
                data: { message: m },
                id: `${index}-${m}`,
                type: 'AI',
                timestamp: null,
              }) satisfies WidgetAiMessage,
          )}
          suggestedReplies={
            initialQuestionsPosition === 'below-initial-messages'
              ? initialQuestions
              : undefined
          }
          agent={
            bot ? { ...bot, isAi: true, id: null } : undefined
          }
        />
      )}
    </>
  );
}
