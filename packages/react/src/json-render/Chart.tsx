import React, { Suspense } from 'react';
import type { ChartProps } from './props';

/**
 * Lazy boundary for the chart renderer. `recharts` (+ its d3 deps) is the only
 * heavy thing in the registry, so it lives behind `React.lazy` — the base widget
 * bundle stays light and the chunk downloads only when a spec contains a Chart.
 * A shimmer holds the space while it loads (and while the chart's own data
 * streams in).
 */
const ChartImpl = React.lazy(() => import('./Chart.impl'));

export function Chart(props: ChartProps) {
  const height = props.height ?? 220;
  return (
    <Suspense fallback={<ChartShimmer height={height} />}>
      <ChartImpl {...props} />
    </Suspense>
  );
}

function ChartShimmer({ height }: { height: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-lg bg-muted-foreground/10"
      style={{ height }}
      aria-hidden
    />
  );
}
