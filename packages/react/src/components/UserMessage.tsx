import type { WidgetUserMessage } from '@opencx/widget-core';
import { MousePointerClickIcon } from 'lucide-react';
import React from 'react';
import { dc } from '../utils/data-component';
import { AttachmentPreview } from './AttachmentPreview';
import { cn } from './lib/utils/cn';

export function UserMessage({
  message,
  isFirstInGroup,
  isLastInGroup,
  isAloneInGroup,
}: {
  message: WidgetUserMessage;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  isAloneInGroup: boolean;
}) {
  return (
    <div
      {...dc('chat/user_msg/root')}
      className="w-5/6 flex flex-col items-end gap-1"
    >
      {message.pickedElements && message.pickedElements.length > 0 && (
        <div
          {...dc('chat/user_msg/picked_elements')}
          className="w-full flex gap-1 flex-wrap justify-end"
        >
          {message.pickedElements.map((el, i) => (
            <span
              key={`${el.name}-${i}`}
              className={cn(
                'inline-flex items-center gap-1.5 max-w-48',
                'rounded-full py-1 ps-2 pe-2.5',
                'bg-white ring-1 ring-black/10',
                'text-xs text-foreground',
              )}
              title={el.name}
            >
              <MousePointerClickIcon className="size-3 shrink-0 text-primary" />
              <span className="truncate">{el.name}</span>
            </span>
          ))}
        </div>
      )}
      {message.attachments && message.attachments.length > 0 && (
        <div className="w-full flex gap-1 flex-wrap justify-end">
          {message.attachments?.map((attachment) => (
            <AttachmentPreview attachment={attachment} key={attachment.id} />
          ))}
        </div>
      )}
      {message.content.length > 0 && (
        <div
          {...dc('chat/user_msg/msg')}
          // Expose these data attributes for external styling customization
          data-first={isFirstInGroup}
          data-last={isLastInGroup}
          data-alone={isAloneInGroup}
          data-pending={message.pending === true}
          className={cn(
            'transition-all',
            'w-fit py-3 px-4 rounded-3xl text-sm',
            'bg-primary text-primary-foreground',
            // v5 pending: sent but its answer hasn't started streaming yet.
            message.pending && 'opacity-60',
            'break-words [word-break:break-word]', // `[word-break:break-word]` is deprecated but works in the browser, while `break-words` which is `[overflow-wrap: break-word]` does not work
            'whitespace-pre-wrap',

            // We're using the booleans directly here, not the data attributes, to make any external styling more specific than this
            isFirstInGroup && !isAloneInGroup && 'rounded-br-md',
            isLastInGroup && !isAloneInGroup && 'rounded-tr-md',
            !isFirstInGroup &&
              !isLastInGroup &&
              !isAloneInGroup &&
              'rounded-r-md',
          )}
        >
          {message.content}
        </div>
      )}
    </div>
  );
}
