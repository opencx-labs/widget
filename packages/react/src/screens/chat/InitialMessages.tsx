import React from 'react';
import type { WidgetAiMessage } from '@opencx/widget-core';
import { useBot, useMessages, useConfig } from '@opencx/widget-react-headless';
import { AgentMessageGroup } from '../../components/AgentMessageGroup';

/**
 * The greeting shown at the top of a fresh conversation.
 * `advancedInitialMessages` wins over the plain `initialMessages` strings;
 * with neither configured, a default greeting shows. Renders nothing once the
 * conversation has real messages.
 */
export function InitialMessages() {
  const {
    messagesState: { messages },
  } = useMessages();
  const config = useConfig();
  // Server-resolved agent branding wins over the local `bot` option.
  const bot = useBot();
  const {
    advancedInitialMessages = [],
    initialQuestions,
    initialQuestionsPosition,
  } = config;

  if (messages.length > 0) return null;

  const texts = advancedInitialMessages.length
    ? advancedInitialMessages.map((m) => m.message)
    : config.initialMessages?.length
      ? config.initialMessages
      : // TODO translate default welcome message
        ['Hello, how can I help you?'];

  return (
    <AgentMessageGroup
      messages={texts.map(
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
      agent={bot ? { ...bot, isAi: true, id: null } : undefined}
    />
  );
}
