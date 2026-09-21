import React from 'react';

/**
 * The placeholder a container shows while its spec is still streaming and it
 * has nothing to paint yet — the same pulse the lazy Chart holds its space
 * with (`ChartShimmer` in `Chart.tsx`), so an empty Card, List, Table, Grid or
 * Stack mid-stream reads as "loading" rather than as a bare frame or an "empty"
 * message that flips to content a moment later.
 */
export function StreamingShimmer({ height = 64 }: { height?: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-lg bg-muted-foreground/10"
      style={{ height }}
      aria-hidden
    />
  );
}
