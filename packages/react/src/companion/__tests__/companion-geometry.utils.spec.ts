import { describe, expect, it } from 'vitest';
import {
  chatDims,
  chatHeight,
  compactWidth,
  effectiveSidebarWidth,
  FULLSCREEN_MARGIN,
  PANEL_MAX_WIDTH,
  RADII,
  SIDEBAR_FULL_BLEED_MAX_WIDTH,
  SIDEBAR_MARGIN,
  shellAnchor,
  type Region,
} from '../companion-geometry.utils';

/**
 * The one companion shell renders compact / fullscreen / sidebar and morphs
 * between them by animating this geometry. The rect math — RTL edge-anchoring,
 * margins, the viewport clamp — is the bug-prone kernel and is asserted here
 * directly (the shell itself is an iframe + portal, untestable in jsdom).
 */
const VIEWPORT: Region = { width: 1200, height: 800 };

describe('effectiveSidebarWidth', () => {
  it('returns the requested width when it fits', () => {
    expect(effectiveSidebarWidth(VIEWPORT, 400)).toBe(400);
  });

  it('clamps to viewport width minus both side margins on a narrow viewport', () => {
    // 300-wide viewport: 300 - 16*2 = 268 is the widest the panel may be.
    const narrow: Region = { width: 300, height: 800 };
    expect(effectiveSidebarWidth(narrow, 400)).toBe(268);
  });

  it('goes full-bleed below the breakpoint, matching the app-frame media query', () => {
    // At (or below) the breakpoint the app-frame stops insetting the host
    // page, so the panel ignores its configured width and takes everything.
    const atBreakpoint: Region = {
      width: SIDEBAR_FULL_BLEED_MAX_WIDTH,
      height: 800,
    };
    expect(effectiveSidebarWidth(atBreakpoint, 400)).toBe(
      SIDEBAR_FULL_BLEED_MAX_WIDTH - SIDEBAR_MARGIN * 2,
    );
    // Just above it the configured width applies again.
    const above: Region = {
      width: SIDEBAR_FULL_BLEED_MAX_WIDTH + 1,
      height: 800,
    };
    expect(effectiveSidebarWidth(above, 400)).toBe(400);
  });

  it('never returns a negative width when the viewport is smaller than its margins', () => {
    expect(effectiveSidebarWidth({ width: 20, height: 20 }, 400)).toBe(0);
  });
});

describe('compactWidth', () => {
  it('caps at the panel max width on wide viewports', () => {
    expect(compactWidth(VIEWPORT)).toBe(PANEL_MAX_WIDTH);
  });

  it('shrinks with a side margin and lets a tiny viewport override the floor', () => {
    expect(compactWidth({ width: 400, height: 800 })).toBe(400 - 32);
    expect(compactWidth({ width: 200, height: 800 })).toBe(200);
  });

  it('honors configured compact width bounds', () => {
    expect(
      compactWidth(VIEWPORT, {
        minWidth: 360,
        maxWidth: 600,
      }),
    ).toBe(600);
  });
});

describe('chatHeight', () => {
  it('takes 65% of the viewport height inside the chat bounds', () => {
    expect(chatHeight(VIEWPORT, 24)).toBe(800 * 0.65);
  });

  it('caps at the chat max height on tall viewports', () => {
    // 1200-tall viewport: 65% (780) exceeds the 640 maximum.
    expect(chatHeight({ width: 1200, height: 1200 }, 24)).toBe(640);
  });

  it('never exceeds what fits between the bottom offset and the top margin', () => {
    // 200-tall viewport: 200 - 24 - 48 = 128 available — the space cap beats
    // even the 420 minimum, so the panel always stays on screen.
    expect(chatHeight({ width: 1200, height: 200 }, 24)).toBe(128);
  });

  it('never becomes negative or exceeds a viewport shorter than its margins', () => {
    expect(chatHeight({ width: 200, height: 40 }, 24)).toBe(0);
  });

  it('honors configured height bounds and viewport ratio', () => {
    expect(
      chatHeight(VIEWPORT, 24, {
        minHeight: 300,
        maxHeight: 700,
        viewportHeightRatio: 0.75,
      }),
    ).toBe(600);
  });
});

describe('chatDims', () => {
  const base = { region: VIEWPORT, sidebarWidth: 400, bottomOffset: 24 };

  it('fullscreen fills the viewport minus an even margin', () => {
    expect(chatDims({ ...base, layout: 'fullscreen' })).toEqual({
      width: 1200 - FULLSCREEN_MARGIN * 2,
      height: 800 - FULLSCREEN_MARGIN * 2,
      borderRadius: RADII.fullscreen,
    });
  });

  it('sidebar is the (clamped) width, full viewport height', () => {
    expect(chatDims({ ...base, layout: 'sidebar' })).toEqual({
      width: 400,
      height: 800 - SIDEBAR_MARGIN * 2,
      borderRadius: RADII.sidebar,
    });
  });

  it('sidebar width is clamped inside chatDims too (single source of truth)', () => {
    const narrow: Region = { width: 300, height: 800 };
    expect(
      chatDims({
        ...base,
        region: narrow,
        layout: 'sidebar',
      }).width,
    ).toBe(268);
  });

  it('compact uses the compact card math', () => {
    expect(chatDims({ ...base, layout: 'compact' })).toEqual({
      width: compactWidth(VIEWPORT),
      height: chatHeight(VIEWPORT, 24),
      borderRadius: RADII.compact,
    });
  });

  it('applies configured compact dimensions and radius', () => {
    expect(
      chatDims({
        ...base,
        layout: 'compact',
        compact: {
          maxWidth: 600,
          minHeight: 300,
          maxHeight: 700,
          viewportHeightRatio: 0.75,
          borderRadius: 12,
        },
      }),
    ).toEqual({ width: 600, height: 600, borderRadius: 12 });
  });

  it('never produces negative dimensions on a viewport smaller than its margins', () => {
    const tiny: Region = { width: 20, height: 20 };
    expect(
      chatDims({
        ...base,
        region: tiny,
        layout: 'fullscreen',
      }),
    ).toMatchObject({ width: 0, height: 0 });
    expect(
      chatDims({
        ...base,
        region: tiny,
        layout: 'sidebar',
      }),
    ).toMatchObject({ width: 0, height: 0 });
  });
});

describe('shellAnchor', () => {
  const base = {
    isChatOpen: true,
    region: VIEWPORT,
    sidebarWidth: 400,
    bottomOffset: 24,
  };

  it('rests the pill bottom-center even in sidebar layout (not open chat)', () => {
    // The bug fix: a sidebar/fullscreen LAYOUT must not drag the resting pill
    // to the edge — only the open chat panel is edge/viewport-anchored.
    expect(
      shellAnchor({
        ...base,
        isChatOpen: false,
        layout: 'sidebar',
        dir: 'ltr',
      }),
    ).toEqual({ centerX: 600, bottom: 24 });
    // Same for a fullscreen layout while resting.
    expect(
      shellAnchor({
        ...base,
        isChatOpen: false,
        layout: 'fullscreen',
        dir: 'ltr',
      }),
    ).toEqual({ centerX: 600, bottom: 24 });
  });

  it('compact centers on the viewport and sits on the bottom offset', () => {
    expect(
      shellAnchor({
        ...base,
        layout: 'compact',
        dir: 'ltr',
      }),
    ).toEqual({ centerX: 600, bottom: 24 });
  });

  it('fullscreen centers on the viewport with the fullscreen margin as bottom', () => {
    expect(
      shellAnchor({
        ...base,
        layout: 'fullscreen',
        dir: 'ltr',
      }),
    ).toEqual({ centerX: 600, bottom: FULLSCREEN_MARGIN });
  });

  it('LTR sidebar pins its far edge to the viewport inline-end', () => {
    // right edge = 1200 - 16 = 1184; center = right - 400/2 = 984.
    expect(
      shellAnchor({
        ...base,
        layout: 'sidebar',
        dir: 'ltr',
      }),
    ).toEqual({ centerX: 1200 - SIDEBAR_MARGIN - 200, bottom: SIDEBAR_MARGIN });
    // The shell's far (right) edge lands exactly on the viewport edge minus margin.
    const { centerX } = shellAnchor({
      ...base,
      layout: 'sidebar',
      dir: 'ltr',
    });
    expect(centerX + 400 / 2).toBe(1200 - SIDEBAR_MARGIN);
  });

  it('RTL sidebar flips to the inline-start (left) edge', () => {
    // left edge = 16; center = 16 + 400/2 = 216.
    const { centerX } = shellAnchor({
      ...base,
      layout: 'sidebar',
      dir: 'rtl',
    });
    expect(centerX).toBe(SIDEBAR_MARGIN + 200);
    expect(centerX - 400 / 2).toBe(SIDEBAR_MARGIN); // left edge on the margin
  });
});
