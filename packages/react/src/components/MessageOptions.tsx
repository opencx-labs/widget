import type { WidgetMessageOptions } from '@opencx/widget-core';
import { useMessages, useSessions } from '@opencx/widget-react-headless';
import { CheckIcon } from 'lucide-react';
import React from 'react';
import { dc } from '../utils/data-component.js';
import { Button } from './lib/button.js';

/**
 * Only the first tap on the newest options message of an open session counts,
 * so only it shows the options. After a tap only the picked one stays, as a
 * receipt; options that can no longer be tapped are not shown.
 */
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
  const picked = messageOptions.options.find(
    (option) => option.id === pickedOptionId,
  );

  if (picked) {
    return (
      <div {...dc('chat/agent_msg/options')} className="flex">
        <Button
          {...dc('chat/agent_msg/option_btn')}
          data-picked
          aria-pressed
          size="sm"
          variant="outline"
          className="w-fit pl-2 text-sm text-muted-foreground disabled:opacity-100"
          disabled
        >
          <CheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
          {picked.label}
        </Button>
      </div>
    );
  }

  if (!tappable) return null;

  return (
    <div
      {...dc('chat/agent_msg/options')}
      role="group"
      className="flex flex-row flex-wrap gap-1.5"
    >
      {messageOptions.options.map((option) => (
        <Button
          key={option.id}
          {...dc('chat/agent_msg/option_btn')}
          size="sm"
          variant="outline"
          className="relative w-fit text-sm hover:bg-secondary"
          onClick={() =>
            sendMessage({
              content: option.label,
              optionReply: { messageId, optionId: option.id },
            })
          }
        >
          {/* 48×48 tap area on touch screens, without changing the layout. */}
          <span
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-x-1/2 -translate-y-1/2 [@media(pointer:fine)]:hidden"
          />
          {option.label}
        </Button>
      ))}
    </div>
  );
}
