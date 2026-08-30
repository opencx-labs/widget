import type { WidgetDisplayModeU } from '@opencx/widget-core';
import { useWidget } from '../WidgetProvider';

/**
 * Effective display mode for the widget shell.
 *
 * An explicit `config.displayMode` always wins. Otherwise, agent-bound embeds
 * (config `agentId`, the agents platform) default to the `companion` UI,
 * while unbound embeds keep the classic `popover`.
 */
export function useDisplayMode(): WidgetDisplayModeU {
  const { config, widgetCtx } = useWidget();
  if (config.displayMode) return config.displayMode;
  return widgetCtx.isAgentBound ? 'companion' : 'popover';
}
