import {
  type WidgetAgentMessage,
  type WidgetAiMessage,
  type WidgetMessageU,
  type WidgetUserMessage,
} from '@opencx/widget-core';

export function groupMessagesByType(
  messages: WidgetMessageU[],
): WidgetMessageU[][] {
  const result: WidgetMessageU[][] = [];
  let currentGroup: WidgetMessageU[] | null = null;

  messages.forEach((message) => {
    if (
      // Start a new group if the type changes
      currentGroup?.[0]?.type !== message.type ||
      // Start a new group if the agent changes
      (currentGroup[0]?.type === 'AGENT' &&
        message.type === 'AGENT' &&
        (message.agent?.id !== currentGroup[0].agent?.id ||
          message.agent?.name !== currentGroup[0].agent?.name))
    ) {
      currentGroup = [];
      result.push(currentGroup);
    }

    currentGroup.push(message);
  });

  return result;
}

export function isUserMessageGroup(
  messages: WidgetMessageU[],
): messages is WidgetUserMessage[] {
  return messages?.[0]?.type === 'USER';
}

export function isBotMessageGroup(
  messages: WidgetMessageU[],
): messages is WidgetAiMessage[] {
  return messages?.[0]?.type === 'AI';
}

export function isAgentMessageGroup(
  messages: WidgetMessageU[],
): messages is WidgetAgentMessage[] {
  return messages?.[0]?.type === 'AGENT';
}
