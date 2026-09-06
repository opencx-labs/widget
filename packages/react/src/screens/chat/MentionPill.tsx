import type { WidgetMention } from '@opencx/widget-core';
import { XIcon } from 'lucide-react';
import React from 'react';
import { cn } from '../../components/lib/utils/cn';
import { useTranslation } from '../../hooks/useTranslation';
import { dc } from '../../utils/data-component';
import { MentionIcon } from './MentionPicker';

/**
 * A picked mention in the composer's attached-context tray. Flat like the
 * entity pill (the tray is the surface); removing it also deletes its
 * `@Title` from the text.
 */
export function MentionPill({
  item,
  onRemove,
}: {
  item: WidgetMention;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <span
      {...dc('chat/input_box/mention_pill')}
      className={cn(
        'inline-flex items-center gap-1.5 max-w-full',
        'rounded-full py-0.5 pe-1 text-xs text-foreground',
      )}
      title={`${item.type}: ${item.title}`}
    >
      <MentionIcon item={item} />
      <span className="truncate max-w-48 font-medium">{item.title}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={t('mention_remove', { label: item.title })}
          className={cn(
            'rounded-full p-0.5 text-muted-foreground',
            'hover:bg-muted hover:text-foreground',
            'transition-transform active:scale-90',
          )}
          onClick={onRemove}
        >
          <XIcon className="size-3" />
        </button>
      )}
    </span>
  );
}
