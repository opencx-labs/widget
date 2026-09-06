import { PenLineIcon, XIcon } from 'lucide-react';
import React from 'react';
import { cn } from '../components/lib/utils/cn';
import { useTranslation } from '../hooks/useTranslation';
import { dc } from '../utils/data-component';
import type { PageMark } from './page-mark';
import { MarkThumbnail } from './MarkThumbnail';
import { useMarkThumbnail } from './useMarkThumbnail';

/**
 * One page mark previewed in the composer's attachment row — the same square
 * tile a file gets, because a mark IS a picture the message carries. Shows
 * the region's actual pixels (the focus element's snapshot, rasterized at
 * commit) the moment it lands, with the visitor's note captioned over them;
 * until then — and whenever a snapshot isn't possible — the pen glyph stands
 * in, with the label captioned the same way so the tile still says what it
 * is. Removing it un-draws the mark from the host page.
 */
export function PageMarkPill({
  mark,
  onRemove,
}: {
  mark: PageMark;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const thumb = useMarkThumbnail(mark);

  const label = mark.note ?? mark.elements[0]?.name ?? t('page_mark_region');
  const removeLabel = t('page_mark_remove', { label });
  const hoverTitle = mark.elements.map((el) => el.name).join(', ');

  if (thumb) {
    return (
      <MarkThumbnail
        {...dc('chat/input_box/page_mark_pill')}
        className="group"
        shape="tile"
        src={thumb}
        alt={label}
        title={hoverTitle}
        note={mark.note}
      >
        <button
          type="button"
          aria-label={removeLabel}
          className={cn(
            'absolute top-1 end-1 rounded-full p-0.5',
            'bg-foreground/60 text-background backdrop-blur-sm',
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            'transition-opacity active:scale-90',
          )}
          onClick={onRemove}
        >
          <XIcon className="size-3" />
        </button>
      </MarkThumbnail>
    );
  }

  // No picture (yet, or ever): the same tile with the pen glyph standing in
  // and the label captioned where the note would be, so the row keeps one
  // shape whatever a mark managed to capture.
  return (
    <div
      {...dc('chat/input_box/page_mark_pill')}
      title={hoverTitle}
      className={cn(
        'group relative size-12 shrink-0 overflow-hidden',
        'flex items-center justify-center',
        'rounded-2xl bg-background ring-1 ring-border',
      )}
    >
      <PenLineIcon className="size-4 shrink-0 text-primary" />
      <span
        className={cn(
          'absolute inset-x-0 bottom-0 truncate px-1.5 py-0.5',
          'bg-gradient-to-t from-foreground/70 to-foreground/0',
          'text-[10px] font-medium leading-tight text-background',
        )}
      >
        {label}
      </span>
      <button
        type="button"
        aria-label={removeLabel}
        className={cn(
          'absolute top-1 end-1 rounded-full p-0.5',
          'bg-foreground/60 text-background backdrop-blur-sm',
          'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          'transition-opacity active:scale-90',
        )}
        onClick={onRemove}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}
