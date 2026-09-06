import {
  type WidgetAgentMessage,
  type Agent,
  type WidgetAiMessage,
} from '@opencx/widget-core';
import React from 'react';
import { dc } from '../utils/data-component';
import { AgentAvatar } from './AgentAvatar';
import { AgentMessage } from './AgentMessage';
import { Tooltippy } from './lib/tooltip';
import { cn } from './lib/utils/cn';
import { SuggestedReplyButton } from './SuggestedReplyButton';
import { GroupTimestamp } from './GroupTimestamp';
import { MessageActions, useShowsCopyAction } from './MessageActions';

/** Reply actions apply to the AI's replies, not a human agent's. */
function isAiMessage(
  message: WidgetAiMessage | WidgetAgentMessage,
): message is WidgetAiMessage {
  return message.type === 'AI' && message.data.variant !== 'error';
}

export function AgentMessageGroup({
  messages,
  agent,
  suggestedReplies,
  actions = true,
}: {
  messages: WidgetAiMessage[] | WidgetAgentMessage[];
  agent: Agent | undefined;
  suggestedReplies?: string[];
  /**
   * Offer the reply actions (copy). Off for a reply that is still streaming:
   * its text is not final yet.
   */
  actions?: boolean;
}) {
  const showsCopy = useShowsCopyAction();
  const aiMessages = messages.filter(isAiMessage);
  return (
    <div
      {...dc('chat/agent_msg_group/root')}
      className={cn('group flex items-end gap-2')}
    >
      <Tooltippy content={agent?.name} side="right" align="end">
        <AgentAvatar
          {...dc('chat/agent_msg_group/root/avatar')}
          agent={agent}
          className="hidden"
        />
      </Tooltippy>

      <div className={cn('flex-1 flex flex-col gap-1')}>
        <div
          {...dc('chat/agent_msg_group/avatar_and_msgs/root')}
          className={cn('flex items-end gap-2')}
        >
          <Tooltippy content={agent?.name} side="right" align="end">
            <AgentAvatar
              {...dc('chat/agent_msg_group/avatar_and_msgs/avatar')}
              agent={agent}
            />
          </Tooltippy>
          <div
            {...dc('chat/agent_msg_group/avatar_and_msgs/msgs')}
            className={cn('flex-1 flex flex-col gap-1')}
          >
            {messages.map((message, index, array) => (
              <AgentMessage
                key={message.id}
                isFirstInGroup={index === 0}
                isLastInGroup={index === array.length - 1}
                isAloneInGroup={array.length === 1}
                {...message}
              />
            ))}
            <GroupTimestamp messages={messages} />
            {actions && showsCopy && aiMessages.length > 0 && (
              <MessageActions messages={aiMessages} />
            )}
          </div>
        </div>

        {suggestedReplies && suggestedReplies.length > 0 && (
          <div
            {...dc('chat/agent_msg_group/suggestions')}
            className={cn('flex flex-col gap-1 ps-8')}
          >
            {suggestedReplies?.map((suggestion, index) => (
              <SuggestedReplyButton
                key={`${suggestion}-${index}`}
                suggestion={suggestion}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
