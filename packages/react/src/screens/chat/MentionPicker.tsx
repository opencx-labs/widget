import type { WidgetMention } from '@opencx/widget-core';
import React from 'react';
import { DynamicIcon } from '../../components/lib/DynamicIcon';
import { cn } from '../../components/lib/utils/cn';
import { useTranslation } from '../../hooks/useTranslation';
import { dc } from '../../utils/data-component';

/**
 * The @-mention picker, docked above the composer. Keyboard-driven from the
 * textarea (the hook handles ↑/↓/Enter/Tab/Escape there, so focus never
 * leaves the text); the mouse hovers to highlight and clicks to pick.
 */
export function MentionPicker({
  results,
  searching,
  highlighted,
  onHighlight,
  onPick,
}: {
  results: WidgetMention[];
  searching: boolean;
  highlighted: number;
  onHighlight: (index: number) => void;
  onPick: (item: WidgetMention) => void;
}) {
  const { t } = useTranslation();
  if (results.length === 0 && searching) return null;
  return (
    <div
      {...dc('chat/input_box/mention_picker')}
      role="listbox"
      className={cn(
        'absolute inset-x-2 bottom-full z-20 mb-1 max-h-64 overflow-auto',
        'rounded-xl border border-border bg-background p-1 shadow-lg',
      )}
    >
      {results.length === 0 ? (
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          {t('mentions_empty')}
        </div>
      ) : (
        results.map((item, index) => (
          <button
            {...dc('chat/input_box/mention_picker/option')}
            key={`${item.type}:${item.id}`}
            type="button"
            role="option"
            aria-selected={index === highlighted}
            // Keep the textarea focused: a mousedown on the option would
            // blur it and close the picker before the click lands.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onHighlight(index)}
            onClick={() => onPick(item)}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm',
              index === highlighted ? 'bg-muted' : 'hover:bg-muted/60',
            )}
          >
            <MentionIcon item={item} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-foreground">
                {item.title}
              </span>
              {item.description && (
                <span className="block truncate text-xs text-muted-foreground">
                  {item.description}
                </span>
              )}
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/70">
              {item.type}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

/** A mention's icon: the host's URL, else a built-in name, else the @ glyph. */
export function MentionIcon({
  item,
  className,
}: {
  item: WidgetMention;
  className?: string;
}) {
  if (item.icon) {
    return (
      <img
        src={item.icon}
        alt=""
        className={cn('size-4 shrink-0 rounded-sm object-contain', className)}
      />
    );
  }
  return (
    <DynamicIcon
      name={item.iconName ?? 'AtSign'}
      className={cn('size-3.5 shrink-0 text-primary', className)}
    />
  );
}
