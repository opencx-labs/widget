import { log } from '@opencx/widget-core';
import { useAgentChatUi } from '@opencx/widget-react-headless';
import { useEffect, useRef } from 'react';
import { actOnPage } from '../../../page-controls/act';
import { actOnPageInputSchema } from '../../../page-controls/act-input';
import { accessibleName } from '../../../page-controls/accessible-name';
import { resolveRef } from '../../../page-controls/control-ref';
import { needsConsent } from '../../../page-controls/needs-consent';

const MAX_HANDLED_ACTIONS = 200;

/**
 * The agent's hands on the host page.
 *
 * Three things happen here and nowhere else: the visitor is asked before
 * anything that commits, the action is performed against the element the
 * reference resolves to, and the turn is told what actually happened.
 *
 * Every path answers the waiting call exactly once. A refusal, a decline, a
 * click that changed nothing — all of them are answers, because the one
 * thing the agent must never do is fill a silence with a success.
 */
export function AgentChatPageActions() {
  const { pageEffects, replyToPageCall, requestPageActionConsent } =
    useAgentChatUi();
  const handledRef = useRef(new Set<string>());

  useEffect(() => {
    const handled = handledRef.current;
    for (const effect of pageEffects) {
      if (effect.type !== 'act-on-page' || handled.has(effect.key)) continue;
      handled.add(effect.key);
      while (handled.size > MAX_HANDLED_ACTIONS) {
        const oldest = handled.values().next().value;
        if (oldest === undefined) break;
        handled.delete(oldest);
      }

      const parsed = actOnPageInputSchema.safeParse(effect.input);
      if (!parsed.success) {
        log.warn('act_on_page: invalid tool input', {
          issues: parsed.error.issues,
        });
        replyToPageCall(effect.callId, 'unsupported');
        continue;
      }
      const { ref, action, value } = parsed.data;

      void (async () => {
        const element = resolveRef(ref);
        if (!element) {
          replyToPageCall(effect.callId, 'gone');
          return;
        }

        if (needsConsent(element, action)) {
          // Named from the PAGE, never from the tool call: the visitor is
          // deciding about the control in front of them, not about a
          // description the agent wrote.
          const allowed = await requestPageActionConsent({
            callId: effect.callId,
            action,
            controlName: accessibleName(element) || 'this control',
          });
          if (!allowed) {
            replyToPageCall(effect.callId, 'declined');
            return;
          }
        }

        const result = await actOnPage({ ref, action, value });
        replyToPageCall(effect.callId, result.outcome, result.detail);
      })();
    }
  }, [pageEffects, replyToPageCall, requestPageActionConsent]);

  return null;
}
