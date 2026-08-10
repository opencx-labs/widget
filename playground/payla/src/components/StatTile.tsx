import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "../lib/cn.ts";
import { Skeleton } from "./ui.tsx";

export function StatTile({
  label,
  value,
  sub,
  delta,
  loading,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: number | null;
  loading?: boolean;
}) {
  return (
    <div className="card px-5 py-4">
      <div className="text-[13px] text-ink-3">{label}</div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-28" />
      ) : (
        <div className="mt-1.5 flex items-baseline gap-2">
          <div className="text-[22px] font-semibold tracking-[-0.01em] text-ink">{value}</div>
          {delta != null && Number.isFinite(delta) && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[12px] font-medium",
                delta >= 0 ? "text-success" : "text-danger",
              )}
            >
              {delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
        </div>
      )}
      {sub && !loading && <div className="mt-1 text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}
