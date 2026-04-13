import type { MessageAttachmentType } from '@opencx/widget-core';
import { FileText } from 'lucide-react';
import React from 'react';
import { cn } from './lib/utils/cn';
import { Wobble } from './lib/wobble';
import { Dialoger, DialogerContent } from './Dialoger';
import { ZoomableImage } from './ZoomableImage';

type Props = {
  attachment: MessageAttachmentType;
};

export function AttachmentPreview({ attachment }: Props) {
  const { name, size, type, url } = attachment;

  const isImage = type.startsWith('image/');
  const isVideo = type.startsWith('video/');
  const isAudio = type.startsWith('audio/');
  const isPdf = type === 'application/pdf';

  if (isAudio) {
    return (
      <Wobble>
        <div className="w-full shrink-0 overflow-hidden">
          <audio controls className="w-full">
            <source src={url} type={type} />
            Your browser does not support the audio tag.
          </audio>
        </div>
      </Wobble>
    );
  }

  if (isVideo) {
    return (
      <Wobble>
        <div className="w-full border shrink-0 rounded-2xl overflow-hidden">
          <video controls>
            <source src={url} type={type} />
            Your browser does not support the video tag.
          </video>
        </div>
      </Wobble>
    );
  }

  if (isImage) {
    return (
      <Dialoger
        trigger={
          <div>
            <Wobble>
              <div className="size-fit border shrink-0 rounded-2xl overflow-hidden">
                <img src={url} className="object-cover size-16" alt={name} />
              </div>
            </Wobble>
          </div>
        }
      >
        <DialogerContent
          className="size-full max-w-full rounded-3xl flex items-center justify-center bg-transparent border-none gap-0"
          withClose
        >
          <ZoomableImage src={url} alt={name} />
        </DialogerContent>
      </Dialoger>
    );
  }

  if (isPdf) {
    return (
      <Wobble>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'block size-fit max-w-[min(100%,16rem)] shrink-0 rounded-2xl border',
            'bg-background/80 transition-colors hover:bg-accent/60',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
        >
          <div className="flex items-center gap-3 p-3 min-w-0">
            <div
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl',
                'bg-secondary text-muted-foreground',
              )}
              aria-hidden
            >
              <FileText className="size-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1 flex flex-col gap-0.5 text-left">
              <span
                className={cn(
                  'text-xs font-medium text-foreground line-clamp-1',
                  'break-words [word-break:break-word]', // `[word-break:break-word]` is deprecated but works in the browser, while `break-words` which is `[overflow-wrap: break-word]` does not work
                )}
              >
                {name}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {(size / 1024).toFixed(2)} KB · PDF
              </span>
            </div>
          </div>
        </a>
      </Wobble>
    );
  }

  return (
    <Wobble>
      <div className="size-fit border shrink-0 rounded-2xl overflow-hidden">
        <div className="flex items-end gap-2 p-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'text-xs text-blue-500 line-clamp-2 underline hover:text-blue-600',
              'break-words [word-break:break-word]', // `[word-break:break-word]` is deprecated but works in the browser, while `break-words` which is `[overflow-wrap: break-word]` does not work
            )}
          >
            {name}
          </a>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {(size / 1024).toFixed(2)} KB
          </span>
        </div>
      </div>
    </Wobble>
  );
}
