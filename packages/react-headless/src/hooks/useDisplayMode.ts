import type { WidgetDisplayModeU } from '@opencx/widget-core';
import { useWidget } from '../WidgetProvider';

/**
 * Effective display mode for the widget shell: `config.displayMode`, falling
 * back to the classic `popover`. Embedders opt into `companion` explicitly.
 */
export function useDisplayMode(): WidgetDisplayModeU {
  const { config } = useWidget();
  return config.displayMode ?? 'popover';
}
