import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
 * when the agent actually emits a Chart. Kept intentionally minimal (bar / line
 * / pie over `{ label, value }[]`); richer charts can grow behind the same seam.
 */

// Fixed, theme-neutral palette (readable on light and dark bubbles). Deliberately
// not tied to widget tokens so a chunk with no CSS context still renders in color.
const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6'];

export default function ChartImpl({ type, data, height }: ChartProps) {
  const h = height ?? 220;

  if (data.length === 0) {
    return <ChartEmpty height={h} />;
  }

  return (
    <div className="w-full" style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        {type === 'pie' ? (
          <PieChart>
            <Tooltip />
            <Pie data={data} dataKey="value" nameKey="label" outerRadius="80%" innerRadius="45%">
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
          </PieChart>
        ) : type === 'line' ? (
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke={PALETTE[0]} strokeWidth={2} dot={false} />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} />
            <Tooltip />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
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
