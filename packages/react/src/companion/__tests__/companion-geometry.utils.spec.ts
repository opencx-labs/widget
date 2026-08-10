import { describe, expect, it } from 'vitest';
import {
  CompanionGeometryUtils,
  FULLSCREEN_MARGIN,
  SIDEBAR_MARGIN,
  type Region,
} from '../companion-geometry.utils';

/**
 * The one companion shell renders compact / fullscreen / sidebar and morphs
 * between them by animating this geometry. The rect math — RTL edge-anchoring,
 * margins, the viewport clamp — is the bug-prone kernel and is asserted here
 * directly (the shell itself is an iframe + portal, untestable in jsdom).
 */
const VIEWPORT: Region = { width: 1200, height: 800, left: 0, top: 0 };
// A scoped sub-region (companion.container): offset from the viewport origin.
const SUBREGION: Region = { width: 600, height: 500, left: 100, top: 80 };

describe('CompanionGeometryUtils.effectiveSidebarWidth', () => {
  it('returns the requested width when it fits', () => {
    expect(CompanionGeometryUtils.effectiveSidebarWidth(VIEWPORT, 400)).toBe(
      400,
    );
  });

  it('clamps to region width minus both side margins on a narrow region', () => {
    // 300-wide region: 300 - 16*2 = 268 is the widest the panel may be.
    const narrow: Region = { width: 300, height: 800, left: 0, top: 0 };
    expect(CompanionGeometryUtils.effectiveSidebarWidth(narrow, 400)).toBe(268);
  });
});

describe('CompanionGeometryUtils.chatDims', () => {
  const base = { region: VIEWPORT, compactWidth: 380, chatHeight: 520 };

  it('fullscreen fills the region minus an even margin, radius 16', () => {
    expect(
      CompanionGeometryUtils.chatDims({
        ...base,
        layout: 'fullscreen',
        sidebarWidth: 400,
      }),
    ).toEqual({
      width: 1200 - FULLSCREEN_MARGIN * 2,
      height: 800 - FULLSCREEN_MARGIN * 2,
      borderRadius: 16,
    });
  });

  it('sidebar is the (clamped) width, full region height, radius 20', () => {
    expect(
      CompanionGeometryUtils.chatDims({
        ...base,
        layout: 'sidebar',
        sidebarWidth: 400,
      }),
    ).toEqual({
      width: 400,
      height: 800 - SIDEBAR_MARGIN * 2,
      borderRadius: 20,
    });
  });

  it('sidebar width is clamped inside chatDims too (single source of truth)', () => {
    const narrow: Region = { width: 300, height: 800, left: 0, top: 0 };
    expect(
      CompanionGeometryUtils.chatDims({
        ...base,
        region: narrow,
        layout: 'sidebar',
        sidebarWidth: 400,
      }).width,
    ).toBe(268);
  });

  it('compact uses the measured card size, radius 20', () => {
    expect(
      CompanionGeometryUtils.chatDims({
        ...base,
        layout: 'compact',
        sidebarWidth: 400,
      }),
    ).toEqual({ width: 380, height: 520, borderRadius: 20 });
  });
});

describe('CompanionGeometryUtils.shellAnchor', () => {
  const base = {
    isChatOpen: true,
    region: VIEWPORT,
    sidebarWidth: 400,
    bottomOffset: 24,
    regionOffsetBottom: 0,
  };

  it('rests the pill bottom-center even in sidebar layout (not open chat)', () => {
    // The bug fix: a sidebar/fullscreen LAYOUT must not drag the resting pill
    // to the edge — only the open chat panel is edge/viewport-anchored.
    expect(
      CompanionGeometryUtils.shellAnchor({
        ...base,
        isChatOpen: false,
        layout: 'sidebar',
        dir: 'ltr',
      }),
    ).toEqual({ centerX: 600, bottom: 24 });
    // Same for a fullscreen layout while resting.
    expect(
      CompanionGeometryUtils.shellAnchor({
        ...base,
        isChatOpen: false,
        layout: 'fullscreen',
        dir: 'ltr',
      }),
    ).toEqual({ centerX: 600, bottom: 24 });
  });

  it('compact centers on the region and sits on the bottom offset', () => {
    expect(
      CompanionGeometryUtils.shellAnchor({
        ...base,
        layout: 'compact',
        dir: 'ltr',
      }),
    ).toEqual({ centerX: 600, bottom: 24 });
  });

  it('fullscreen centers on the region with the fullscreen margin as bottom', () => {
    expect(
      CompanionGeometryUtils.shellAnchor({
        ...base,
        layout: 'fullscreen',
        dir: 'ltr',
      }),
    ).toEqual({ centerX: 600, bottom: FULLSCREEN_MARGIN });
  });

  it('LTR sidebar pins its far edge to the region inline-end', () => {
    // right edge = 1200 - 16 = 1184; center = right - 400/2 = 984.
    expect(
      CompanionGeometryUtils.shellAnchor({
        ...base,
        layout: 'sidebar',
        dir: 'ltr',
      }),
    ).toEqual({ centerX: 1200 - SIDEBAR_MARGIN - 200, bottom: SIDEBAR_MARGIN });
    // The shell's far (right) edge lands exactly on the region edge minus margin.
    const { centerX } = CompanionGeometryUtils.shellAnchor({
      ...base,
      layout: 'sidebar',
      dir: 'ltr',
    });
    expect(centerX + 400 / 2).toBe(1200 - SIDEBAR_MARGIN);
  });

  it('RTL sidebar flips to the inline-start (left) edge', () => {
    // left edge = 16; center = 16 + 400/2 = 216.
    const { centerX } = CompanionGeometryUtils.shellAnchor({
      ...base,
      layout: 'sidebar',
      dir: 'rtl',
    });
    expect(centerX).toBe(SIDEBAR_MARGIN + 200);
    expect(centerX - 400 / 2).toBe(SIDEBAR_MARGIN); // left edge on the margin
  });

  it('offsets center-x and bottom by a scoped sub-region', () => {
    // Compact in a sub-region: centered on the sub-region, lifted by its
    // distance from the viewport bottom.
    const anchor = CompanionGeometryUtils.shellAnchor({
      isChatOpen: true,
      layout: 'compact',
      region: SUBREGION,
      sidebarWidth: 400,
      dir: 'ltr',
      bottomOffset: 24,
      regionOffsetBottom: 220,
    });
    expect(anchor).toEqual({ centerX: 100 + 300, bottom: 24 + 220 });
  });

  it('LTR sidebar in a sub-region pins to the sub-region inline-end', () => {
    // clamp: 600 - 32 = 568 max; 400 fits. right edge = 100 + 600 - 16 = 684.
    const { centerX } = CompanionGeometryUtils.shellAnchor({
      isChatOpen: true,
      layout: 'sidebar',
      region: SUBREGION,
      sidebarWidth: 400,
      dir: 'ltr',
      bottomOffset: 24,
      regionOffsetBottom: 220,
    });
    expect(centerX + 400 / 2).toBe(100 + 600 - SIDEBAR_MARGIN);
  });
});
