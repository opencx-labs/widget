import type { Dto } from '../api/client';
import type { WidgetConfig } from '../types/widget-config';

/**
 * The org's agent as the embed sees it: branding, which engine serves the
 * web channel, and the features the CLIENT acts on. Features the server
 * applies on its own (preamble, inline UI) are not mirrored here — the embed
 * only forwards its toggles for those (see `resolveSendFeatures`).
 */
export type WidgetAgent = {
  name: string;
  avatarUrl: string | null;
  /**
   * The org's web channel runs the streaming engine (widget v5). `false`
   * means the classic blocking send.
   */
  streaming: boolean;
  /** The org's EFFECTIVE features (entitlements already applied). */
  features: {
    dictation: boolean;
    attachments: boolean;
    pageContext: boolean;
    clientTools: boolean;
  };
};

type ServerAgent = Dto['WidgetAgentDto'];

/**
 * snake_case (backend DTO) → camelCase (widget types) at the boundary.
 *
 * A backend that predates widget v5 returns no `agent` block at all. That is
 * the classic widget: blocking send, attachments on, nothing page-aware — the
 * exact v4 behavior, so an embed upgraded ahead of its backend keeps working.
 */
export function resolveWidgetAgent({
  org,
  agent,
}: {
  org: { name: string };
  agent?: ServerAgent | null;
}): WidgetAgent {
  if (!agent) {
    return {
      name: org.name,
      avatarUrl: null,
      streaming: false,
      features: {
        dictation: false,
        attachments: true,
        pageContext: false,
        clientTools: false,
      },
    };
  }
  return {
    name: agent.name,
    avatarUrl: agent.avatar_url,
    streaming: agent.streaming,
    features: {
      dictation: agent.features.dictation,
      attachments: agent.features.attachments,
      pageContext: agent.features.page_context,
      clientTools: agent.features.client_tools,
    },
  };
}

/**
 * The one narrowing rule for every per-embed feature toggle: the org's
 * effective feature can only be switched OFF by `config.features`, never on.
 */
export function narrowFeature(
  orgEnabled: boolean,
  embedToggle: boolean | undefined,
): boolean {
  return orgEnabled && embedToggle !== false;
}

/** The client-side feature answers the UI asks for, narrowed by the embed. */
export function resolveClientFeatures(
  agent: WidgetAgent,
  config: WidgetConfig,
): {
  /** The composer offers voice dictation. */
  dictation: boolean;
  /** The composer offers the attachment/upload affordance. */
  attachments: boolean;
  /**
   * The visitor can mark the page (the composer's page-mark button) and the
   * widget's own page context rides along with each message. The host's
   * `config.context` is unaffected — it always rides along, as it did in v4.
   */
  pageContext: boolean;
  /**
   * The widget performs the agent's client tools (highlight an element on
   * the host page).
   */
  clientTools: boolean;
} {
  const toggles = config.features;
  return {
    dictation: narrowFeature(agent.features.dictation, toggles?.dictation),
    attachments: agent.features.attachments,
    pageContext: narrowFeature(
      agent.features.pageContext,
      toggles?.pageContext,
    ),
    clientTools: narrowFeature(
      agent.features.clientTools,
      toggles?.clientTools,
    ),
  };
}

export type WidgetClientFeatures = ReturnType<typeof resolveClientFeatures>;
