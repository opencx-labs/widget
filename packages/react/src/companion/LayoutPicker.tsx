import * as PopoverPrimitive from '@radix-ui/react-popover';
import React from 'react';
import { useConfig } from '@opencx/widget-react-headless';
import type { TranslationKeyU } from '@opencx/widget-core';
import { cn } from '../components/lib/utils/cn';
import { Tooltippy } from '../components/lib/tooltip';
import { dc } from '../utils/data-component';
import { useTranslation } from '../hooks/useTranslation';
import { FrameIconButton } from './FrameIconButton';
import type { PanelLayout } from './types';

/**
 * One control for all three arrangements — a macOS-style layout menu. A single
 * trigger (showing the CURRENT layout as a mini window diagram) opens a popover
 * of tiles, current one highlighted; picking one calls `onSelect`. This
 * replaces the old cluster of ambiguous toggle buttons ("Dock to side", "Full
 * screen", "Exit sidebar") that half-overlapped the Close button in meaning.
 * Close stays a SEPARATE control (rendered by the caller), exactly like macOS
 * keeps the red traffic light apart from the green tiling menu.
 *
 * The popover renders WITHOUT a Radix Portal: companion chrome lives inside the
 * content iframe, and a portal would escape to the host document. Inline
 * content keeps the menu in the iframe where it belongs.
 */

/** A tiny window diagram per layout, in the macOS tiling-menu idiom. */
function LayoutGlyph({ layout }: { layout: PanelLayout }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 18 18',
    fill: 'none',
    'aria-hidden': true,
  } as const;
  const frame = (
    <rect
      x={2}
      y={2.5}
      width={14}
      height={13}
      rx={2.5}
      stroke="currentColor"
      strokeWidth={1.4}
    />
  );
  if (layout === 'fullscreen') {
    // Framed like its siblings, with the content filling the window (an inset
    // fill) — not a solid black square, which read far heavier than the other
    // two tiles.
    return (
      <svg {...common}>
        {frame}
        <rect x={4.5} y={5} width={9} height={8} rx={1.4} fill="currentColor" />
      </svg>
    );
  }
  if (layout === 'sidebar') {
    // A docked panel on the inline-end third.
    return (
      <svg {...common}>
        {frame}
        <rect x={10.5} y={2.5} width={5.5} height={13} rx={2.5} fill="currentColor" />
      </svg>
    );
  }
  // compact — a small floating card near the bottom center.
  return (
    <svg {...common}>
      {frame}
      <rect x={5} y={9} width={8} height={4.5} rx={1.6} fill="currentColor" />
    </svg>
  );
}

// Single-word labels so every tile is exactly one line — two-line labels
// ("Floating panel") stretch their tile tall and pad the others out to match.
// The array's ORDER and identity are the source of truth for which tiles
// exist; each `label` is a translation key resolved at render via `t()`.
const LAYOUT_META: { layout: PanelLayout; label: TranslationKeyU }[] = [
  { layout: 'compact', label: 'companion_layout_floating' },
  { layout: 'sidebar', label: 'companion_layout_sidebar' },
  { layout: 'fullscreen', label: 'companion_layout_fullscreen' },
];

export function LayoutPicker({
  current,
  onSelect,
  className,
}: {
  current: PanelLayout;
  onSelect: (layout: PanelLayout) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const { companion } = useConfig();
  // Which arrangements to offer (order preserved), driven by config.
  const layouts = companion?.layouts ?? ['compact', 'sidebar', 'fullscreen'];
  const options = LAYOUT_META.filter((m) => layouts.includes(m.layout));

  // Fewer than two options means there's nothing to switch between — hide it.
  if (options.length < 2) return null;

  return (
    <PopoverPrimitive.Root>
      <Tooltippy content={t('companion_layout_label')} side="bottom">
        <PopoverPrimitive.Trigger asChild>
          <FrameIconButton
            {...dc('companion/layout_picker/trigger')}
            label={t('companion_layout_label')}
            title=""
            className={cn('size-7', className)}
          >
            <LayoutGlyph layout={current} />
          </FrameIconButton>
        </PopoverPrimitive.Trigger>
      </Tooltippy>
      <PopoverPrimitive.Content
        {...dc('companion/layout_picker/menu')}
        side="bottom"
        align="end"
        sideOffset={6}
        collisionPadding={8}
        // Concentric radii, enforced by calc so the math can't drift:
        // tile radius = popover radius − padding (16 − 6 = 10).
        style={{ '--pk-r': '16px', '--pk-p': '6px' } as React.CSSProperties}
        className={cn(
          'z-50 flex items-stretch gap-0.5 rounded-[var(--pk-r)] border bg-background p-[var(--pk-p)] shadow-lg',
          'origin-[var(--radix-popover-content-transform-origin)]',
          'animate-in fade-in-0 zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        )}
      >
        {options.map(({ layout, label: labelKey }) => {
          const selected = layout === current;
          const label = t(labelKey);
          return (
            <PopoverPrimitive.Close asChild key={layout}>
              <button
                {...dc('companion/layout_picker/option')}
                type="button"
                aria-label={label}
                aria-pressed={selected}
                onClick={() => onSelect(layout)}
                className={cn(
                  'flex w-14 flex-col items-center gap-1 rounded-[calc(var(--pk-r)-var(--pk-p))] px-1.5 py-1.5',
                  'transition-colors duration-150',
                  selected
                    ? 'bg-primary/10 text-primary'
                    : 'text-secondary-foreground/60 hover:bg-black/5 hover:text-secondary-foreground',
                )}
              >
                <LayoutGlyph layout={layout} />
                <span className="whitespace-nowrap text-[10px] font-medium leading-none">
                  {label}
                </span>
              </button>
            </PopoverPrimitive.Close>
          );
        })}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Root>
  );
}
