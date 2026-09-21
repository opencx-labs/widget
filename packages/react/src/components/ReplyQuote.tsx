import type { WidgetAgentMessage } from '@opencx/widget-core';
import React from 'react';
import { dc } from '../utils/data-component';
import { cn } from './lib/utils/cn';

/**
 * The earlier message a teammate's reply answers. When a person joins a
 * conversation the AI has been carrying, this is what tells the customer which
 * of their messages is being answered. Click jumps to the original.
 *
 * Rendered INSIDE the reply's bubble (see `AgentMessageDefaultComponent`), the
 * way every chat app does it: a tinted panel with an accent edge that the
 * bubble grows around, never a loose paragraph floating above a short bubble.
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
        'not-prose mb-2 block w-full min-w-0 text-start',
        'rounded-xl border-s-2 border-primary/50 bg-primary/[0.07] ps-2.5 pe-2 py-1.5',
        'text-xs leading-snug text-muted-foreground',
        'transition-colors hover:bg-primary/10 hover:text-foreground',
      )}
    >
      {/* The visitor's own message carries no sender name — say "You" rather
          than leaving the quote unlabelled. */}
      <span className="block font-medium text-foreground/80">
        {replyTo.senderName ?? 'You'}
      </span>
      <span className="line-clamp-2 break-words">{replyTo.text}</span>
    </button>
  );
}
