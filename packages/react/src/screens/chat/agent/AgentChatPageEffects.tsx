import { log } from '@opencx/widget-core';
import { useAgentChatUi, useConfig } from '@opencx/widget-react-headless';
import { useEffect, useRef } from 'react';
import { useTheme } from '../../../hooks/useTheme';
import {
  dismissActiveHighlight,
  highlightElementInputSchema,
  highlightElementOnHostPage,
} from '../../../page-marks/agent-mark';
import { resolvePageMarkTheme } from '../../../page-marks/page-mark-theme';

const MAX_HANDLED_PAGE_EFFECTS = 200;

/**
 * Styled host-page adapter for effects emitted by the headless agent engine.
 * Headless owns turn/lifecycle state and the client-tools gate
 * (`WidgetCtx.features.clientTools`, which needs the embed's page-marks
 * opt-in); this bridge alone owns DOM lookup, widget theme colors, layering,
 * and the hand-drawn page-mark implementation.
 */
export function AgentChatPageEffects() {
  const { pageMarkHighlightDurationMs } = useConfig();
  const { pageEffects } = useAgentChatUi();
  const { theme, cssVars } = useTheme();
  const pageMarkTheme = resolvePageMarkTheme({
    cssVars,
    primaryColor: theme.primaryColor,
    contentZIndex: theme.widgetContentContainer.zIndex,
  });
  const handledEffectKeysRef = useRef(new Set<string>());

  // The ink lives in the HOST document: an unmounting widget takes it along.
  useEffect(() => () => dismissActiveHighlight(), []);

  useEffect(() => {
    const handled = handledEffectKeysRef.current;
    for (const effect of pageEffects) {
      if (effect.type !== 'highlight-element' || handled.has(effect.key)) {
        continue;
      }
      handled.add(effect.key);
      while (handled.size > MAX_HANDLED_PAGE_EFFECTS) {
        const oldest = handled.values().next().value;
        if (oldest === undefined) break;
        handled.delete(oldest);
      }

      const parsed = highlightElementInputSchema.safeParse(effect.input);
      if (!parsed.success) {
        log.warn('highlight_element: invalid tool input', {
          issues: parsed.error.issues,
        });
        continue;
      }
      const found = highlightElementOnHostPage(parsed.data, {
        accentColor: pageMarkTheme.accent,
        surfaceColor: pageMarkTheme.surface,
        foregroundColor: pageMarkTheme.foreground,
        zIndex: pageMarkTheme.inkZIndex,
        durationMs: pageMarkHighlightDurationMs,
      });
      if (!found) {
        log.warn('highlight_element: element not found on page', parsed.data);
      }
    }
  }, [
    pageEffects,
    pageMarkHighlightDurationMs,
    pageMarkTheme.accent,
    pageMarkTheme.surface,
    pageMarkTheme.foreground,
    pageMarkTheme.inkZIndex,
  ]);

  return null;
}
