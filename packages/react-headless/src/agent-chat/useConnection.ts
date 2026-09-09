import { useCallback, useEffect, useRef, useState } from 'react';
import { useWidget } from '../WidgetProvider';
import type { ConnectionRequest } from './agent-chat-stream';

/** Starts authorization on a user gesture; the server remains the authority on access. */
export function useConnection(
  request: Pick<ConnectionRequest, 'server_id'> & Partial<ConnectionRequest>,
) {
  const { widgetCtx, config } = useWidget();
  const [phase, setPhase] = useState<
    'idle' | 'loading' | 'ready' | 'waiting' | 'connected' | 'external'
  >('idle');
  const [authorization, setAuthorization] = useState<{
    url: string;
    host: string;
    completion: 'oauth' | 'external';
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lifecycle = useRef(new AbortController());
  const popup = useRef<Window | null>(null);

  useEffect(() => {
    lifecycle.current = new AbortController();
    setPhase('idle');
    setAuthorization(null);
    setError(null);
    const controller = lifecycle.current;
    return () => {
      controller.abort();
      popup.current?.close();
      popup.current = null;
    };
  }, [widgetCtx, config.user?.token, request.server_id, request.request_id]);

  const start = useCallback(async () => {
    const signal = lifecycle.current.signal;
    setPhase('loading');
    setAuthorization(null);
    setError(null);
    try {
      // Open synchronously so the user's click survives the API round trip.
      popup.current?.close();
      popup.current = window.open('about:blank', '_blank');
      if (popup.current) popup.current.opener = null;
      const result = await widgetCtx.api.startConnection(
        request.server_id,
        request.request_id,
        signal,
      );
      if (signal.aborted) return;
      const url = new URL(result.authorization_url);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error('Invalid connection page');
      setAuthorization({
        url: url.href,
        host: url.host,
        completion: result.completion,
      });
      if (popup.current?.closed) {
        setPhase('idle');
      } else if (popup.current) {
        popup.current.location.replace(url.href);
        setPhase('waiting');
      } else {
        // A blocked popup leaves one direct Connect link, using the same request.
        setPhase('ready');
      }
    } catch (error) {
      if (signal.aborted) return;
      popup.current?.close();
      popup.current = null;
      setError(
        error instanceof Error
          ? error.message
          : 'Could not start the connection.',
      );
      setPhase('idle');
    }
  }, [widgetCtx, request.server_id, request.request_id]);

  useEffect(() => {
    if (phase !== 'waiting' || !authorization) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 600_000;
    let left = document.hidden || !document.hasFocus();
    let returned = false;
    const leave = () => {
      left = true;
    };
    const enter = () => {
      if (left) returned = true;
    };
    const visibility = () => (document.hidden ? leave() : enter());
    window.addEventListener('blur', leave);
    window.addEventListener('focus', enter);
    document.addEventListener('visibilitychange', visibility);
    const check = async () => {
      try {
        if (authorization.completion === 'external') {
          // Returning only triggers a tool retry. It never proves downstream access.
          if (popup.current?.closed || returned) {
            setPhase('external');
            return;
          }
        } else {
          const connections = await widgetCtx.api.listConnections(
            controller.signal,
          );
          if (controller.signal.aborted) return;
          if (
            connections.some(
              (entry) =>
                entry.server_id === request.server_id &&
                entry.status === 'connected',
            )
          ) {
            popup.current?.close();
            setPhase('connected');
            return;
          }
          if (popup.current?.closed) {
            setPhase('idle');
            return;
          }
        }
        if (Date.now() >= deadline)
          throw new Error('Connection timed out. Try again.');
        timer = setTimeout(check, 2000);
      } catch (error) {
        if (controller.signal.aborted) return;
        setError(
          error instanceof Error
            ? error.message
            : 'Could not check the connection.',
        );
        setPhase('idle');
      }
    };
    void check();
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', enter);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [
    phase,
    authorization,
    widgetCtx,
    config.user?.token,
    request.server_id,
    request.request_id,
  ]);

  return {
    phase,
    authorization,
    error,
    start,
    opened: () => setPhase('waiting'),
    disconnect: () => widgetCtx.api.disconnectConnection(request.server_id),
  };
}
