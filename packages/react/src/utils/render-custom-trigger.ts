import React from 'react';
import type { WidgetConfig } from '@opencx/widget-core';

type CustomTrigger = NonNullable<
  NonNullable<WidgetConfig['customComponents']>['widgetTrigger']
>;

/**
 * Invoke the embedder-supplied `customComponents.widgetTrigger` with the
 * shared contract: it replaces the built-in launcher entirely and drives the
 * widget via `setIsOpen`. One invocation shape for popover and companion.
 */
export function renderCustomTrigger(
  customTrigger: CustomTrigger,
  isOpen: boolean,
  setIsOpen: (open: boolean) => void,
) {
  return customTrigger({
    react: React,
    isOpen,
    setIsOpen: (open: boolean) => setIsOpen(open),
  });
}
