import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const layoutState = vi.hoisted(() => ({
  allowedLayouts: ['fullscreen', 'compact', 'sidebar'],
  sidebarSide: 'right' as 'left' | 'right',
  sidebarMode: 'floating' as 'docked' | 'floating',
  setSidebarSide: vi.fn(),
  setSidebarMode: vi.fn(),
}));

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({ disableTooltips: true, language: 'en' }),
  useDocumentDir: () => ({ dir: 'ltr' }),
  useWidgetLayout: () => layoutState,
}));

// The unit under test is option construction/order and the reveal rule, not
// Radix's disclosure behavior. Render its structural wrappers inline so the
// menu is inspectable.
vi.mock('@radix-ui/react-popover', async () => {
  const { Fragment, createElement } = await import('react');
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    createElement(Fragment, null, children);
  return {
    Root: Passthrough,
    Trigger: Passthrough,
    // Keep only what a real div understands — Radix's own positioning props
    // (side, align, sideOffset, collisionPadding) would warn if forwarded.
    Content: ({
      children,
      className,
      style,
      onPointerLeave,
      ...props
    }: {
      children?: React.ReactNode;
      className?: string;
      style?: React.CSSProperties;
      onPointerLeave?: React.PointerEventHandler;
      [key: string]: unknown;
    }) => {
      const dataProps = Object.fromEntries(
        Object.entries(props).filter(([key]) => key.startsWith('data-')),
      );
      return createElement(
        'div',
        { className, style, onPointerLeave, ...dataProps },
        children,
      );
    },
    Close: Passthrough,
  };
});

import { LayoutPicker } from '../LayoutPicker';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('LayoutPicker', () => {
  let container: HTMLDivElement;
  let root: Root;

  const tiles = () =>
    Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[data-component="companion/layout_picker/option"]',
      ),
    );
  const sidebarOptions = () =>
    Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[data-component="companion/layout_picker/sidebar_option"]',
      ),
    );
  const sidebarTile = () =>
    tiles().find((tile) => tile.getAttribute('aria-label') === 'Sidebar')!;

  // jsdom has no PointerEvent constructor. React derives onPointerEnter from
  // the native `pointerover`, and a MouseEvent carries everything its
  // enter/leave plugin reads (a null relatedTarget = entering from outside).
  // React derives onPointerEnter from the native pointerout/pointerover PAIR a
  // browser emits when the pointer crosses between elements — dispatching only
  // `pointerover` moves the pointer onto the first element and then never off
  // it again. jsdom has no PointerEvent constructor, but MouseEvent carries
  // everything the enter/leave plugin reads.
  const hoverTile = (label: string, from?: Element | null) =>
    act(() => {
      const tile = tiles().find(
        (candidate) => candidate.getAttribute('aria-label') === label,
      )!;
      from?.dispatchEvent(
        new MouseEvent('pointerout', { bubbles: true, relatedTarget: tile }),
      );
      tile.dispatchEvent(
        new MouseEvent('pointerover', {
          bubbles: true,
          relatedTarget: from ?? null,
        }),
      );
    });
  const hoverSidebarTile = () => hoverTile('Sidebar');

  // jsdom ships no matchMedia, and framer-motion's useReducedMotion needs a
  // real MediaQueryList (it calls addListener). `hover` drives the pointer
  // capability; reduced-motion always answers false.
  const setPointer = (hover: boolean) => {
    window.matchMedia = vi.fn((query: string) => ({
      matches: query.includes('hover') ? hover : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as never;
  };

  beforeEach(() => {
    layoutState.allowedLayouts = ['fullscreen', 'compact', 'sidebar'];
    layoutState.sidebarSide = 'right';
    layoutState.sidebarMode = 'floating';
    layoutState.setSidebarSide.mockClear();
    layoutState.setSidebarMode.mockClear();
    // Fine-pointer device: the hover reveal is the path under test.
    setPointer(true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders options in normalized configured order', () => {
    act(() =>
      root.render(<LayoutPicker current="fullscreen" onSelect={() => {}} />),
    );
    expect(tiles().map((tile) => tile.getAttribute('aria-label'))).toEqual([
      'Fullscreen',
      'Floating',
      'Sidebar',
    ]);
  });

  it('keeps dock + side hidden until the sidebar tile is hovered', () => {
    act(() =>
      root.render(<LayoutPicker current="sidebar" onSelect={() => {}} />),
    );
    expect(sidebarOptions()).toHaveLength(0);
    expect(sidebarTile().getAttribute('aria-expanded')).toBe('false');

    hoverSidebarTile();
    expect(
      sidebarOptions().map((option) => option.getAttribute('aria-label')),
    ).toEqual(['Dock', 'Left', 'Right']);
    expect(sidebarTile().getAttribute('aria-expanded')).toBe('true');
  });

  it.each(['compact', 'fullscreen'] as const)(
    'opens on hover from the %s layout too, so it can be discovered',
    (layout) => {
      act(() =>
        root.render(<LayoutPicker current={layout} onSelect={() => {}} />),
      );
      hoverSidebarTile();
      expect(sidebarOptions()).toHaveLength(3);
    },
  );

  it('retracts when the pointer moves to another tile', () => {
    act(() =>
      root.render(<LayoutPicker current="sidebar" onSelect={() => {}} />),
    );
    hoverSidebarTile();
    expect(sidebarTile().getAttribute('aria-expanded')).toBe('true');

    hoverTile('Floating', sidebarTile());
    // aria-expanded, not element count: the submenu leaves through
    // AnimatePresence and stays mounted for its exit animation, so presence
    // lags the state. This attribute IS the open/closed contract.
    expect(sidebarTile().getAttribute('aria-expanded')).toBe('false');
  });

  it('does not open when a CLICK focuses the sidebar tile', () => {
    // Only keyboard focus counts as hover; a click focuses the tile too, and
    // that left the submenu open with the pointer nowhere near it.
    const focusVisible = vi
      .spyOn(Element.prototype, 'matches')
      .mockReturnValue(false);
    act(() =>
      root.render(<LayoutPicker current="sidebar" onSelect={() => {}} />),
    );
    act(() => sidebarTile().focus());
    expect(sidebarOptions()).toHaveLength(0);
    focusVisible.mockRestore();
  });

  it('applies the pick AND switches to the sidebar when used elsewhere', () => {
    const onSelect = vi.fn();
    act(() =>
      root.render(<LayoutPicker current="compact" onSelect={onSelect} />),
    );
    hoverSidebarTile();

    const dock = sidebarOptions()[0]!;
    act(() => dock.click());
    expect(layoutState.setSidebarMode).toHaveBeenCalledWith('docked');
    // No invisible state changes: the pick takes you to where it applies.
    expect(onSelect).toHaveBeenCalledWith('sidebar');
  });

  it('leaves the layout alone when adjusting from inside the sidebar', () => {
    const onSelect = vi.fn();
    act(() =>
      root.render(<LayoutPicker current="sidebar" onSelect={onSelect} />),
    );
    hoverSidebarTile();

    act(() => sidebarOptions()[0]!.click());
    expect(layoutState.setSidebarMode).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('reveals on focus too, so the keyboard can reach dock + side', () => {
    act(() =>
      root.render(<LayoutPicker current="sidebar" onSelect={() => {}} />),
    );
    expect(sidebarOptions()).toHaveLength(0);

    act(() => sidebarTile().focus());
    expect(sidebarOptions()).toHaveLength(3);
  });

  it('uses switch semantics for dock and radio semantics for side', () => {
    layoutState.sidebarMode = 'docked';
    layoutState.sidebarSide = 'left';
    act(() =>
      root.render(<LayoutPicker current="sidebar" onSelect={() => {}} />),
    );
    hoverSidebarTile();

    const [dock, left, right] = sidebarOptions();
    if (!dock || !left || !right) throw new Error('expected three controls');

    // Dock is genuinely on/off; the name never changes, the state rides
    // aria-checked.
    expect(dock.getAttribute('role')).toBe('switch');
    expect(dock.getAttribute('aria-checked')).toBe('true');
    // Side is two mutually exclusive edges, so radios in a radiogroup.
    expect(left.getAttribute('role')).toBe('radio');
    expect(left.getAttribute('aria-checked')).toBe('true');
    expect(right.getAttribute('aria-checked')).toBe('false');
    expect(
      container
        .querySelector('[role="radiogroup"]')
        ?.getAttribute('aria-label'),
    ).toBe('Side');

    act(() => dock.click());
    expect(layoutState.setSidebarMode).toHaveBeenCalledWith('floating');
    act(() => right.click());
    expect(layoutState.setSidebarSide).toHaveBeenCalledWith('right');
  });

  it('hangs the submenu off the sidebar tile, not across the menu', () => {
    act(() =>
      root.render(<LayoutPicker current="sidebar" onSelect={() => {}} />),
    );
    hoverSidebarTile();

    const flyout = container.querySelector<HTMLElement>(
      '[data-component="companion/layout_picker/sidebar_options"]',
    );
    // Absolutely positioned against the sidebar tile's own relative parent —
    // that is what keeps it a flyout instead of a full-width row.
    expect(flyout?.className).toContain('absolute');
    expect(sidebarTile().parentElement?.className).toContain('relative');
    expect(sidebarTile().parentElement?.contains(flyout!)).toBe(true);
  });

  it('shows dock + side without hover on touch, where hover does not exist', () => {
    setPointer(false);

    act(() =>
      root.render(<LayoutPicker current="compact" onSelect={() => {}} />),
    );
    expect(sidebarOptions()).toHaveLength(0);

    // A tap would close the menu, so the sidebar layout alone reveals them.
    act(() =>
      root.render(<LayoutPicker current="sidebar" onSelect={() => {}} />),
    );
    expect(sidebarOptions()).toHaveLength(3);
  });

  it('inlines the controls when the sidebar is the only layout', () => {
    layoutState.allowedLayouts = ['sidebar'];
    act(() =>
      root.render(<LayoutPicker current="sidebar" onSelect={() => {}} />),
    );
    // No tile row means no tile to hang off — the controls ARE the menu, so
    // they sit inline without the flyout's own card.
    expect(tiles()).toHaveLength(0);
    expect(sidebarOptions()).toHaveLength(3);
    expect(
      container.querySelector<HTMLElement>(
        '[data-component="companion/layout_picker/sidebar_options"]',
      )?.className,
    ).not.toContain('absolute');
  });

  it('hides dock + side for an embed with no sidebar layout at all', () => {
    layoutState.allowedLayouts = ['compact', 'fullscreen'];
    act(() =>
      root.render(<LayoutPicker current="compact" onSelect={() => {}} />),
    );
    expect(sidebarOptions()).toHaveLength(0);
  });
});
