import type { WidgetDisplayModeU } from '@opencx/widget-core';
import { useWidget } from '../WidgetProvider';

/**
 * Effective display mode for the widget shell.
 *
 * An explicit `config.displayMode` always wins. Otherwise, agent-bound embeds
 * (config `agentId`, the agents platform / agent v3) default to the
 * `companion` UI — the new shell ships together with agent v3 — while unbound
 * embeds keep the classic `popover`.
 */
export function useDisplayMode(): WidgetDisplayModeU {
  const { config, widgetCtx } = useWidget();
  if (config.displayMode) return config.displayMode;
  return widgetCtx.agent ? 'companion' : 'popover';
}
