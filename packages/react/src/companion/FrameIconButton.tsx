import React from 'react';
import { cn } from '../components/lib/utils/cn';

/**
 * Icon button for companion chrome that renders INSIDE the content iframe
 * (panel controls, quick-ask bar) — Tailwind is available there. Size comes
 * from the call site (`size-7`, `size-8`, ...) so the base stays reusable.
 *
 * Forwards its ref so it can be the `asChild` target of Radix wrappers
 * (Popover trigger, `Tooltippy`). Never renders a native `title`: every
 * call site pairs it with the styled tooltip, and a native one would double
 * up with it.
 */
export const FrameIconButton = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'> & {
    label: string;
  }
>(function FrameIconButton({ label, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      {...props}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg',
        'text-secondary-foreground/60 hover:text-secondary-foreground hover:bg-muted',
        'active:scale-[0.97] transition-[background-color,color,transform] duration-150 ease-out',
        className,
      )}
    />
  );
});
