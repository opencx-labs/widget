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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartProps } from './props';

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

export default function ChartImpl({ type, data, height, centerLabel }: ChartProps) {
  const h = height ?? 220;

  if (data.length === 0) {
    return <ChartEmpty height={h} />;
  }

  return (
    <div className="w-full text-foreground" style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        {type === 'pie' ? (
          <PieChart>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Pie data={data} dataKey="value" nameKey="label" outerRadius="85%" innerRadius="60%">
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
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeOpacity={0.15} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} />
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
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeOpacity={0.15} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fillOpacity: 0.06 }} />
            <Bar dataKey="value" fill={rampColor(0)} radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function ChartEmpty({ height }: { height: number }) {
  return (
    <div
      className="flex w-full items-center justify-center rounded-lg border border-muted-foreground/15 text-xs text-muted-foreground"
      style={{ height }}
    >
      No data to chart
    </div>
  );
}
