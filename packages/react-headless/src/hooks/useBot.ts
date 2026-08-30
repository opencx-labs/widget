import { useWidget } from '../WidgetProvider';

/**
 * Effective bot branding for AI messages and the header.
 *
 * When the embed is bound to an agents-platform agent (config `agentId`), the
 * server-resolved agent branding wins — it is the source of truth the backend
 * serves the conversation with — and the embedder's `bot` option only fills
 * gaps (e.g. a missing avatar). Unbound embeds keep using `config.bot`
 * exactly as before.
 */
export function useBot() {
  const { config, widgetCtx } = useWidget();
  const agent = widgetCtx.agent;
  if (!agent) return config.bot;
  return {
    name: agent.name,
    avatarUrl: agent.avatarUrl ?? config.bot?.avatarUrl ?? null,
    avatar: config.bot?.avatar,
  };
}
