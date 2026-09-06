import { motion } from 'framer-motion';
import React from 'react';
import type { WidgetSidebarSideResolvedU } from '@opencx/widget-core';
import { cn } from '../components/lib/utils/cn';
import { dc } from '../utils/data-component';
import { useTranslation } from '../hooks/useTranslation';
import { EASE_OUT, MORPH_SPRING } from '../motion';
import { SidePanelGlyph } from './layout-glyphs';

/**
 * The flyout itself. Positioned off the sidebar tile when there is a tile row
 * to hang from; otherwise it IS the menu and sits inline.
 *
 * The gap between tile and card is padding on the WRAPPER, not a margin —
 * padding keeps the gap inside the flyout's own hit area, so the pointer
 * crossing it never leaves the menu and never closes what it is reaching for.
 * It has to clear the parent menu's own bottom edge first (6px padding + 1px
 * border) before any of it reads as separation, hence 12px rather than the 4px
 * that looked right on paper and overlapped the card in practice.
 */
export function SidebarSubmenu({
  anchored,
  side,
  onSelectSide,
  docked,
  onToggleDock,
}: {
  anchored: boolean;
  side: WidgetSidebarSideResolvedU;
  onSelectSide: (side: WidgetSidebarSideResolvedU) => void;
  docked: boolean;
  onToggleDock: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      {...dc('companion/layout_picker/sidebar_options')}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
      // Centered on the tile it belongs to, so it reads as hanging from that
      // tile rather than drifting off one of its corners. The -50% shift goes
      // through motion's `x` rather than a `-translate-x-1/2` class: motion
      // writes the whole `transform` for the scale animation, so a Tailwind
      // translate would be overwritten the moment it animates. `left: 50%`
      // centers symmetrically, which also holds under RTL.
      style={anchored ? { left: '50%', x: '-50%' } : undefined}
      className={cn('origin-top', anchored && 'absolute top-full z-10 pt-3')}
    >
      <div
        className={cn(
          'flex flex-col gap-1.5 whitespace-nowrap',
          anchored &&
            'rounded-[var(--pk-r)] border bg-background p-[var(--pk-p)] shadow-lg',
        )}
      >
        <SubmenuRow label={t('companion_sidebar_dock_label')}>
          <DockSwitch
            label={t('companion_sidebar_dock_label')}
            checked={docked}
            onToggle={onToggleDock}
          />
        </SubmenuRow>
        <SubmenuRow label={t('companion_sidebar_side_label')}>
          <SideSegmented
            label={t('companion_sidebar_side_label')}
            side={side}
            onSelect={onSelectSide}
          />
        </SubmenuRow>
      </div>
    </motion.div>
  );
}

/** Name on the left, control on the right — the switch-row idiom. */
function SubmenuRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 ps-1.5">
      <span
        aria-hidden
        className="text-[11px] font-medium leading-none text-secondary-foreground/70"
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * A real on/off switch: dock is genuinely boolean, so the name stays fixed and
 * the thumb carries the state. The thumb rides MORPH_SPRING — the widget's one
 * morph signature, near-critically damped so it never overshoots its track.
 */
function DockSwitch({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      {...dc('companion/layout_picker/sidebar_option')}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        'relative flex h-4 w-7 shrink-0 items-center rounded-full px-0.5',
        'transition-colors duration-150',
        'active:scale-[0.97]',
        checked ? 'bg-primary' : 'bg-secondary-foreground/20',
      )}
    >
      <motion.span
        aria-hidden
        initial={false}
        animate={{ x: checked ? 12 : 0 }}
        transition={MORPH_SPRING}
        className="size-3 rounded-full bg-background shadow-sm"
      />
    </button>
  );
}

/**
 * Two mutually exclusive edges, so radio semantics rather than a switch. The
 * highlight is a single shared element (`layoutId`) so it SLIDES between the
 * options instead of blinking off one and on the other.
 */
function SideSegmented({
  label,
  side,
  onSelect,
}: {
  label: string;
  side: WidgetSidebarSideResolvedU;
  onSelect: (side: WidgetSidebarSideResolvedU) => void;
}) {
  const { t } = useTranslation();
  const sides = [
    { value: 'left', labelKey: 'companion_sidebar_left' },
    { value: 'right', labelKey: 'companion_sidebar_right' },
  ] as const;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex items-center gap-0.5 rounded-full bg-secondary-foreground/10 p-0.5"
    >
      {sides.map(({ value, labelKey }) => {
        const selected = value === side;
        return (
          <button
            // `key` must precede the spread: after it, the JSX transform folds
            // it into the props object and React stops seeing it as a key.
            key={value}
            {...dc('companion/layout_picker/sidebar_option')}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(labelKey)}
            onClick={() => onSelect(value)}
            className={cn(
              'relative flex items-center justify-center rounded-full p-1',
              'transition-colors duration-150',
              'active:scale-[0.97]',
              selected ? 'text-primary' : 'text-secondary-foreground/60',
            )}
          >
            {selected && (
              <motion.span
                aria-hidden
                layoutId="opencx-sidebar-side-indicator"
                transition={MORPH_SPRING}
                className="absolute inset-0 rounded-full bg-background shadow-sm"
              />
            )}
            <span className="relative">
              <SidePanelGlyph side={value} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
