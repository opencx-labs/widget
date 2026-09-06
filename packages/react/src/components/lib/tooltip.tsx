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

const TooltipsSuppressed = React.createContext(false);

/**
 * Silences every tooltip rendered inside. Companion's quick-ask bar wraps the
 * composer in it: the shell clips that composer to a thin strip, so a
 * `side="top"` tooltip bleeds above the bar as a dark sliver. Stated once for
 * the whole subtree, so no control inside has to be told individually.
 */
function SuppressTooltips({ children }: { children: React.ReactNode }) {
  return (
    <TooltipsSuppressed.Provider value>{children}</TooltipsSuppressed.Provider>
  );
}

function Tooltippy({
  children,
  content,
  side,
  align,
  shortcut,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: TooltipPrimitive.TooltipContentProps['side'];
  align?: TooltipPrimitive.TooltipContentProps['align'];
  /**
   * Display form of the action's keyboard shortcut (e.g. "⌘⇧F", "Esc"),
   * rendered as a fainter chip after the label. Always produce it with
   * `formatBinding(WIDGET_KEYBINDINGS[action])` so the hint can never drift
   * from the binding the handler actually matches.
   */
  shortcut?: string;
}) {
  const { disableTooltips } = useConfig();
  const suppressed = React.useContext(TooltipsSuppressed);
  if (!content || disableTooltips || suppressed) return children;
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
        {shortcut && (
          <span className="ms-1.5 whitespace-nowrap text-primary-foreground/60">
            {shortcut}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export { TooltipProvider, Tooltippy, SuppressTooltips };
