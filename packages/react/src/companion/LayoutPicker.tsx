import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence } from 'framer-motion';
import React, { useState } from 'react';
import { useWidgetLayout } from '@opencx/widget-react-headless';
import type {
  TranslationKeyU,
  WidgetCompanionLayoutU,
} from '@opencx/widget-core';
import { cn } from '../components/lib/utils/cn';
import { Tooltippy } from '../components/lib/tooltip';
import { dc } from '../utils/data-component';
import { formatBinding, WIDGET_KEYBINDINGS } from '../utils/keybindings';
import { useTranslation } from '../hooks/useTranslation';
import { FrameIconButton } from './FrameIconButton';
import { useCanHover } from '../hooks/useCanHover';
import { LayoutGlyph } from './layout-glyphs';
import { SidebarSubmenu } from './SidebarSubmenu';

/**
 * One control for all three arrangements — a macOS-style layout menu. A single
 * trigger (showing the CURRENT layout as a mini window diagram) opens a popover
 * of tiles, current one highlighted; picking one calls `onSelect`. Close stays
 * a SEPARATE control (rendered by the caller), exactly like macOS keeps the
 * red traffic light apart from the green tiling menu.
 *
 * Hovering the SIDEBAR tile opens a SUBMENU — a small flyout hanging off that
 * tile with the layout's two sub-choices: Dock (push the page aside vs. lie
 * over it) and Side (which edge). It only opens while the sidebar is the
 * ACTIVE layout, so the controls are never offered against a sidebar that
 * isn't on screen.
 *
 * Why a submenu and not another row in this menu: the tiles are nouns naming a
 * destination — click Fullscreen and you go to fullscreen. Dock and Side are
 * switches. Rendered in the same grid they inherit the wrong grammar ("Dock"
 * reads as a place to go), and naming their state instead would put a second,
 * unrelated "Floating" directly under the Floating tile. A separate surface
 * lets switch controls read as switches, so the names stay fixed and the state
 * rides the control.
 *
 * The popover renders WITHOUT a Radix Portal: companion chrome lives inside the
 * content iframe, and a portal would escape to the host document. Inline
 * content keeps the menu in the iframe where it belongs.
 */

const LAYOUT_LABELS: Record<WidgetCompanionLayoutU, TranslationKeyU> = {
  compact: 'companion_layout_floating',
  sidebar: 'companion_layout_sidebar',
  fullscreen: 'companion_layout_fullscreen',
};

/**
 * True only when focus arrived from the keyboard. Clicking a button focuses it
 * as well, and treating that as hover left the submenu open with the pointer
 * nowhere near it. jsdom's selector engine has no `:focus-visible`, so a throw
 * there degrades to "treat it as keyboard" rather than breaking the reveal.
 */
function isKeyboardFocus(element: Element): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return true;
  }
}

export function LayoutPicker({
  current,
  onSelect,
}: {
  current: WidgetCompanionLayoutU;
  onSelect: (layout: WidgetCompanionLayoutU) => void;
}) {
  const { t } = useTranslation();
  const {
    allowedLayouts,
    sidebarSide,
    setSidebarSide,
    sidebarMode,
    setSidebarMode,
  } = useWidgetLayout();
  const [sidebarTileHovered, setSidebarTileHovered] = useState(false);
  // Tap fires pointerenter on touch, so a hover-opened submenu would open on
  // the very tap that closes the menu.
  const canHover = useCanHover();

  const options = allowedLayouts.map((layout) => ({
    layout,
    label: LAYOUT_LABELS[layout],
  }));

  // Fewer than two layouts means there is nothing to switch BETWEEN, so the
  // tile row goes away — but a locked-to-sidebar companion still has a dock
  // and a side worth offering, so the control itself survives on that alone.
  const showLayoutTiles = options.length >= 2;
  const sidebarAvailable = allowedLayouts.includes('sidebar');
  if (!showLayoutTiles && !sidebarAvailable) return null;

  // Hover on the sidebar tile is the ONLY thing that opens the submenu, from
  // any layout. It is not gated on the sidebar being active: a control that
  // only appears once you are already there can't be discovered. What keeps
  // that honest is that the controls activate the sidebar themselves (see
  // `applyFromAnyLayout`), so a click from the floating panel is never a
  // change the visitor can't see.
  const sidebarOptionsShown =
    sidebarAvailable &&
    (!showLayoutTiles
      ? // No tile row means no tile to hover, and the submenu is then the only
        // thing the menu has to say.
        true
      : canHover
        ? sidebarTileHovered
        : // Touch has no hover, and a tap would close the menu. Fall back to
          // the layout the visitor is in so the controls stay reachable.
          current === 'sidebar');

  // From another layout a dock/side pick is also a layout decision: apply it
  // AND go there, so the visitor lands in exactly what they chose rather than
  // setting an invisible preference. Adjusting from inside the sidebar leaves
  // the menu open — that is a tweak, not a decision.
  const applyFromAnyLayout = (apply: () => void) => {
    apply();
    if (current !== 'sidebar') onSelect('sidebar');
  };

  const submenu = (
    <AnimatePresence initial={false}>
      {sidebarOptionsShown && (
        <SidebarSubmenu
          anchored={showLayoutTiles}
          side={sidebarSide}
          onSelectSide={(next) =>
            applyFromAnyLayout(() => setSidebarSide(next))
          }
          docked={sidebarMode === 'docked'}
          onToggleDock={() =>
            applyFromAnyLayout(() =>
              setSidebarMode(sidebarMode === 'docked' ? 'floating' : 'docked'),
            )
          }
        />
      )}
    </AnimatePresence>
  );

  return (
    <PopoverPrimitive.Root onOpenChange={() => setSidebarTileHovered(false)}>
      <Tooltippy content={t('companion_layout_label')} side="bottom">
        <PopoverPrimitive.Trigger asChild>
          <FrameIconButton
            {...dc('companion/layout_picker/trigger')}
            label={t('companion_layout_label')}
            className="size-7"
          >
            <LayoutGlyph layout={current} sidebarSide={sidebarSide} />
          </FrameIconButton>
        </PopoverPrimitive.Trigger>
      </Tooltippy>
      <PopoverPrimitive.Content
        {...dc('companion/layout_picker/menu')}
        data-opencx-escape-scope=""
        side="bottom"
        align="end"
        sideOffset={6}
        collisionPadding={8}
        // Leaving the MENU (not the tile) is what closes the submenu. The
        // flyout is a DOM descendant of this element even though it paints
        // outside it, so travelling onto it never counts as leaving.
        onPointerLeave={() => setSidebarTileHovered(false)}
        // Concentric radii, enforced by calc so the math can't drift:
        // tile radius = popover radius − padding (16 − 6 = 10).
        style={{ '--pk-r': '16px', '--pk-p': '6px' } as React.CSSProperties}
        className={cn(
          'z-50 flex flex-col rounded-[var(--pk-r)] border bg-background p-[var(--pk-p)] shadow-lg',
          'origin-[var(--radix-popover-content-transform-origin)]',
          'animate-in fade-in-0 zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        )}
      >
        {showLayoutTiles ? (
          <div className="flex items-stretch gap-0.5">
            {options.map(({ layout, label: labelKey }) => {
              const selected = layout === current;
              const label = t(labelKey);
              const isSidebar = layout === 'sidebar';
              const tile = (
                <PopoverPrimitive.Close asChild>
                  <button
                    {...dc('companion/layout_picker/option')}
                    type="button"
                    aria-label={label}
                    aria-pressed={selected}
                    aria-expanded={isSidebar ? sidebarOptionsShown : undefined}
                    onClick={() => onSelect(layout)}
                    // Every tile reports, not just the sidebar one: without
                    // the others clearing it, hovering Sidebar once left the
                    // submenu open for as long as the pointer stayed anywhere
                    // in the menu.
                    onPointerEnter={() => setSidebarTileHovered(isSidebar)}
                    // Keyboard reaches the submenu the same way the pointer
                    // does — but only a KEYBOARD focus. A click focuses the
                    // tile too, and that must not count as hover.
                    onFocus={(event) =>
                      setSidebarTileHovered(
                        isSidebar && isKeyboardFocus(event.currentTarget),
                      )
                    }
                    className={cn(
                      'flex w-14 flex-col items-center gap-1 rounded-[calc(var(--pk-r)-var(--pk-p))] px-1.5 py-1.5',
                      'transition-colors duration-150',
                      selected
                        ? 'bg-primary/10 text-primary'
                        : 'text-secondary-foreground/60 hover:bg-muted hover:text-secondary-foreground',
                    )}
                  >
                    <LayoutGlyph layout={layout} sidebarSide={sidebarSide} />
                    <span className="whitespace-nowrap text-[10px] font-medium leading-none">
                      {label}
                    </span>
                  </button>
                </PopoverPrimitive.Close>
              );

              // The sidebar tile owns the submenu, so it gets the positioning
              // context the flyout hangs off.
              if (isSidebar) {
                return (
                  <div key={layout} className="relative flex">
                    {tile}
                    {submenu}
                  </div>
                );
              }
              // Fullscreen is the one tile with a keyboard shortcut — advertise
              // it (the tile's own label already names the action, so the hint
              // carries the label + key chip like every shortcut button).
              if (layout !== 'fullscreen')
                return <React.Fragment key={layout}>{tile}</React.Fragment>;
              return (
                <Tooltippy
                  key={layout}
                  content={label}
                  shortcut={formatBinding(
                    WIDGET_KEYBINDINGS['toggle-fullscreen'],
                  )}
                  side="bottom"
                >
                  {tile}
                </Tooltippy>
              );
            })}
          </div>
        ) : (
          submenu
        )}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Root>
  );
}
