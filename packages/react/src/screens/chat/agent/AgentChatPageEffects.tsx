import { log } from '@opencx/widget-core';
import { useAgentChatUi, useConfig } from '@opencx/widget-react-headless';
import { useEffect, useRef } from 'react';
import { useTheme } from '../../../hooks/useTheme';
import {
  dismissActiveHighlight,
  highlightElementInputSchema,
  highlightElementOnHostPage,
} from '../../../page-marks/agent-mark';
import { guardRef } from '../../../page-controls/guard';
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
  const { pageEffects, replyToPageCall } = useAgentChatUi();
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
        replyToPageCall(effect.callId, 'unsupported');
        continue;
      }
      // The reference is looked up and the element re-checked here, in the
      // instant before the ink goes down: still the same node, still on
      // screen, still not behind something. A page can re-render between the
      // reading that minted the ref and this tool call arriving.
      const guarded = guardRef(parsed.data.ref);
      if (!guarded.ok) {
        log.warn('highlight_element: not drawn', {
          ref: parsed.data.ref,
          reason: guarded.reason,
        });
        // The turn is waiting: say WHICH no it was, so the agent can tell
        // the customer to close the dialog rather than "it didn't work".
        if (guarded.reason === 'off-limits') {
          replyToPageCall(effect.callId, 'unsupported', guarded.detail);
        } else {
          replyToPageCall(effect.callId, guarded.reason);
        }
        continue;
      }
      const found = highlightElementOnHostPage(guarded.element, parsed.data, {
        accentColor: pageMarkTheme.accent,
        surfaceColor: pageMarkTheme.surface,
        foregroundColor: pageMarkTheme.foreground,
        zIndex: pageMarkTheme.inkZIndex,
        durationMs: pageMarkHighlightDurationMs,
      });
      replyToPageCall(effect.callId, found ? 'done' : 'gone');
      if (!found) {
        log.warn('highlight_element: the mark could not be drawn', parsed.data);
      }
    }
  }, [
    pageEffects,
    replyToPageCall,
    pageMarkHighlightDurationMs,
    pageMarkTheme.accent,
    pageMarkTheme.surface,
    pageMarkTheme.foreground,
    pageMarkTheme.inkZIndex,
  ]);

  return null;
}
