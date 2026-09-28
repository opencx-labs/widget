import React, { useLayoutEffect, useRef, useState } from 'react';
import { usePrimitiveState, useWidget } from '@opencx/widget-react-headless';

/** Private report links use session authentication without exposing it in a URL. */
export function WorkspaceDownloadLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { widgetCtx } = useWidget();
  const { session } = usePrimitiveState(widgetCtx.sessionCtx.sessionState);
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useLayoutEffect(() => {
    setBusy(false);
    setError(null);
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, [widgetCtx, session?.id, href]);

  const download = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (pending.current || !session) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(null);
    try {
      const file = await widgetCtx.api.downloadWorkspaceFile(
        href,
        session.id,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      if (widgetCtx.sessionCtx.sessionState.get().session?.id !== session.id)
        return;
      const url = URL.createObjectURL(file.blob);
      const revoke = URL.revokeObjectURL.bind(URL);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        // Give the browser time to start saving, then release the local bytes.
        setTimeout(() => revoke(url), 1000);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not download this file.',
        );
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  };

  return (
    <>
      <a
        href={href}
        className={className}
        onClick={download}
        aria-disabled={busy || !session}
        aria-busy={busy}
      >
        {children}
      </a>
      {busy && <span role="status"> Downloading…</span>}
      {error && <span role="alert"> {error}</span>}
    </>
  );
}
