import { useAgentChatUi, useConfig } from '@opencx/widget-react-headless';
import { useEffect, useRef } from 'react';
import { useTheme } from '../../../hooks/useTheme';
import {
  highlightElementInputSchema,
  highlightElementOnHostPage,
} from '../../../page-marks/agent-mark';
import { resolvePageMarkTheme } from '../../../page-marks/page-mark-theme';

const MAX_HANDLED_PAGE_EFFECTS = 200;

/**
 * Styled host-page adapter for effects emitted by the headless agent engine.
 * Headless owns turn/lifecycle state; this bridge alone owns DOM lookup,
 * widget theme colors, layering, and the hand-drawn page-mark implementation.
 */
export function AgentChatPageEffects() {
  const config = useConfig();
  const { pageEffects } = useAgentChatUi();
  const { theme, cssVars } = useTheme();
  const pageMarkTheme = resolvePageMarkTheme({
    cssVars,
    primaryColor: theme.primaryColor,
    contentZIndex: theme.widgetContentContainer.zIndex,
  });
  const handledEffectKeysRef = useRef(new Set<string>());

  useEffect(() => {
    if (config.enablePageMarks !== true) return;
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
        console.warn('highlight_element: invalid tool input', {
          issues: parsed.error.issues,
        });
        continue;
      }
      const found = highlightElementOnHostPage(parsed.data, {
        accentColor: pageMarkTheme.accent,
        surfaceColor: pageMarkTheme.surface,
        foregroundColor: pageMarkTheme.foreground,
        zIndex: pageMarkTheme.inkZIndex,
        durationMs: config.pageMarkHighlightDurationMs ?? 8000,
      });
      if (!found) {
        console.warn(
          'highlight_element: element not found on page',
          parsed.data,
        );
      }
    }
  }, [
    pageEffects,
    config.enablePageMarks,
    config.pageMarkHighlightDurationMs,
    pageMarkTheme.accent,
    pageMarkTheme.surface,
    pageMarkTheme.foreground,
    pageMarkTheme.inkZIndex,
  ]);

  return null;
}
