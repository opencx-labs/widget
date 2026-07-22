import type { OpenCxComponentNameU } from '@opencx/widget-core';
import type { WidgetComponentProps } from '@opencx/widget-react-headless';
import React, { useMemo } from 'react';
import { SpecRenderer } from '../../json-render/index.js';
import { segmentContent } from '../../json-render/segment-content.js';
import { dc } from '../../utils/data-component.js';
import { AttachmentPreview } from '../AttachmentPreview.js';
import { cn } from '../lib/utils/cn.js';
import { RichText } from '../RichText.js';
import { MessageAfterComponent } from './MessageAfterComponent.js';

export function AgentMessageDefaultComponent(
  props: WidgetComponentProps & {
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
    isAloneInGroup: boolean;
    dataComponentNames?: {
      messageContainer?: OpenCxComponentNameU;
      message?: OpenCxComponentNameU;
    };
    classNames?: {
      messageContainer?: string;
      message?: string;
    };
  },
) {
  const {
    data,
    id,
    type,
    attachments,
    isFirstInGroup,
    isLastInGroup,
    isAloneInGroup,
    dataComponentNames,
    classNames,
  } = props;

  const message = type === 'AI' || type === 'AGENT' ? data.message : '';

  // Persisted AI rows keep the raw ` ```spec ` fence (the v5 stream transforms
  // it to `data-spec` parts on the SSE only — persist raw, transform on serve).
  // Segment the stored text so the fenced JSONL renders as UI here too, giving
  // streamed and reloaded transcripts the same look. AGENT (human) messages
  // never carry specs and skip the parse entirely.
  const segments = useMemo(
    () => (type === 'AI' ? segmentContent(message) : null),
    [type, message],
  );

  if (type !== 'AI' && type !== 'AGENT') return null;

  const { variant = 'default' } = data;

  const bubble = (text: string, key?: string, withAfter = true) => (
    <div key={key} className="flex flex-row gap-2">
      <div
        {...dc(dataComponentNames?.message ?? 'chat/agent_msg/msg')}
        // Expose these data attributes for external styling customization
        data-first={isFirstInGroup}
        data-last={isLastInGroup}
        data-alone={isAloneInGroup}
        data-variant={variant}
        className={cn(
          'transition-all',
          'w-fit py-3 px-4 rounded-3xl bg-secondary text-secondary-foreground',
          'leading-snug text-sm prose prose-sm prose-a:decoration-primary prose-a:underline',
          'break-words [word-break:break-word]', // `[word-break:break-word]` is deprecated but works in the browser, while `break-words` which is `[overflow-wrap: break-word]` does not work
          // No need to add "whitespace-pre-wrap" in the agent or bot message because it is markup and content appear on separate lines as expected
          // Adding "whitespace-pre-wrap" will result in unnecessarily huge line breaks

          variant === 'error' && 'bg-destructive/15 text-destructive',

          // We're using the booleans directly here, not the data attributes, to make any external styling more specific than this
          isFirstInGroup && !isAloneInGroup && 'rounded-bl-md',
          isLastInGroup && !isAloneInGroup && 'rounded-tl-md',
          !isFirstInGroup && !isLastInGroup && !isAloneInGroup && 'rounded-l-md',
          classNames?.message,
        )}
      >
        <RichText messageType={type} messageId={id}>
          {text}
        </RichText>
      </div>
      {withAfter && <MessageAfterComponent currentMessage={props} />}
    </div>
  );

  // Specs render OUTSIDE the bubble, full width — identical placement to the
  // live streamed turn. A settled row's dangling `ui_partial` (a turn that was
  // cut mid-fence) renders nothing rather than a permanent skeleton.
  const hasUiSegments = segments?.some((s) => s.type === 'ui') ?? false;
  const lastMarkdownIndex =
    segments?.reduce((last, s, i) => (s.type === 'markdown' ? i : last), -1) ?? -1;

  return (
    <div
      {...dc(dataComponentNames?.messageContainer ?? 'chat/agent_msg/root')}
      className={cn(
        'w-5/6 flex flex-col items-start gap-1',
        classNames?.messageContainer,
      )}
    >
      {attachments && attachments.length > 0 && (
        <div className="w-full gap-1 flex flex-row flex-wrap items-center justify-start">
          {attachments?.map((attachment) => (
            <AttachmentPreview attachment={attachment} key={attachment.id} />
          ))}
        </div>
      )}
      {hasUiSegments && segments
        ? segments.map((segment, i) => {
            if (segment.type === 'markdown') {
              // `message::after` (copy button etc.) attaches once, to the
              // final prose bubble — not to every segment.
              return bubble(segment.content, `md-${i}`, i === lastMarkdownIndex);
            }
            if (segment.type === 'ui') {
              return (
                <div key={`ui-${i}`} className="w-full">
                  <SpecRenderer spec={segment.spec} />
                </div>
              );
            }
            return null;
          })
        : message.length > 0 && bubble(message)}
    </div>
  );
}
