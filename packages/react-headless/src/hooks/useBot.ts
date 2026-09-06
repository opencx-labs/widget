import type { Agent } from '@opencx/widget-core';
import { useMemo } from 'react';
import { useWidget } from '../WidgetProvider';

/**
 * The AI agent as the transcript shows it: the org's agent name/avatar
 * (resolved by the backend at init), overridden field by field by the
 * embedder's `bot` option.
 */
export function useBot(): Agent {
  const { config, widgetCtx } = useWidget();
  const { name, avatarUrl } = widgetCtx.agent;
  const bot = config.bot;
  return useMemo(
    () => ({
      isAi: true,
      id: null,
      name: bot?.name ?? name,
      avatarUrl: bot?.avatarUrl ?? avatarUrl,
      avatar: bot?.avatar,
    }),
    [bot?.name, bot?.avatarUrl, bot?.avatar, name, avatarUrl],
  );
}
