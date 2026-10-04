import type { WidgetMessageOptions } from '@opencx/widget-core';
import { useMessages, useSessions } from '@opencx/widget-react-headless';
import React from 'react';
import { dc } from '../utils/data-component.js';
import { Button } from './lib/button.js';
import { cn } from './lib/utils/cn.js';

/** Only the first tap on the newest options message of an open session counts, so only it is tappable. */
export function MessageOptions({
  messageId,
  messageOptions,
}: {
  messageId: string;
  messageOptions: WidgetMessageOptions;
}) {
  const { messagesState, sendMessage } = useMessages();
  const { sessionState } = useSessions();

  const newestWithOptions = messagesState.messages.findLast(
    (message) => message.type === 'AGENT' && message.messageOptions,
  );
  const { pickedOptionId } = messageOptions;
  const tappable =
    pickedOptionId === null &&
    newestWithOptions?.id === messageId &&
    sessionState.session?.isOpened !== false;

  return (
    <div
      {...dc('chat/agent_msg/options')}
      className="flex flex-row flex-wrap gap-1.5"
    >
      {messageOptions.options.map((option) => {
        const picked = option.id === pickedOptionId;
        return (
          <Button
            key={option.id}
            {...dc('chat/agent_msg/option_btn')}
            data-picked={picked}
            size="sm"
            variant={picked ? 'default' : 'outline'}
            className={cn('rounded-xl w-fit', picked && 'disabled:opacity-100')}
            disabled={!tappable}
            onClick={() =>
              sendMessage({
                content: option.label,
                optionReply: { messageId, optionId: option.id },
              })
            }
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
