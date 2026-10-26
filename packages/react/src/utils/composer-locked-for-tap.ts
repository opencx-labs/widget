import { isAwaitingRequiredTap } from '@opencx/widget-core';

/**
 * Whether a question answered by tapping (`isAwaitingRequiredTap`) locks the
 * composer now. Never while a reply streams: the live reply hides the messages
 * that land under it, the question included, so the visitor keeps typing and
 * Stop until it ends; then the options show and the lock engages.
 */
export function composerLockedForTap({
  isStreaming,
  messages,
  session,
}: {
  isStreaming: boolean;
  messages: Parameters<typeof isAwaitingRequiredTap>[0];
  session: Parameters<typeof isAwaitingRequiredTap>[1];
}): boolean {
  return !isStreaming && isAwaitingRequiredTap(messages, session);
}
