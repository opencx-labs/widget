import type { PanelLayout } from './types';

/** Even margin on all four sides for the fullscreen modal window. */
export const FULLSCREEN_MARGIN = 16;
/** Margin around the docked sidebar (top/bottom + the inline-end edge). */
export const SIDEBAR_MARGIN = 16;

export type Region = {
  width: number;
  height: number;
  left: number;
  top: number;
};
export type ShellDims = { width: number; height: number; borderRadius: number };
/** The container anchor: the shell is translateX(-50%)-centered on `centerX`
 * and offset from the region bottom by `bottom`. Both animate with the morph
 * spring so a layout switch expands FROM the current rect in place. */
export type ShellAnchor = { centerX: number; bottom: number };

/**
 * Pure geometry for the one companion shell across all layouts. The open panel
 * and its anchor are computed here so the RTL edge-anchoring, margins, and
 * viewport clamp are testable without rendering the (iframe + portal) shell.
 */
export class CompanionGeometryUtils {
  /** Sidebar clamped so it never exceeds the region minus its side margins
   * (a narrow viewport must not let the panel cover the whole width). */
  static effectiveSidebarWidth(region: Region, sidebarWidth: number): number {
    return Math.min(sidebarWidth, region.width - SIDEBAR_MARGIN * 2);
  }

  /** The open chat panel's box per layout. */
  static chatDims(opts: {
    layout: PanelLayout;
    region: Region;
    compactWidth: number;
    chatHeight: number;
    sidebarWidth: number;
  }): ShellDims {
    const { layout, region, compactWidth, chatHeight, sidebarWidth } = opts;
    if (layout === 'fullscreen') {
      return {
        width: region.width - FULLSCREEN_MARGIN * 2,
        height: region.height - FULLSCREEN_MARGIN * 2,
        borderRadius: 16,
      };
    }
    if (layout === 'sidebar') {
      return {
        width: CompanionGeometryUtils.effectiveSidebarWidth(
          region,
          sidebarWidth,
        ),
        height: region.height - SIDEBAR_MARGIN * 2,
        borderRadius: 20,
      };
    }
    return { width: compactWidth, height: chatHeight, borderRadius: 20 };
  }

  /**
   * The container anchor (center-x + bottom). The fullscreen/sidebar anchoring
   * applies ONLY when the chat panel is actually open (`isChatOpen`): the
   * resting pill and the quick-ask bar always sit bottom-center, so a sidebar
   * (or fullscreen) layout does NOT drag the pill to the edge. When open,
   * compact/fullscreen center on the region and the sidebar pins its far edge
   * to the region's inline-end (flipped under RTL). `regionOffsetBottom` lifts
   * the anchor when the shell is scoped to a sub-region, not the full viewport.
   */
  static shellAnchor(opts: {
    isChatOpen: boolean;
    layout: PanelLayout;
    region: Region;
    sidebarWidth: number;
    dir: string;
    bottomOffset: number;
    regionOffsetBottom: number;
  }): ShellAnchor {
    const {
      isChatOpen,
      layout,
      region,
      sidebarWidth,
      dir,
      bottomOffset,
      regionOffsetBottom,
    } = opts;
    // Pill / quick-ask (not open chat) always rest bottom-center, regardless of
    // the layout the panel WILL open into.
    const anchorLayout = isChatOpen ? layout : 'compact';
    const width = CompanionGeometryUtils.effectiveSidebarWidth(
      region,
      sidebarWidth,
    );
    const bottom =
      (anchorLayout === 'fullscreen'
        ? FULLSCREEN_MARGIN
        : anchorLayout === 'sidebar'
          ? SIDEBAR_MARGIN
          : bottomOffset) + regionOffsetBottom;
    const centerX =
      anchorLayout === 'sidebar'
        ? dir === 'rtl'
          ? region.left + SIDEBAR_MARGIN + width / 2
          : region.left + region.width - SIDEBAR_MARGIN - width / 2
        : region.left + region.width / 2;
    return { centerX, bottom };
  }
}
