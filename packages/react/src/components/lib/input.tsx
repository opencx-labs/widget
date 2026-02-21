import * as React from 'react';
import { useIsSmallScreen } from '../../hooks/useIsSmallScreen.js';
import { cn } from './utils/cn.js';
import { Wobble } from './wobble.js';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    const { isSmallScreen } = useIsSmallScreen();

    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          // 16px on mobiles prevents auto-zoom on the input when focused
          isSmallScreen ? 'text-[16px]' : 'text-sm',
          'flex w-full rounded-xl p-2 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-primary-foreground placeholder:text-muted-foreground/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition',
          'rounded-2xl px-4',
          'border shadow-sm',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
