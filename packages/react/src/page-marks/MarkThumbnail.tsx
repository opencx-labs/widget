import React from 'react';
import { cn } from '../components/lib/utils/cn';

/**
 * The region's actual pixels with the visitor's note captioned over them —
 * the one presentation a page mark has. Two shapes: a `tile` is the same
 * 48px square a file preview gets, for the composer's attachments row; a
 * `strip` keeps the region's own proportions, for the sent bubble where
 * there is room to read it. Children (the pill's remove button) overlay the
 * picture.
 */
export function MarkThumbnail({
  src,
  alt,
  title,
  note,
  shape = 'strip',
  className,
  children,
  ...rest
}: {
  src: string;
  alt: string;
  title: string;
  note?: string | undefined;
  shape?: 'tile' | 'strip';
  className?: string;
  children?: React.ReactNode;
} & Record<`data-${string}`, string>) {
  const tile = shape === 'tile';
  return (
    <div
      {...rest}
      className={cn(
        'relative overflow-hidden bg-background ring-1 ring-border',
        tile ? 'size-12 shrink-0 rounded-2xl' : 'max-w-full rounded-xl',
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        title={title}
        draggable={false}
        className={cn(
          'block object-cover object-left-top',
          tile ? 'size-full' : 'h-10 w-auto max-w-40',
        )}
      />
      {note && (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 truncate px-1.5 py-0.5',
            'bg-gradient-to-t from-foreground/70 to-foreground/0',
            'text-[10px] font-medium leading-tight text-background',
          )}
        >
          {note}
        </div>
      )}
      {children}
    </div>
  );
}
