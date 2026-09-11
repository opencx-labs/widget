import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Wobble } from './wobble';
import { cn } from './utils/cn';
import { dc } from '../../utils/data-component';

const buttonVariants = cva(
  cn(
    'inline-flex shrink-0 items-center justify-center gap-2',
    'text-sm font-medium whitespace-nowrap',
    'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:scale-[0.97] motion-reduce:active:scale-100',
    'rounded-xl',
    'transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]',
  ),
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        destructive: 'bg-destructive text-destructive-foreground',
        outline: 'bg-background border',
        secondary: 'bg-secondary text-secondary-foreground',
        ghost: 'hover:bg-secondary',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'py-2 px-3.5 text-xs',
        /**
         * This size is useful for top level buttons that needs to sit nicely inside the iframe's border radius.
         * Having the minimum height higher than usual (the `default` variant) will make the border radius look just right.
         */
        lg: 'min-h-12 px-4 rounded-[20px]',
        icon: 'h-10 w-10',
        fit: 'size-fit p-2',
        free: 'p-2',
        selfless: 'p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Disable decorative pointer-follow movement for stable action targets. */
  wobble?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size,
      asChild = false,
      wobble = true,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Wobble ref={ref} off={!wobble}>
        <Comp
          {...dc('ui_lib/btn')}
          data-variant={variant}
          className={cn(buttonVariants({ variant, size, className }))}
          {...props}
        />
      </Wobble>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
