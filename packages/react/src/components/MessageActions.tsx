import { log, type WidgetAiMessage } from '@opencx/widget-core';
import { useConfig, useDisplayMode } from '@opencx/widget-react-headless';
import { CheckIcon, CopyIcon } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { dc } from '../utils/data-component';
import { stripCitationRefs } from '../utils/strip-citation-refs';
import { Tooltippy } from './lib/tooltip';
import { cn } from './lib/utils/cn';

/** How long the button reads "Copied" before it offers to copy again. */
const COPIED_FEEDBACK_MS = 2000;

/** The reply as text: every message of the group, citation tags removed. */
export function replyText(
  messages: readonly Pick<WidgetAiMessage, 'data'>[],
): string {
  return messages
    .map((message) => stripCitationRefs(message.data.message).trim())
    .filter((text) => text.length > 0)
    .join('\n\n');
}

/**
 * Whether the copy button shows. The companion is the v5-native surface and
 * gets it out of the box; the popover is what a v4 embed upgrades into and
 * must look the same until the embed asks (`messageActions.copy`).
 */
export function useShowsCopyAction(): boolean {
  const { messageActions } = useConfig();
  const displayMode = useDisplayMode();
  return messageActions?.copy ?? displayMode === 'companion';
}

/**
 * The quiet action row under an AI reply group. By default hidden until the
 * group is hovered on pointer devices and always visible on touch screens
 * (there is no hover to reveal it); `messageActions.display: 'always'` keeps
 * it visible everywhere. Skipped when the clipboard is unavailable — an
 * insecure-origin host page — rather than showing a button that fails.
 */
export function MessageActions({
  messages,
}: {
  messages: readonly Pick<WidgetAiMessage, 'data'>[];
}) {
  const { t } = useTranslation();
  const { messageActions } = useConfig();
  const alwaysVisible = messageActions?.display === 'always';
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    },
    [],
  );

  const text = replyText(messages);
  const clipboard =
    typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (!clipboard || text.length === 0) return null;

  const copy = () => {
    clipboard.writeText(text).then(
      () => {
        setCopied(true);
        if (resetRef.current) clearTimeout(resetRef.current);
        resetRef.current = setTimeout(
          () => setCopied(false),
          COPIED_FEEDBACK_MS,
        );
      },
      (error: unknown) => log.warn('copying the reply failed', error),
    );
  };

  const label = copied ? t('copied') : t('copy_reply');
  return (
    <div
      {...dc('chat/agent_msg_group/actions')}
      className={cn(
        'flex items-center gap-1 -mt-0.5 transition-opacity duration-150',
        alwaysVisible
          ? 'opacity-100'
          : cn(
              'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
              '[@media(hover:none)]:opacity-100',
            ),
      )}
    >
      <Tooltippy content={label} side="bottom" align="start">
        <button
          {...dc('chat/agent_msg_group/actions/copy')}
          type="button"
          aria-label={label}
          aria-live="polite"
          onClick={copy}
          className={cn(
            'flex size-6 items-center justify-center rounded-md',
            'text-muted-foreground/70 hover:bg-muted hover:text-foreground',
            'transition-colors active:scale-95',
          )}
        >
          {copied ? (
            <CheckIcon className="size-3.5" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
        </button>
      </Tooltippy>
    </div>
  );
}
