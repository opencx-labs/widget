import { useSyncExternalStore } from 'react';

/** How often the host URL is re-read for routers that call `pushState` silently. */
const POLL_MS = 500;
/**
 * A host page fires this on its window after changing what `config.context`
 * would resolve to, when nothing in the URL says so (a tab switch inside one
 * page, a record loaded by id). The URL watch below covers route changes on
 * its own.
 */
export const HOST_CONTEXT_CHANGED_EVENT = 'opencx:context-changed';

function hostWindow(): Window | null {
  if (typeof window === 'undefined') return null;
  try {
    // The widget renders inside an iframe of the host page; the host is the
    // top window. Reading its href throws cross-origin, in which case there
    // is nothing to follow.
    const top = window.top ?? window;
    void top.location.href;
    return top;
  } catch {
    return null;
  }
}

function subscribe(notify: () => void): () => void {
  const host = hostWindow();
  if (!host) return () => {};
  const onChange = (event?: Event) => {
    if (event?.type === HOST_CONTEXT_CHANGED_EVENT) notices += 1;
    notify();
  };
  // Back/forward and hash routers announce themselves. `pushState` routers
  // (every SPA framework) do not — the browser fires no event for it — so
  // the URL is also re-read on a slow tick. Patching `history.pushState` on
  // the host page would be the alternative; not ours to touch.
  host.addEventListener('popstate', onChange);
  host.addEventListener('hashchange', onChange);
  host.addEventListener(HOST_CONTEXT_CHANGED_EVENT, onChange);
  const tick = host.setInterval(onChange, POLL_MS);
  return () => {
    host.removeEventListener('popstate', onChange);
    host.removeEventListener('hashchange', onChange);
    host.removeEventListener(HOST_CONTEXT_CHANGED_EVENT, onChange);
    host.clearInterval(tick);
  };
}

// The store's value: the URL, plus a count of explicit change notices so an
// event with no URL change still produces a new snapshot.
let notices = 0;
function snapshot(): string {
  return `${notices}|${hostWindow()?.location.href ?? ''}`;
}

/**
 * A token that changes whenever the host page's situation may have: the
 * visitor navigated without a reload (an SPA route change, back/forward, a
 * hash), or the host fired `opencx:context-changed`. Anything derived from
 * `config.context` that describes "where the visitor is" — the entity pill —
 * keys on it, so it follows the page instead of showing the one the widget
 * was opened on.
 */
export function useHostLocation(): string {
  return useSyncExternalStore(subscribe, snapshot, () => '');
}
