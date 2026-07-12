import { useEffect, useState } from 'react';

/**
 * Companion and sidebar mount at the document root: <Widget> may render
 * arbitrarily deep in the host app (shadow roots, transformed or
 * stacking-context ancestors) where position:fixed breaks. Root-level
 * mounting is the same guarantee the embed script provides.
 *
 * The mount point must sit ABOVE body, not in it: sidebar mode turns body
 * into the page frame (contain: strict — see app-frame.ts), and
 * containment would trap body-portaled fixed elements inside the framed
 * page.
 *
 * It also can't be document.documentElement itself: React 19 treats
 * <html>/<head>/<body> as singleton host components, and a portal whose
 * container is the <html> singleton gets its children redirected into
 * body (observed under Next.js App Router, where React renders the whole
 * document) — right back inside the containment. So we create our OWN
 * div, append it to <html> with raw DOM (which browsers honor and no
 * framework touches), and portal into that.
 */
export function useHostPortal(): HTMLElement | null {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const host = document.createElement('div');
    host.setAttribute('data-opencx-root', '');
    // Layout-neutral: children are position:fixed; the wrapper itself must
    // never add a box to <html>'s flow.
    host.style.display = 'contents';
    document.documentElement.appendChild(host);
    setTarget(host);
    return () => {
      host.remove();
      setTarget(null);
    };
  }, []);
  return target;
}
