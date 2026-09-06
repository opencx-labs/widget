import React from 'react';
import type {
  WidgetCompanionLayoutU,
  WidgetSidebarSideResolvedU,
} from '@opencx/widget-core';

/** A tiny window diagram per layout, in the macOS tiling-menu idiom. The
 * sidebar tile draws its panel on the side the sidebar actually docks to, so
 * a left-docked companion doesn't advertise a right-hand panel. */
export function LayoutGlyph({
  layout,
  sidebarSide,
}: {
  layout: WidgetCompanionLayoutU;
  sidebarSide: WidgetSidebarSideResolvedU;
}) {
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
    // A docked panel on the configured third.
    return (
      <svg {...common}>
        {frame}
        <rect
          x={sidebarSide === 'left' ? 2 : 10.5}
          y={2.5}
          width={5.5}
          height={13}
          rx={2.5}
          fill="currentColor"
        />
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
// Config owns order; this record only supplies presentation metadata.

/** A window with its panel on one edge — the segmented control's two faces. */
export function SidePanelGlyph({ side }: { side: WidgetSidebarSideResolvedU }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden={true}
    >
      <rect
        x={1}
        y={2}
        width={12}
        height={10}
        rx={2}
        stroke="currentColor"
        strokeWidth={1.2}
        opacity={0.5}
      />
      <rect
        x={side === 'left' ? 1 : 8.5}
        y={2}
        width={4.5}
        height={10}
        rx={2}
        fill="currentColor"
      />
    </svg>
  );
}
