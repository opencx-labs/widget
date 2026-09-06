import React from 'react';
import { cn } from '../components/lib/utils/cn';

/**
 * The region's actual pixels with the visitor's note captioned over them —
 * the one presentation a page mark has, in the composer pill and on the sent
 * bubble alike. Children (the pill's remove button) overlay the picture.
 */
export function MarkThumbnail({
  src,
  alt,
  title,
  note,
  className,
  children,
  ...rest
}: {
  src: string;
  alt: string;
  title: string;
  note?: string | undefined;
  className?: string;
  children?: React.ReactNode;
} & Record<`data-${string}`, string>) {
  return (
    <div
      {...rest}
      className={cn(
        'relative max-w-full overflow-hidden',
        'rounded-xl bg-background ring-1 ring-border',
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        title={title}
        draggable={false}
        className="block h-10 w-auto max-w-40 object-cover object-left-top"
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
