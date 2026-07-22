import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "../lib/cn.ts";
import type { Tone } from "../lib/status.ts";
import { statusLabel } from "../lib/format.ts";

// ---- Button ----
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover border border-transparent",
  secondary: "bg-surface text-ink border border-border-strong hover:bg-surface-3",
  ghost: "bg-transparent text-ink-2 hover:bg-surface-3 border border-transparent",
  danger: "bg-danger text-white hover:opacity-90 border border-transparent",
};
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] rounded-lg gap-1.5",
  md: "h-9 px-3.5 text-sm rounded-lg gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cn(
        "focusable inline-flex items-center justify-center font-medium transition-colors select-none",
        "disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ---- Card ----
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 h-13 border-b border-border">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {action}
    </div>
  );
}

// ---- StatusPill ----
const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-surface-4 text-ink-2",
};
const DOT_CLASSES: Record<Tone, string> = {
  success: "bg-success-dot",
  warning: "bg-warning-dot",
  danger: "bg-danger-dot",
  info: "bg-info",
  neutral: "bg-ink-4",
};

export function StatusPill({ tone, label, dot = true }: { tone: Tone; label: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-0.5 text-[12px] font-medium",
        TONE_CLASSES[tone],
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", DOT_CLASSES[tone])} />}
      {statusLabel(label)}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium", TONE_CLASSES[tone])}>
      {children}
    </span>
  );
}

// ---- Inputs ----
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "focusable h-9 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink",
        "placeholder:text-ink-4 transition-colors hover:border-ink-4",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "focusable h-9 rounded-lg border border-border-strong bg-surface pl-3 pr-8 text-sm text-ink",
        "transition-colors hover:border-ink-4 cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-ink-3">{hint}</span>}
    </label>
  );
}

// ---- Misc ----
export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      {icon && <div className="mb-1 text-ink-4">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <p className="max-w-sm text-[13px] text-ink-3">{children}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-4", className)} />;
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className="text-[13px] font-medium text-ink text-right">{children}</dd>
    </div>
  );
}
