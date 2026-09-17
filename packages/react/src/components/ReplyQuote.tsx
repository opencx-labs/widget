import type { WidgetAgentMessage } from '@opencx/widget-core';
import React from 'react';
import { dc } from '../utils/data-component';
import { cn } from './lib/utils/cn';

/**
 * The earlier message a teammate's reply answers. When a person joins a
 * conversation the AI has been carrying, this is what tells the customer which
 * of their messages is being answered. Click jumps to the original.
 */
export function ReplyQuote({
  replyTo,
}: {
  replyTo: NonNullable<WidgetAgentMessage['replyTo']>;
}) {
  return (
    <button
      {...dc('chat/agent_msg/reply_to')}
      type="button"
      onClick={(event) => {
        const original = event.currentTarget.ownerDocument.querySelector(
          `[data-message-id="${CSS.escape(replyTo.id)}"]`,
        );
        original?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Already on screen means no scroll: flash it so the jump always lands
        // somewhere visible.
        original?.animate([{ opacity: 0.35 }, { opacity: 1 }], {
          duration: 900,
          easing: 'ease-out',
        });
      }}
      className={cn(
        'max-w-full min-w-0 text-start',
        'border-s-2 border-primary/40 ps-2 py-0.5',
        'text-xs leading-snug text-muted-foreground hover:text-foreground transition-colors',
      )}
    >
      {replyTo.senderName && (
        <span className="block font-medium text-foreground">
          {replyTo.senderName}
        </span>
      )}
      <span className="line-clamp-2 break-words">{replyTo.text}</span>
    </button>
  );
}
