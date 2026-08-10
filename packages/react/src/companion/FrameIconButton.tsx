import React from 'react';
import { cn } from '../components/lib/utils/cn';

/**
 * Icon button for companion chrome that renders INSIDE the content iframe
 * (panel controls, quick-ask bar) — Tailwind is available there. Size comes
 * from the call site (`size-7`, `size-8`, ...) so the base stays reusable.
 *
 * Forwards its ref so it can be the `asChild` target of Radix wrappers
 * (Popover trigger, `Tooltippy`). When wrapped in `Tooltippy`, pass
 * `title=""` at the call site to suppress the native tooltip so it
 * doesn't double up with the styled one.
 */
export const FrameIconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
>(function FrameIconButton({ label, title, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={title === undefined ? label : title || undefined}
      {...props}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg',
        'text-secondary-foreground/60 hover:text-secondary-foreground hover:bg-black/5',
        'active:scale-[0.97] transition-[background-color,color,transform] duration-150 ease-out',
        className,
      )}
    />
  );
});
