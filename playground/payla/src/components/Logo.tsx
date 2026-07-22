import { cn } from "../lib/cn.ts";

/** Payla mark — a warm ink rounded square with two overlapping "coins" (accent + white). */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn("shrink-0", className)} aria-hidden>
      <rect width="24" height="24" rx="7" fill="var(--color-primary)" />
      <circle cx="9.5" cy="12" r="4.5" fill="var(--color-accent)" />
      <circle cx="14.5" cy="12" r="4.5" fill="#fff" fillOpacity="0.92" />
      <circle cx="12" cy="12" r="1.9" fill="var(--color-primary)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoMark size={24} />
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Payla</span>
    </div>
  );
}
