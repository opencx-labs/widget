import {
  useConnection,
  useMessages,
  type ConnectionRequest,
} from '@opencx/widget-react-headless';
import { X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from './lib/button';
import { BrailleSpinner } from './lib/BrailleSpinner';
import { Avatar, AvatarFallback, AvatarImage } from './lib/avatar';
import { McpIcon } from './lib/McpIcon';

export function ConnectionCard({
  request,
  onContinue,
  onDismiss,
  reconnect = false,
  logoUrl,
}: {
  request: Omit<ConnectionRequest, 'request_id'> & { request_id?: string };
  onContinue?: () => void;
  onDismiss?: () => void;
  reconnect?: boolean;
  /** Optional server logo; missing or failed images use the MCP mark. */
  logoUrl?: string;
}) {
  const connection = useConnection(request);
  const { sendMessage } = useMessages();
  const submitted = useRef(false);
  const [dismissed, setDismissed] = useState(false);
  const reply = (content: string) => {
    if (submitted.current) return;
    submitted.current = true;
    setDismissed(true);
    sendMessage({ content });
  };
  const { phase, authorization, error } = connection;
  useEffect(() => {
    if ((phase !== 'connected' && phase !== 'external') || submitted.current)
      return;
    submitted.current = true;
    setDismissed(true);
    if (onContinue) onContinue();
    else
      sendMessage({
        background: true,
        content:
          phase === 'connected'
            ? `The connection to ${request.name} is ready. Please use its tools to continue my previous request.`
            : `I returned from setting up ${request.name}. Please try its tools again and continue my previous request.`,
      });
  }, [phase, onContinue, sendMessage, request.name]);
  if (dismissed) return null;
  const busy = phase === 'loading' || phase === 'waiting';
  const status =
    phase === 'waiting'
      ? 'Waiting for approval'
      : phase === 'loading'
        ? 'Preparing connection'
        : phase === 'connected'
          ? 'Connected'
          : reconnect
            ? 'Access expired'
            : 'Not connected';
  return (
    <section
      aria-label={`${reconnect ? 'Reconnect' : 'Connect'} ${request.name}`}
      data-component="chat/connection"
      className="min-w-0 rounded-2xl border border-foreground/10 bg-background p-2 text-foreground"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Avatar className="size-5 rounded-none bg-transparent">
          <AvatarImage
            src={logoUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="object-contain"
          />
          <AvatarFallback className="rounded-none">
            <McpIcon />
          </AvatarFallback>
        </Avatar>
        <p
          className="min-w-0 flex-1 truncate text-sm font-medium"
          title={authorization?.host ?? request.name}
        >
          {request.name}
        </p>
        <span role="status" aria-live="polite" className="sr-only">
          {request.name}: {status}
        </span>
        {(phase === 'idle' || busy) && (
          <Button
            type="button"
            size="sm"
            className="h-8 px-3 text-sm"
            disabled={busy}
            aria-busy={busy}
            title={
              reconnect
                ? 'Your access expired. Connect again to continue.'
                : undefined
            }
            onClick={() => void connection.start()}
          >
            {busy && <BrailleSpinner />}
            {phase === 'loading'
              ? 'Preparing…'
              : phase === 'waiting'
                ? 'Waiting…'
                : error
                  ? 'Try again'
                  : reconnect
                    ? 'Reconnect'
                    : 'Connect'}
          </Button>
        )}
        {phase === 'ready' && authorization && (
          <Button asChild size="sm" className="h-8 px-3 text-sm">
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
        )}
        {phase !== 'connected' && (
          <Button
            type="button"
            variant="ghost"
            size="fit"
            className="size-8 p-0 text-muted-foreground"
            aria-label="Not now"
            title="Not now"
            onClick={() =>
              onDismiss
                ? onDismiss()
                : reply(`Continue without connecting ${request.name}.`)
            }
          >
            <X className="size-4" aria-hidden />
          </Button>
        )}
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
