import type { MarkedElementRef } from '@opencx/widget-core';
import { PenLineIcon } from 'lucide-react';
import React from 'react';
import { cn } from '../components/lib/utils/cn';
import { MarkThumbnail } from './MarkThumbnail';
import { useMarkThumbnail } from './useMarkThumbnail';

/**
 * A page mark on the SENT user bubble — the composer pill's presentation
 * without its remove affordance: the region's actual pixels, the note
 * captioned over them, and the element name only as the fallback when no
 * snapshot exists. The message carries the mark object itself, so the
 * thumbnail taken in the composer survives the send instead of collapsing
 * back into a bare tag name; after a reload the uploaded snapshot's URL takes
 * its place.
 */
export function SentMarkChip({ element }: { element: MarkedElementRef }) {
  // The composer's in-memory capture while it exists, else the persisted
  // upload — a reload has only the latter.
  const thumb = useMarkThumbnail(element.mark) ?? element.snapshotUrl ?? null;
  const label = element.note ?? element.name;

  if (thumb) {
    return (
      <MarkThumbnail
        src={thumb}
        alt={label}
        title={element.name}
        note={element.note}
      />
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 max-w-48',
        'rounded-full py-1 ps-2 pe-2.5',
        'bg-background ring-1 ring-border',
        'text-xs text-foreground',
      )}
      title={element.name}
    >
      <PenLineIcon className="size-3 shrink-0 text-primary" />
      <span className="truncate">{label}</span>
    </span>
  );
}
