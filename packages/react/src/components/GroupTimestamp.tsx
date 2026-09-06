import React from 'react';
import { log } from '@opencx/widget-core';
import type {
  WidgetAiMessage,
  WidgetAgentMessage,
  WidgetUserMessage,
} from '@opencx/widget-core';
import { useConfig } from '@opencx/widget-react-headless';
import { cn } from './lib/utils/cn';

export function GroupTimestamp({
  messages,
  className,
  containerClassName,
}: {
  messages: WidgetAiMessage[] | WidgetAgentMessage[] | WidgetUserMessage[];
  className?: string;
  containerClassName?: string;
}) {
  const { timestamps } = useConfig();

  if (!timestamps?.perMessageGroup?.enabled) {
    return null;
  }

  const lastMessageTimestamp = messages[messages.length - 1]?.timestamp;
  if (!lastMessageTimestamp) return null;

  const formattedTimestamp = (() => {
    try {
      return new Date(lastMessageTimestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (error) {
      log.error('failed to format timestamp', error);
      return null;
    }
  })();
  if (!formattedTimestamp) return null;

  return (
    <div className={containerClassName}>
      <span className={cn('text-xs text-muted-foreground', className)}>
        {formattedTimestamp}
      </span>
    </div>
  );
}
