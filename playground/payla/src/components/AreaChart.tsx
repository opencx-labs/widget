import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MetricsPoint } from "../../shared/types.ts";
import { formatDate } from "../lib/format.ts";

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export function AreaChart({ data, height = 200, currency = "EUR" }: { data: MetricsPoint[]; height?: number; currency?: string }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => setHover(null), [data]);

  const padX = 4;
  const padTop = 12;
  const padBottom = 4;
  const max = Math.max(1, ...data.map((d) => d.amount));
  const innerW = Math.max(1, width - padX * 2);
  const innerH = height - padTop - padBottom;

  const x = (i: number) => padX + (data.length <= 1 ? 0 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => padTop + innerH - (v / max) * innerH;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.amount).toFixed(1)}`).join(" ");
  const area = data.length
    ? `${line} L${x(data.length - 1).toFixed(1)},${(height - padBottom).toFixed(1)} L${x(0).toFixed(1)},${(height - padBottom).toFixed(1)} Z`
    : "";

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - padX) / innerW) * (data.length - 1));
    setHover(Math.min(Math.max(i, 0), data.length - 1));
  };

  const fmt = new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: 0 });

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      <svg
        width={width}
        height={height}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="block overflow-visible"
      >
        <defs>
          <linearGradient id="payla-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {area && <path d={area} fill="url(#payla-area)" />}
        {line && <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {hover !== null && data[hover] && (
          <>
            <line x1={x(hover)} y1={padTop} x2={x(hover)} y2={height - padBottom} stroke="var(--color-border-strong)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(data[hover].amount)} r="4" fill="var(--color-accent)" stroke="#fff" strokeWidth="2" />
          </>
        )}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-center shadow-[0_4px_16px_rgba(16,16,16,0.1)]"
          style={{ left: Math.min(Math.max(x(hover), 60), width - 60), top: Math.max(y(data[hover].amount) - 52, 0) }}
        >
          <div className="text-sm font-semibold text-ink">{fmt.format(data[hover].amount)}</div>
          <div className="text-[11px] text-ink-3">{formatDate(data[hover].date)}</div>
        </div>
      )}
    </div>
  );
}
