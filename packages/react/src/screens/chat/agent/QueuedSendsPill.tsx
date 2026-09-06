import { useAgentChatUi, useMessages } from '@opencx/widget-react-headless';
import { AnimatePresence } from 'framer-motion';
import { CornerDownLeftIcon, XIcon } from 'lucide-react';
import React, { useMemo } from 'react';
import { MotionDiv__VerticalReveal } from '../../../components/lib/MotionDiv__VerticalReveal';
import { useTranslation } from '../../../hooks/useTranslation';
import { dc } from '../../../utils/data-component';

/**
 * The multi-send queue pill (Cursor-style), docked above the composer.
 *
 * Messages sent while a turn is streaming wait here — NOT in the transcript —
 * until their own turn starts (when the live turn finishes, errors, or is
 * stopped), at which point they move into the message list right above the
 * response they're about to get. Each row can be removed before it's sent.
 *
 * A click on the header's ↵ or on a queued row sends the queue now: it
 * stops the live turn, and the queue drains into the next one — the same
 * thing Enter on an empty composer does.
 *
 * Renders nothing outside an agent surface (bot-chat embeds: the default context
 * has no queued messages) or when the queue is empty.
 */
export function QueuedSendsPill() {
  const { queuedUserMessages, removeQueued, stop } = useAgentChatUi();
  const {
    messagesState: { messages },
  } = useMessages();
  const { t } = useTranslation();

  // Guard against the one-frame overlap where a message was just drained into
  // the transcript but the queue snapshot hasn't recomputed yet.
  const pending = useMemo(
    () =>
      queuedUserMessages.filter((q) => !messages.some((m) => m.id === q.id)),
    [queuedUserMessages, messages],
  );

  return (
    <AnimatePresence>
      {pending.length > 0 && (
        <MotionDiv__VerticalReveal key="queued-sends-pill">
          <div
            {...dc('chat/queued_sends/root')}
            className="mb-1 rounded-2xl border border-muted-foreground/15 bg-background shadow-sm"
          >
            <div
              {...dc('chat/queued_sends/header')}
              className="flex items-center justify-between px-3 pt-2 pb-1"
            >
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('queued_label', { count: pending.length })}
              </span>
              <button
                type="button"
                {...dc('chat/queued_sends/send_now')}
                aria-label={t('send_queued_now')}
                title={t('send_queued_now')}
                onClick={stop}
                className="rounded-md p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground hover:bg-muted"
              >
                <CornerDownLeftIcon className="size-3" />
              </button>
            </div>
            <ul
              {...dc('chat/queued_sends/list')}
              className="flex flex-col pb-1"
            >
              {pending.map((message) => (
                <li
                  key={message.id}
                  {...dc('chat/queued_sends/item')}
                  className="group flex items-center gap-2 px-3 py-1"
                >
                  <button
                    type="button"
                    title={t('send_queued_now')}
                    onClick={stop}
                    className="min-w-0 flex-1 truncate text-start text-xs text-foreground/80 hover:text-foreground"
                  >
                    {message.content}
                  </button>
                  <button
                    type="button"
                    {...dc('chat/queued_sends/remove')}
                    aria-label={t('remove_queued_message')}
                    onClick={() => removeQueued(message.id)}
                    className="shrink-0 rounded-md p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground hover:bg-muted"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </MotionDiv__VerticalReveal>
      )}
    </AnimatePresence>
  );
}
