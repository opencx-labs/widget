import {
  useAgentChatUi,
  type PendingPageAction,
} from '@opencx/widget-react-headless';
import React from 'react';
import { Button } from './lib/button';

/** What the agent is about to do, said plainly. */
const VERBS: Record<string, string> = {
  click: 'click',
  fill: 'type into',
  select: 'change',
  check: 'switch on',
  uncheck: 'switch off',
};

/**
 * The moment the visitor decides.
 *
 * It names the control — the control's own name, read off their page, not
 * anything the agent wrote — because "Allow this action?" is a question
 * nobody reads, and "Allow the agent to click Cancel subscription?" is a
 * question everybody reads.
 *
 * One chip at a time, and No is final: the agent is told it was declined
 * and does not get to ask again or reach the same control another way.
 */
export function PageActionCard({ request }: { request: PendingPageAction }) {
  const { resolvePageAction } = useAgentChatUi();
  const verb = VERBS[request.action] ?? request.action;

  return (
    <section
      aria-label={`Allow the agent to ${verb} ${request.controlName}`}
      data-component="chat/page_action"
      className="min-w-0 rounded-2xl border border-foreground/10 bg-background p-2 text-foreground"
    >
      <p className="px-1 pb-2 text-sm">
        Let the agent {verb}{' '}
        <span className="font-medium">{request.controlName}</span> on this page?
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          onClick={() => resolvePageAction(request.callId, true)}
        >
          Allow
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => resolvePageAction(request.callId, false)}
        >
          No
        </Button>
      </div>
    </section>
  );
}
