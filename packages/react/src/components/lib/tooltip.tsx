import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';
import { cn } from './utils/cn.js';
import { useConfig } from '@opencx/widget-react-headless';

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 overflow-hidden max-w-xs rounded-xl bg-primary border text-primary-foreground p-2 text-center align-middle text-xs origin-[var(--radix-tooltip-content-transform-origin)] animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
      className,
    )}
    {...props}
  />
));

TooltipContent.displayName = TooltipPrimitive.Content.displayName;

function Tooltippy({
  children,
  content,
  side,
  align,
  disabled,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: TooltipPrimitive.TooltipContentProps['side'];
  align?: TooltipPrimitive.TooltipContentProps['align'];
  /**
   * Per-instance opt-out (in addition to the global `disableTooltips` config).
   * Companion's quick-ask bar uses it: the shell clips that composer to a thin
   * strip, so a `side="top"` tooltip would bleed above the bar as a dark sliver.
   */
  disabled?: boolean;
}) {
  const { disableTooltips } = useConfig();
  if (!content || disableTooltips || disabled) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        collisionPadding={8}
        avoidCollisions
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

export { TooltipProvider, Tooltippy };
