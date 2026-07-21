import React from 'react';
import type { WidgetAiMessage } from '@opencx/widget-core';
import { useBot, useMessages, useConfig } from '@opencx/widget-react-headless';
import { AgentMessageGroup } from '../../components/AgentMessageGroup';

export function AdvancedInitialMessages() {
  const {
    messagesState: { messages },
  } = useMessages();

  const {
    advancedInitialMessages = [],
    initialQuestionsPosition,
    initialQuestions,
  } = useConfig();
  // Server-resolved agent branding wins over the local `bot` option.
  const bot = useBot();

  return (
    <>
      {messages.length === 0 && advancedInitialMessages.length > 0 && (
        <AgentMessageGroup
          messages={advancedInitialMessages.map(
            ({ message }, index) =>
              ({
                component: 'bot_message',
                data: { message },
                id: `${index}-${message}`,
                type: 'AI',
                timestamp: null,
              }) satisfies WidgetAiMessage,
          )}
          suggestedReplies={
            messages.length === 0 &&
            initialQuestionsPosition === 'below-initial-messages'
              ? initialQuestions
              : undefined
          }
          agent={bot ? { ...bot, isAi: true, id: null } : undefined}
        />
      )}
    </>
  );
}
