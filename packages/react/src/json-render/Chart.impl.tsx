import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartProps } from './props';
import { requiredYAxisWidth } from './chart-axis';
import { useJsonRenderHost } from './host';

/**
 * Measure the wrapper width ourselves instead of relying on recharts'
 * `ResponsiveContainer`. On recharts 2.12 that container renders an empty,
 * svg-less box whenever it mounts measuring 0 — which is exactly this case: the
 * chart is a `React.lazy` chunk that mounts after the widget popover has laid
 * out, and it never re-measures on its own. Feeding recharts an explicit numeric
 * width sidesteps the trap; the `ResizeObserver` keeps it in sync when the embed
 * is resized.
 */
function useContainerWidth(): {
  ref: React.RefObject<HTMLDivElement | null>;
  width: number;
} {
  const ref = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

const Y_TICK_FONT_SIZE = 11;
/** First-paint axis width; the measured width replaces it before paint. */
const Y_AXIS_INITIAL_WIDTH = 32;

/**
 * Size the Y axis from the tick labels recharts painted (see `chart-axis.ts`):
 * a fixed `YAxis.width` clips any label wider than it, and there is no
 * auto-width axis in recharts 2.x. Re-measured whenever the painted labels can
 * change — the data, the chart type, the height (tick count) or the container
 * width — in a layout effect so the corrected axis paints in the same frame.
 * Converges in one pass: the Y ticks do not depend on the axis width, so the
 * re-render after `setWidth` measures the same labels and settles.
 */
function useYAxisWidth(
  ref: React.RefObject<HTMLDivElement | null>,
  {
    type,
    data,
    height,
    containerWidth,
  }: Pick<ChartProps, 'type' | 'data'> & {
    height: number;
    containerWidth: number;
  },
): number {
  const [width, setWidth] = React.useState(Y_AXIS_INITIAL_WIDTH);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const needed = requiredYAxisWidth(el, width, Y_TICK_FONT_SIZE);
    if (needed !== null && needed !== width) setWidth(needed);
  }, [ref, width, type, data, height, containerWidth]);
  return width;
}

/**
 * The actual chart renderer. Loaded lazily (see `Chart.tsx`) so recharts — the
 * one heavy dependency in the registry — is a separate chunk that only downloads
 * when the agent actually emits a Chart.
 *
 * Styled to match the companion/Impact-Dashboard charts: a monochrome ramp of
 * the theme foreground (90/70/50/30% alpha), donut pie with an optional center
 * label + legend, and clean axes (no tick/axis lines). The ramp reads the
 * widget's `--opencx-foreground` token so charts follow the embed theme, with
 * a neutral fallback for any context where the token is missing.
 */

const FOREGROUND = 'hsl(var(--opencx-foreground, 240 10% 20%))';
// Same ramp as the dashboard's REPORTS_COLOR (surface-foreground at 90/70/50/30%).
const RAMP = [90, 70, 50, 30].map(
  (pct) => `color-mix(in oklch, ${FOREGROUND} ${pct}%, transparent)`,
);
const rampColor = (i: number): string => RAMP[i % RAMP.length] ?? FOREGROUND;

const TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: 8,
  border: '1px solid color-mix(in oklch, currentColor 15%, transparent)',
  fontSize: 12,
};

export default function ChartImpl({
  type,
  data,
  height,
  centerLabel,
}: ChartProps) {
  const h = height ?? 220;
  const { ref, width } = useContainerWidth();
  const yAxisWidth = useYAxisWidth(ref, {
    type,
    data,
    height: h,
    containerWidth: width,
  });

  if (data.length === 0) {
    return <ChartEmpty height={h} />;
  }

  // Shared by the cartesian charts: the axis is exactly as wide as its labels,
  // so the plot keeps every px it can on small numbers and 7-digit or
  // currency-formatted ticks never lose their leading digits.
  const yAxis = (
    <YAxis
      tickLine={false}
      axisLine={false}
      fontSize={Y_TICK_FONT_SIZE}
      width={yAxisWidth}
    />
  );

  return (
    <div ref={ref} className="w-full text-foreground" style={{ height: h }}>
      {width > 0 &&
        (type === 'pie' ? (
          <PieChart width={width} height={h}>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              outerRadius="85%"
              innerRadius="60%"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={rampColor(i)} />
              ))}
              {centerLabel && (
                <Label
                  position="center"
                  content={({ viewBox }) => {
                    if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="fill-foreground text-2xl font-medium"
                        >
                          {centerLabel}
                        </text>
                      );
                    }
                  }}
                />
              )}
            </Pie>
          </PieChart>
        ) : type === 'line' ? (
          <LineChart
            width={width}
            height={h}
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeOpacity={0.15} vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              fontSize={11}
            />
            {yAxis}
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={rampColor(0)}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        ) : (
          <BarChart
            width={width}
            height={h}
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeOpacity={0.15} vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              fontSize={11}
            />
            {yAxis}
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fillOpacity: 0.06 }}
            />
            <Bar dataKey="value" fill={rampColor(0)} radius={[4, 4, 0, 0]} />
          </BarChart>
        ))}
    </div>
  );
}

function ChartEmpty({ height }: { height: number }) {
  const { t } = useJsonRenderHost();
  return (
    <div
      className="flex w-full items-center justify-center rounded-lg border border-muted-foreground/15 text-xs text-muted-foreground"
      style={{ height }}
    >
      {t('json_no_chart_data')}
    </div>
  );
}
