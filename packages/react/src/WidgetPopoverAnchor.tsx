import React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { useTheme } from './hooks/useTheme';

export function WidgetPopoverAnchor() {
  const { triggerSide } = useTheme();

  return (
    <PopoverPrimitive.Anchor
      style={{
        position: 'fixed',
        bottom: 0,
        right: triggerSide === 'right' ? 0 : undefined,
        left: triggerSide === 'left' ? 0 : undefined,
      }}
    />
  );
}
