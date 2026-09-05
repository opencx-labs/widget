import type {
  WidgetMessageU,
  WidgetSystemMessage__CsatRequestCancelled,
  WidgetSystemMessage__CsatRequested,
  WidgetSystemMessage__CsatSubmitted,
} from '../types/messages';

export type CsatState = {
  csatRequestedMessage: WidgetSystemMessage__CsatRequested | undefined;
  csatSubmittedMessage: WidgetSystemMessage__CsatSubmitted | undefined;
  /** The picker is live: requested, not answered, and not voided since. */
  isCsatRequested: boolean;
  /** Answered. Wins over everything else regardless of order. */
  isCsatSubmitted: boolean;
  /** Voided after the latest request and never answered. */
  isCsatCancelled: boolean;
  submittedScore: number | null | undefined;
  submittedFeedback: string | null | undefined;
};

/**
 * CSAT state is a fold over the session's system events, in order:
 *
 * - `csat_submitted` anywhere → submitted. A cancellation after an answer is a
 *   server-side no-op, so it never un-submits.
 * - otherwise the LATEST of `csat_requested` / `csat_request_cancelled`
 *   decides: a cancel voids the request before it, a later re-request revives
 *   the picker.
 */
export function deriveCsatState(messages: WidgetMessageU[]): CsatState {
  const csatRequestedMessage = messages.find(
    (message): message is WidgetSystemMessage__CsatRequested =>
      message.type === 'SYSTEM' && message.subtype === 'csat_requested',
  );
  const csatSubmittedMessage = messages.findLast(
    (message): message is WidgetSystemMessage__CsatSubmitted =>
      message.type === 'SYSTEM' && message.subtype === 'csat_submitted',
  );
  const latestRequestOrCancel = messages.findLast(
    (
      message,
    ): message is
      | WidgetSystemMessage__CsatRequested
      | WidgetSystemMessage__CsatRequestCancelled =>
      message.type === 'SYSTEM' &&
      (message.subtype === 'csat_requested' ||
        message.subtype === 'csat_request_cancelled'),
  );

  const isCsatSubmitted = !!csatSubmittedMessage;

  return {
    csatRequestedMessage,
    csatSubmittedMessage,
    isCsatRequested:
      !isCsatSubmitted && latestRequestOrCancel?.subtype === 'csat_requested',
    isCsatSubmitted,
    isCsatCancelled:
      !isCsatSubmitted &&
      latestRequestOrCancel?.subtype === 'csat_request_cancelled',
    submittedScore: csatSubmittedMessage?.data.payload.score,
    submittedFeedback: csatSubmittedMessage?.data.payload.feedback,
  };
}
