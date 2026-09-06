import type { WidgetMention } from '@opencx/widget-core';
import React, { useLayoutEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { DynamicIcon } from '../../components/lib/DynamicIcon';
import { cn } from '../../components/lib/utils/cn';
import { useTranslation } from '../../hooks/useTranslation';
import { dc } from '../../utils/data-component';
import { caretPositionInTextarea } from './caret-position';
import type { MentionGroup } from './useMentions';

/** The menu's width; narrower when the composer is. */
const MENU_WIDTH = 300;
/** The detail card beside the menu, when the frame has room for it. */
const DETAIL_WIDTH = 260;
const GAP = 8;

/**
 * The @-mention menu, sitting right above the `@` it belongs to (its start
 * edge on the `@`, its bottom edge on that line): results grouped by type under a small header, one line
 * per item (icon + title), a "See N more" row where a group is cut, and —
 * when `mentions.preview` is on and the frame is wide enough — the
 * highlighted item's description in a card beside the menu. Keyboard-driven
 * from the textarea (the hook handles ↑/↓/Enter/Tab/Escape there, so focus
 * never leaves the text); the mouse hovers to highlight and clicks to pick.
 *
 * Portaled to the frame's themed root and positioned against the composer:
 * the composer sits inside a footer that clips its overflow, so a menu that
 * grew upward in place was cut off at the footer's top edge. The root (not
 * the body) is the host because it carries the palette variables the menu's
 * colors resolve from — outside it `bg-background` paints nothing. The
 * composer changes height as pills and files come and go, so the placement
 * follows the anchor's size, not just the result list.
 */
export function MentionPicker({
  anchorRef,
  inputRef,
  anchorIndex,
  preview,
  groups,
  visible,
  searching,
  highlighted,
  onHighlight,
  onPick,
  onExpand,
}: {
  /** The composer root the menu sits above. */
  anchorRef: RefObject<HTMLElement | null>;
  /** The textarea holding the `@`; the menu's start edge lines up with it. */
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Index of that `@` in the text. */
  anchorIndex: number | null;
  /** Show the highlighted item's description beside the menu. */
  preview: boolean;
  groups: MentionGroup[];
  /** The rows top to bottom; `highlighted` indexes into it. */
  visible: WidgetMention[];
  searching: boolean;
  highlighted: number;
  onHighlight: (index: number) => void;
  onPick: (item: WidgetMention) => void;
  onExpand: (type: string) => void;
}) {
  const { t } = useTranslation();
  const [placement, setPlacement] = useState<{
    left: number;
    width: number;
    top: number;
    detailBeside: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const view = anchor.ownerDocument.defaultView;
    // Anchored by its BOTTOM edge to the composer's top through a translate:
    // the frame document can be taller than the visible panel, so its inner
    // height is not a safe base for a `bottom` offset.
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const frameWidth = view?.innerWidth ?? rect.right;
      const width = Math.min(MENU_WIDTH, Math.max(0, frameWidth - 16));
      // Start under the `@` itself, pulled back only as far as the frame
      // edge demands.
      const input = inputRef.current;
      const at =
        input && anchorIndex !== null
          ? caretPositionInTextarea(input, anchorIndex)
          : null;
      const inputRect = input?.getBoundingClientRect();
      const wanted = at && inputRect ? inputRect.left + at.left : rect.left + 8;
      const left = Math.max(8, Math.min(wanted, frameWidth - 8 - width));
      // Its bottom edge hugs the line the `@` is on — not the composer card,
      // whose context tray would otherwise hold the menu a row too high.
      const top = at && inputRect ? inputRect.top + at.top - 4 : rect.top - 4;
      setPlacement({
        left,
        width,
        top,
        detailBeside:
          preview && left + width + GAP + DETAIL_WIDTH <= frameWidth - 8,
      });
    };
    place();
    view?.addEventListener('resize', place);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(anchor);
    return () => {
      view?.removeEventListener('resize', place);
      observer?.disconnect();
    };
  }, [anchorIndex, anchorRef, inputRef, preview, visible.length]);

  const host = anchorRef.current?.closest<HTMLElement>('[data-version]');
  if (!host || !placement) return null;
  if (visible.length === 0 && searching) return null;

  const current = visible[highlighted];
  const detail = current?.description ? current : null;
  let rowIndex = -1;

  return createPortal(
    <div
      {...dc('chat/input_box/mention_picker')}
      style={{
        position: 'fixed',
        left: placement.left,
        top: placement.top,
        transform: 'translateY(-100%)',
      }}
      className="z-50 flex items-end gap-2"
    >
      <div
        role="listbox"
        style={{ width: placement.width }}
        className={cn(
          'flex max-h-72 flex-col overflow-hidden',
          'rounded-xl border border-border bg-background shadow-lg',
        )}
      >
        <div className="min-h-0 flex-1 overflow-auto p-1">
          {visible.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {t('mentions_empty')}
            </div>
          ) : (
            groups.map((group) => (
              <div
                {...dc('chat/input_box/mention_picker/group')}
                key={group.type}
                role="group"
                aria-label={group.type}
              >
                <div className="px-2 pb-0.5 pt-1.5 text-xs capitalize text-muted-foreground">
                  {group.type}
                </div>
                {group.items.map((item) => {
                  const index = ++rowIndex;
                  return (
                    <button
                      {...dc('chat/input_box/mention_picker/option')}
                      key={`${item.type}:${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={index === highlighted}
                      // Keep the textarea focused: a mousedown on the row
                      // would blur it and close the menu before the click.
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => onHighlight(index)}
                      onClick={() => onPick(item)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm',
                        index === highlighted
                          ? 'bg-muted'
                          : 'hover:bg-muted/60',
                      )}
                    >
                      <MentionIcon item={item} />
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {item.title}
                      </span>
                    </button>
                  );
                })}
                {group.hidden > 0 && (
                  <button
                    {...dc('chat/input_box/mention_picker/more')}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onExpand(group.type)}
                    className={cn(
                      'w-full rounded-lg px-2 py-1 text-start text-xs',
                      'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    {t('json_see_more', { count: String(group.hidden) })}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      {detail && placement.detailBeside && (
        <MentionDetail
          item={detail}
          style={{ width: DETAIL_WIDTH }}
          className="rounded-xl border border-border bg-background shadow-lg"
        />
      )}
    </div>,
    host,
  );
}

/** The preview card: icon tile, type, title, description. */
function MentionDetail({
  item,
  className,
  style,
}: {
  item: WidgetMention;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      {...dc('chat/input_box/mention_picker/detail')}
      style={style}
      className={cn('flex gap-3 p-3', className)}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <MentionIcon item={item} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
          {item.type}
        </span>
        <span className="block truncate text-sm font-medium text-foreground">
          {item.title}
        </span>
        <span className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">
          {item.description}
        </span>
      </span>
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
