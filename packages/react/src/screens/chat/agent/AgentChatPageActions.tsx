import { log } from '@opencx/widget-core';
import { useAgentChatUi, useWidget } from '@opencx/widget-react-headless';
import { useEffect, useRef } from 'react';
import { actOnPage } from '../../../page-controls/act';
import { travelTo } from '../../../page-controls/cursor';
import { actOnPageInputSchema } from '../../../page-controls/act-input';
import { accessibleName } from '../../../page-controls/accessible-name';
import { captureActionMeaning } from '../../../page-controls/action-meaning';
import { resolveRef } from '../../../page-controls/control-ref';
import { readPageControls } from '../../../page-controls/read-controls';
import { resolveSelectOption } from '../../../page-controls/select-option';
import { usePageEffectIsCurrent } from './use-page-effect-is-current';

const MAX_HANDLED_ACTIONS = 200;

/**
 * The agent's hands on the host page.
 *
 * Three things happen here and nowhere else: the visitor is asked before
 * every action, the action is performed against the element the
 * reference resolves to, and the turn is told what actually happened.
 *
 * Every path answers the waiting call exactly once. A refusal, a decline, a
 * click that changed nothing — all of them are answers, because the one
 * thing the agent must never do is fill a silence with a success.
 */
export function AgentChatPageActions() {
  const { widgetCtx } = useWidget();
  const {
    pageEffects,
    replyToPageCall,
    requestPageActionConsent,
    isStreaming,
  } = useAgentChatUi();
  const handledRef = useRef(new Set<string>());
  const isCurrent = usePageEffectIsCurrent(pageEffects, isStreaming);

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
        let cursor: Awaited<ReturnType<typeof travelTo>> | undefined;
        try {
          const enabled = () =>
            isCurrent(effect.key) &&
            widgetCtx.features.pageContext &&
            widgetCtx.features.clientTools &&
            widgetCtx.features.pageActions;
          if (!enabled()) {
            replyToPageCall(effect.callId, 'declined');
            return;
          }
          const element = resolveRef(ref);
          if (!element) {
            replyToPageCall(effect.callId, 'gone');
            return;
          }

          // Any control can commit through host JavaScript, including fields
          // that auto-save. Labels and form markup cannot establish safety.
          // Name the actual page control and show the proposed value.
          const consentName = accessibleName(element) || 'this control';
          const option =
            action === 'select' ? resolveSelectOption(element, value) : null;
          if (action === 'select' && !option) {
            replyToPageCall(
              effect.callId,
              'no_change',
              'That option is unavailable or ambiguous.',
            );
            return;
          }
          const optionValue = option?.value;
          const optionLabel = option?.label.trim();
          const hasSameMeaning = captureActionMeaning(element);
          const consentIsCurrent = () =>
            enabled() &&
            hasSameMeaning() &&
            consentName === (accessibleName(element) || 'this control') &&
            (!option ||
              (resolveSelectOption(element, value) === option &&
                option.value === optionValue &&
                option.label.trim() === optionLabel));
          const allowed = await requestPageActionConsent({
            callId: effect.callId,
            action,
            controlName: consentName,
            ...(action === 'fill' || action === 'select' ? { value } : {}),
            ...(option ? { valueLabel: optionLabel || '(empty option)' } : {}),
          });
          if (!allowed) {
            replyToPageCall(effect.callId, 'declined');
            return;
          }

          if (!consentIsCurrent()) {
            replyToPageCall(effect.callId, 'declined');
            return;
          }

          // The pointer goes first, and the press lands before the event
          // does. Firing the click while the cursor is still travelling is
          // the one thing that makes this read as fake: the page would move
          // before the hand got there.
          cursor = await travelTo(element, { press: true });

          if (!consentIsCurrent()) {
            replyToPageCall(effect.callId, 'declined');
            return;
          }
          const result = await actOnPage({
            ref,
            action,
            value,
            consentIsCurrent,
          });

          // Read the page again and send it back with the outcome. An action
          // often lands the visitor somewhere else, and an agent holding
          // references to the screen it just left can only ask them to send
          // another message — which is not a flow.
          const after =
            enabled() && result.outcome === 'done' ? readPageControls() : null;
          replyToPageCall(
            effect.callId,
            result.outcome,
            result.detail,
            after
              ? { controls: after.controls, truncated: after.truncated }
              : undefined,
          );
        } catch {
          replyToPageCall(
            effect.callId,
            'unsupported',
            'The page action could not be completed.',
          );
        } finally {
          cursor?.done();
        }
      })();
    }
  }, [
    pageEffects,
    replyToPageCall,
    requestPageActionConsent,
    widgetCtx,
    isCurrent,
  ]);

  return null;
}
