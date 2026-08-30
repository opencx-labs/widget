import type { WidgetCompanionLayoutU } from '@opencx/widget-core';

/** Even margin on all four sides for the fullscreen modal window. */
export const FULLSCREEN_MARGIN = 16;
/** Margin around the docked sidebar (top/bottom + the inline-end edge). */
export const SIDEBAR_MARGIN = 16;

/** The resting disc size. The collapsed round pill's box (WidgetCompanion)
 * and the icon disc inside it (RestingPill) share this constant, so the disc
 * fills the pill exactly — that equality is what lets the pill grow into the
 * dock bar without the icon resizing. 32 in the 44 dock leaves ~6px of
 * breathing room around the disc. */
export const PILL_SIZE = 32;
export const DOCK_HEIGHT = 44;
/** Dock bar width until the label content has been measured. */
export const DOCK_FALLBACK_WIDTH = 240;
export const PANEL_MAX_WIDTH = 440;
export const PANEL_HORIZONTAL_MARGIN = 32;
/** Narrowest the compact card may go on tiny viewports. */
export const COMPACT_MIN_WIDTH = 280;
export const CHAT_MIN_HEIGHT = 420;
export const CHAT_MAX_HEIGHT = 640;
export const TOP_MARGIN = 48;
/** Minimum gap between the shell and the viewport edge (drag bounds). */
export const VIEWPORT_EDGE_PADDING = 12;

// Sidebar layout: a docked, drag-resizable panel at the inline-end edge that
// pushes the host page aside (app-frame). These are the drag-resize width
// bounds; the margins + rects are computed by the pure functions below.
export const DEFAULT_SIDEBAR_WIDTH = 400;
export const MIN_SIDEBAR_WIDTH = 320;
export const MAX_SIDEBAR_WIDTH = 560;
/** Default canvas color revealed behind the framed host page. */
export const SIDEBAR_CANVAS = '#f4f4f5';

/** Below this viewport width the sidebar goes full-bleed: the app-frame stops
 * insetting the host page (app-frame.ts media query) and the panel takes the
 * full available width instead of floating at its configured width. */
export const SIDEBAR_FULL_BLEED_MAX_WIDTH = 760;

/** Corner radius per shell state/layout — the single source for every radius
 * the companion draws, including the app-frame's framed-page corners and the
 * quick-ask card inside the iframe (via a CSS custom property). */
export const RADII = {
  pill: 999,
  input: 16,
  fullscreen: 16,
  sidebar: 20,
  compact: 20,
} as const;

/** The browser viewport — the companion always scopes to it. */
export type Region = {
  width: number;
  height: number;
};
type ShellDims = { width: number; height: number; borderRadius: number };
export type CompactGeometryOptions = {
  maxWidth?: number;
  minWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  viewportHeightRatio?: number;
  borderRadius?: number;
};
/** The container anchor: the shell is translateX(-50%)-centered on `centerX`
 * and offset from the viewport bottom by `bottom`. Both animate with the morph
 * spring so a layout switch expands FROM the current rect in place. */
type ShellAnchor = { centerX: number; bottom: number };

/** Sidebar clamped so it never exceeds the viewport minus its side margins.
 * Below the full-bleed breakpoint the configured width is ignored entirely
 * and the panel takes the full available width, matching the app-frame's
 * own full-bleed media query. */
export function effectiveSidebarWidth(
  region: Region,
  sidebarWidth: number,
): number {
  const maxWidth = Math.max(0, region.width - SIDEBAR_MARGIN * 2);
  if (region.width <= SIDEBAR_FULL_BLEED_MAX_WIDTH) return maxWidth;
  return Math.max(0, Math.min(sidebarWidth, maxWidth));
}

/** Compact card width: capped at PANEL_MAX_WIDTH, shrinking with a side
 * margin on narrow viewports. COMPACT_MIN_WIDTH is preferred, but the
 * viewport always wins when it is narrower than that floor. */
function finiteAtLeast(value: number | undefined, fallback: number, min = 0) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, value)
    : fallback;
}

export function compactWidth(
  region: Region,
  options: CompactGeometryOptions = {},
): number {
  const viewportWidth = Math.max(0, region.width);
  const maxWidth = finiteAtLeast(options.maxWidth, PANEL_MAX_WIDTH);
  const minWidth = Math.min(
    maxWidth,
    finiteAtLeast(options.minWidth, COMPACT_MIN_WIDTH),
  );
  return Math.min(
    viewportWidth,
    maxWidth,
    Math.max(minWidth, viewportWidth - PANEL_HORIZONTAL_MARGIN),
  );
}

/** Compact panel height: 65% of the viewport, clamped to the chat bounds
 * and to what fits between the bottom offset and the top margin. */
export function chatHeight(
  region: Region,
  bottomOffset: number,
  options: CompactGeometryOptions = {},
): number {
  const viewportHeight = Math.max(0, region.height);
  const minHeight = finiteAtLeast(options.minHeight, CHAT_MIN_HEIGHT);
  const maxHeight = finiteAtLeast(
    options.maxHeight,
    CHAT_MAX_HEIGHT,
    minHeight,
  );
  const viewportHeightRatio = Math.min(
    1,
    finiteAtLeast(options.viewportHeightRatio, 0.65),
  );
  const availableHeight = Math.max(
    0,
    viewportHeight - Math.max(0, bottomOffset) - TOP_MARGIN,
  );
  return Math.min(
    maxHeight,
    availableHeight,
    Math.max(minHeight, viewportHeight * viewportHeightRatio),
  );
}

/** The open chat panel's box per layout. */
export function chatDims(opts: {
  layout: WidgetCompanionLayoutU;
  region: Region;
  sidebarWidth: number;
  bottomOffset: number;
  compact?: CompactGeometryOptions;
}): ShellDims {
  const { layout, region, sidebarWidth, bottomOffset, compact } = opts;
  if (layout === 'fullscreen') {
    return {
      width: Math.max(0, region.width - FULLSCREEN_MARGIN * 2),
      height: Math.max(0, region.height - FULLSCREEN_MARGIN * 2),
      borderRadius: RADII.fullscreen,
    };
  }
  if (layout === 'sidebar') {
    return {
      width: effectiveSidebarWidth(region, sidebarWidth),
      height: Math.max(0, region.height - SIDEBAR_MARGIN * 2),
      borderRadius: RADII.sidebar,
    };
  }
  return {
    width: compactWidth(region, compact),
    height: chatHeight(region, bottomOffset, compact),
    borderRadius: finiteAtLeast(compact?.borderRadius, RADII.compact),
  };
}

/**
 * The container anchor (center-x + bottom). The fullscreen/sidebar anchoring
 * applies ONLY when the chat panel is actually open (`isChatOpen`): the
 * resting pill and the quick-ask bar always sit bottom-center, so a sidebar
 * (or fullscreen) layout does NOT drag the pill to the edge. When open,
 * compact/fullscreen center on the viewport and the sidebar pins its far
 * edge to the viewport's inline-end (flipped under RTL).
 */
export function shellAnchor(opts: {
  isChatOpen: boolean;
  layout: WidgetCompanionLayoutU;
  region: Region;
  sidebarWidth: number;
  dir: string;
  bottomOffset: number;
}): ShellAnchor {
  const { isChatOpen, layout, region, sidebarWidth, dir, bottomOffset } = opts;
  // Pill / quick-ask (not open chat) always rest bottom-center, regardless of
  // the layout the panel WILL open into.
  const anchorLayout = isChatOpen ? layout : 'compact';
  const width = effectiveSidebarWidth(region, sidebarWidth);
  const bottom =
    anchorLayout === 'fullscreen'
      ? FULLSCREEN_MARGIN
      : anchorLayout === 'sidebar'
        ? SIDEBAR_MARGIN
        : bottomOffset;
  const centerX =
    anchorLayout === 'sidebar'
      ? dir === 'rtl'
        ? SIDEBAR_MARGIN + width / 2
        : region.width - SIDEBAR_MARGIN - width / 2
      : region.width / 2;
  return { centerX, bottom };
}
