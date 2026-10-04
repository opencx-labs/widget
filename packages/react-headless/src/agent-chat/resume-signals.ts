/**
 * Calls `onSignal` when a browser tab is visible again after being hidden, or
 * the network comes back while it is visible: the moments a dropped stream
 * can be resumed. Returns the unsubscribe.
 *
 * Hosts without a DOM (React Native has no `document`, and its `window` has
 * no `addEventListener`) get a no-op; they call `resumeInterruptedTurn` from
 * their own app-state and network listeners instead.
 */
export function subscribeToResumeSignals(onSignal: () => void): () => void {
  if (
    typeof document === 'undefined' ||
    typeof window === 'undefined' ||
    typeof window.addEventListener !== 'function'
  )
    return () => {};
  const onEvent = () => {
    if (document.visibilityState === 'visible') onSignal();
  };
  document.addEventListener('visibilitychange', onEvent);
  window.addEventListener('online', onEvent);
  return () => {
    document.removeEventListener('visibilitychange', onEvent);
    window.removeEventListener('online', onEvent);
  };
}
