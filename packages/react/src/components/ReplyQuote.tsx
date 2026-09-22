import type { WidgetAgentMessage } from '@opencx/widget-core';
import React from 'react';
import { useBot, useConfig } from '@opencx/widget-react-headless';
import { dc } from '../utils/data-component';
import { cn } from './lib/utils/cn';

/** An in-bubble quote that links to its original message. */
export function ReplyQuote({
  replyTo,
}: {
  replyTo: NonNullable<WidgetAgentMessage['replyTo']>;
}) {
  const bot = useBot();
  const { humanAgent } = useConfig();
  const { sender } = replyTo;
  const senderName =
    sender.kind === 'user'
      ? 'You'
      : sender.kind === 'ai'
        ? bot.name
        : sender.kind === 'agent'
          ? humanAgent?.name || sender.name || 'Team'
          : sender.name;

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
      {senderName && (
        <span className="block font-medium text-foreground/80">
          {senderName}
        </span>
      )}
      <span className="line-clamp-2 break-words">{replyTo.text}</span>
    </button>
  );
}
