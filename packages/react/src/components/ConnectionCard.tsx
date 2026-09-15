import {
  useConnection,
  type ConnectionRequest,
} from '@opencx/widget-react-headless';
import React from 'react';
import { Button } from './lib/button';
import { BrailleSpinner } from './lib/BrailleSpinner';
import { McpIcon } from './lib/McpIcon';

export function ConnectionCard({ request }: { request: ConnectionRequest }) {
  const connection = useConnection(request);
  const { phase, authorization, continuation, error } = connection;
  const starting = phase === 'loading' || phase === 'waiting';
  const busy = starting || continuation !== null;
  const finished = phase === 'connected' || phase === 'external';
  const expired = error?.toLowerCase().includes('expired') ?? false;
  const status = continuation
    ? continuation === 'renew'
      ? 'Preparing a new connection request'
      : 'Continuing your request'
    : phase === 'waiting'
      ? 'Waiting for approval'
      : phase === 'loading'
        ? 'Preparing connection'
        : phase === 'connected'
          ? 'Connected'
          : phase === 'external'
            ? 'Setup page completed'
            : 'Not connected';
  const actionLabel = continuation
    ? continuation === 'renew'
      ? 'Requesting…'
      : 'Continuing…'
    : phase === 'loading'
      ? 'Preparing…'
      : phase === 'waiting'
        ? 'Waiting…'
        : expired
          ? 'Reconnect'
          : error
            ? 'Try again'
            : finished
              ? 'Continue'
              : 'Connect';
  const action = () =>
    error || finished ? connection.retryContinuation() : connection.start();

  return (
    <section
      aria-label={`Connect ${request.name}`}
      data-component="chat/connection"
      className="min-w-0 rounded-2xl border border-foreground/10 bg-background p-2 text-foreground"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary p-2">
          <McpIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium"
            title={authorization?.host ?? request.name}
          >
            {request.name}
          </p>
          <p className="text-xs text-muted-foreground">
            Connect your account to continue.
          </p>
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {request.name}: {status}
        </p>
        {phase === 'ready' && authorization && !continuation ? (
          <Button
            asChild
            wobble={false}
            size="sm"
            className="h-7 shrink-0 px-2.5 text-xs order-2"
          >
            <a
              href={authorization.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={connection.opened}
              aria-label={`Connect on ${authorization.host} (opens in a new tab)`}
            >
              Connect
            </a>
          </Button>
        ) : (
          <Button
            type="button"
            wobble={false}
            size="sm"
            className="h-7 shrink-0 px-2.5 text-xs order-2"
            disabled={busy}
            aria-busy={busy}
            title={
              expired
                ? 'Your access expired. Connect again to continue.'
                : undefined
            }
            onClick={() => void action()}
          >
            {busy && <BrailleSpinner />}
            {actionLabel}
          </Button>
        )}
        <Button
          type="button"
          wobble={false}
          variant="ghost"
          size="fit"
          className="h-7 shrink-0 px-2 text-xs order-1"
          aria-label="Not now"
          title="Not now"
          disabled={continuation !== null}
          onClick={() => void connection.cancel()}
        >
          Not now
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="px-1 pt-2 text-sm text-pretty text-destructive"
        >
          {error}
        </p>
      )}
    </section>
  );
}
