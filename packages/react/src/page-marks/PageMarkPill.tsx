import { PenLineIcon, XIcon } from 'lucide-react';
import React from 'react';
import { cn } from '../components/lib/utils/cn';
import { useTranslation } from '../hooks/useTranslation';
import { dc } from '../utils/data-component';
import type { PageMark } from './page-mark';
import { MarkThumbnail } from './MarkThumbnail';
import { useMarkThumbnail } from './useMarkThumbnail';

/**
 * One page-mark pill in the composer. Shows the region's actual pixels
 * (the focus element's snapshot, rasterized at commit) the moment it lands,
 * with the visitor's note captioned over it; until then — and whenever a
 * snapshot isn't possible — it stays the compact text pill. Removing it
 * un-draws the mark from the host page.
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

  return (
    <div
      {...dc('chat/input_box/page_mark_pill')}
      className={cn(
        'flex items-center gap-1.5 max-w-full',
        'rounded-full py-1 ps-2 pe-1',
        'bg-background ring-1 ring-border',
        'text-xs text-foreground',
      )}
    >
      <PenLineIcon className="size-3 shrink-0 text-primary" />
      <span className="truncate max-w-36" title={hoverTitle}>
        {label}
      </span>
      <button
        type="button"
        aria-label={removeLabel}
        className={cn(
          'rounded-full p-0.5 text-muted-foreground',
          'hover:bg-muted hover:text-foreground',
          'transition-transform active:scale-90',
        )}
        onClick={onRemove}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}
