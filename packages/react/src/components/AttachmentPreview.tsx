import type { MessageAttachmentType } from '@opencx/widget-core';
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
