import {
  ConnectionAttemptUnavailableError,
  ConnectionRequestExpiredError,
  type SendMessageInput,
  type WidgetCtx,
} from '@opencx/widget-core';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ConnectionRequest } from './agent-chat-stream';

const POLL_INTERVAL_MS = 2_000;
const ATTEMPT_DEADLINE_MS = 600_000;
const MAX_POLL_BACKOFF_MS = 10_000;

export type ConnectionPhase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'waiting'
  | 'connected'
  | 'external';

type ContinuationKind = 'resume' | 'external' | 'renew' | 'dismiss';

export type ConnectionState = {
  request: ConnectionRequest;
  phase: ConnectionPhase;
  authorization: {
    url: string;
    host: string;
    completion: 'oauth' | 'external';
    attemptId?: string;
  } | null;
  continuation: ContinuationKind | null;
  error: string | null;
  start: () => Promise<void>;
  opened: () => void;
  cancel: () => Promise<void>;
  retryContinuation: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const ConnectionContext = createContext<ConnectionState | null>(null);

const continuationInput = (
  request: ConnectionRequest,
  kind: ContinuationKind,
): SendMessageInput => {
  if (kind === 'dismiss') {
    return {
      content: `Continue without connecting ${request.name}.`,
      connectionRequestId: request.request_id,
    };
  }
  if (kind === 'renew') {
    return {
      background: true,
      connectionRequestId: request.request_id,
      content: `The connection request for ${request.name} expired. Please create a new authorized connection request for ${request.name} and continue my previous request.`,
    };
  }
  if (kind === 'external') {
    return {
      background: true,
      connectionRequestId: request.request_id,
      content: `I returned from setting up ${request.name}. Please try its tools again and continue my previous request.`,
    };
  }
  return {
    background: true,
    connectionRequestId: request.request_id,
    content: `The connection to ${request.name} is ready. Please use its tools to continue my previous request.`,
  };
};

/** Owns one authorization attempt above the card/view lifecycle. */
export function ConnectionAttemptProvider({
  children,
  request,
  widgetCtx,
  onHandled,
}: {
  children: React.ReactNode;
  request: ConnectionRequest | null;
  widgetCtx: WidgetCtx;
  onHandled: (requestId: string) => void;
}) {
  const [phase, setPhase] = useState<ConnectionPhase>('idle');
  const [authorization, setAuthorization] =
    useState<ConnectionState['authorization']>(null);
  const [continuation, setContinuation] = useState<ContinuationKind | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const attemptController = useRef(new AbortController());
  const popup = useRef<Window | null>(null);
  const continuationsInFlight = useRef(new Set<string>());
  const lastContinuation = useRef<ContinuationKind | null>(null);
  const attemptDeadline = useRef<number | null>(null);
  const attemptRequestId = useRef<string | null>(null);
  const active = useRef(true);
  const activeRequestId = useRef(request?.request_id ?? null);
  activeRequestId.current = request?.request_id ?? null;

  const closeAttempt = useCallback(() => {
    attemptController.current.abort();
    popup.current?.close();
    popup.current = null;
  }, []);

  useEffect(() => {
    closeAttempt();
    attemptRequestId.current = null;
    attemptDeadline.current = null;
    lastContinuation.current = null;
    setPhase('idle');
    setAuthorization(null);
    setContinuation(null);
    setError(null);
    return closeAttempt;
  }, [closeAttempt, request?.request_id, request?.server_id, widgetCtx]);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      closeAttempt();
    };
  }, [closeAttempt]);

  const sendContinuation = useCallback(
    async (kind: ContinuationKind) => {
      if (!request) return;
      const requestId = request.request_id;
      if (continuationsInFlight.current.has(requestId)) return;
      continuationsInFlight.current.add(requestId);
      lastContinuation.current = kind;
      setContinuation(kind);
      setError(null);
      let accepted = false;
      try {
        await widgetCtx.messageCtx.sendMessage({
          ...continuationInput(request, kind),
          onAccepted: () => {
            accepted = true;
            onHandled(request.request_id);
          },
        });
        if (
          active.current &&
          activeRequestId.current === requestId &&
          !accepted
        ) {
          setError(
            kind === 'renew'
              ? 'Could not request a new connection. Try again.'
              : 'Could not continue your request. Try again.',
          );
        }
      } catch {
        if (active.current && activeRequestId.current === requestId) {
          setError(
            kind === 'renew'
              ? 'Could not request a new connection. Try again.'
              : 'Could not continue your request. Try again.',
          );
        }
      } finally {
        continuationsInFlight.current.delete(requestId);
        if (active.current && activeRequestId.current === requestId) {
          setContinuation(null);
        }
      }
    },
    [onHandled, request, widgetCtx],
  );

  const start = useCallback(async () => {
    if (!request) return;
    closeAttempt();
    attemptRequestId.current = request.request_id;
    attemptController.current = new AbortController();
    const { signal } = attemptController.current;
    setPhase('loading');
    lastContinuation.current = null;
    setAuthorization(null);
    setError(null);
    try {
      // Open synchronously so the user's click survives the API round trip.
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
      ) {
        throw new Error('Invalid connection page');
      }
      setAuthorization({
        url: url.href,
        host: url.host,
        completion: result.completion,
        ...(result.completion === 'oauth'
          ? { attemptId: result.attempt_id }
          : {}),
      });
      attemptDeadline.current = Date.now() + ATTEMPT_DEADLINE_MS;
      if (popup.current?.closed) {
        popup.current = null;
        setPhase('ready');
      } else if (popup.current) {
        popup.current.location.replace(url.href);
        setPhase('waiting');
      } else {
        // A blocked popup leaves one direct Connect link, using this attempt.
        setPhase('ready');
      }
    } catch (cause) {
      if (signal.aborted) return;
      popup.current?.close();
      popup.current = null;
      setAuthorization(null);
      setPhase('idle');
      if (cause instanceof ConnectionRequestExpiredError) {
        await sendContinuation('renew');
        return;
      }
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not start the connection.',
      );
    }
  }, [closeAttempt, request, sendContinuation, widgetCtx]);

  useEffect(() => {
    if (
      (phase !== 'waiting' && phase !== 'ready') ||
      !authorization ||
      !request
    ) {
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline =
      attemptDeadline.current ?? Date.now() + ATTEMPT_DEADLINE_MS;
    attemptDeadline.current = deadline;
    let consecutiveErrors = 0;
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

    const fail = (message: string) => {
      controller.abort();
      popup.current?.close();
      popup.current = null;
      setError(message);
      setPhase('idle');
    };
    const deadlineTimer = setTimeout(
      () => fail('Connection timed out. Try again.'),
      Math.max(0, deadline - Date.now()),
    );
    const schedule = (delay = POLL_INTERVAL_MS) => {
      timer = setTimeout(check, delay);
    };
    const check = async () => {
      if (Date.now() >= deadline) {
        fail('Connection timed out. Try again.');
        return;
      }
      if (authorization.completion === 'external') {
        // Returning only triggers a tool retry. It never proves downstream access.
        if (popup.current?.closed || returned) {
          setPhase('external');
          return;
        }
        schedule();
        return;
      }
      if (!authorization.attemptId) {
        fail('Could not read the connection attempt. Try again.');
        return;
      }
      try {
        const status = await widgetCtx.api.getConnectionAttempt(
          request.server_id,
          authorization.attemptId,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        consecutiveErrors = 0;
        if (status === 'connected') {
          popup.current?.close();
          popup.current = null;
          setPhase('connected');
          return;
        }
        if (status === 'canceled') {
          fail('Connection was canceled. Try again.');
          return;
        }
        if (status === 'failed') {
          fail('Connection approval failed. Try again.');
          return;
        }
        if (status === 'expired') {
          fail('Connection attempt expired. Try again.');
          return;
        }
        if (popup.current?.closed) {
          popup.current = null;
          setPhase('ready');
        }
        schedule();
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (cause instanceof ConnectionAttemptUnavailableError) {
          fail(cause.message);
          return;
        }
        consecutiveErrors += 1;
        schedule(
          Math.min(
            POLL_INTERVAL_MS * 2 ** (consecutiveErrors - 1),
            MAX_POLL_BACKOFF_MS,
          ),
        );
      }
    };
    void check();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
      if (deadlineTimer) clearTimeout(deadlineTimer);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', enter);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [authorization, phase, request, widgetCtx]);

  useEffect(() => {
    if (
      (phase !== 'connected' && phase !== 'external') ||
      attemptRequestId.current !== request?.request_id
    ) {
      return;
    }
    void sendContinuation(phase === 'external' ? 'external' : 'resume');
  }, [phase, request?.request_id, sendContinuation]);

  const opened = useCallback(() => setPhase('waiting'), []);
  const cancel = useCallback(async () => {
    closeAttempt();
    setAuthorization(null);
    setPhase('idle');
    await sendContinuation('dismiss');
  }, [closeAttempt, sendContinuation]);
  const retryContinuation = useCallback(async () => {
    const retryKind = lastContinuation.current;
    if (retryKind) {
      await sendContinuation(retryKind);
      return;
    }
    await start();
  }, [sendContinuation, start]);

  const connection = useMemo<ConnectionState | null>(
    () =>
      request
        ? {
            request,
            phase,
            authorization,
            continuation,
            error,
            start,
            opened,
            cancel,
            retryContinuation,
            disconnect: () =>
              widgetCtx.api.disconnectConnection(request.server_id),
          }
        : null,
    [
      authorization,
      cancel,
      continuation,
      error,
      opened,
      phase,
      request,
      retryContinuation,
      start,
      widgetCtx,
    ],
  );

  return React.createElement(
    ConnectionContext.Provider,
    {
      value: connection,
    },
    children,
  );
}

/** Re-exposes an already-owned controller across a companion workspace boundary. */
export function ConnectionControllerProvider({
  children,
  connection,
}: {
  children: React.ReactNode;
  connection: ConnectionState | null;
}) {
  return React.createElement(
    ConnectionContext.Provider,
    { value: connection },
    children,
  );
}

/** Reads the active controller without requiring a connection request. */
export function useConnectionController(): ConnectionState | null {
  return useContext(ConnectionContext);
}

/** Reads the provider-owned attempt; rendering the card never owns cleanup. */
export function useConnection(request: ConnectionRequest): ConnectionState {
  const connection = useContext(ConnectionContext);
  if (!connection || connection.request.request_id !== request.request_id) {
    throw new Error(
      'useConnection must be used for the active ConnectionAttemptProvider request',
    );
  }
  return connection;
}
