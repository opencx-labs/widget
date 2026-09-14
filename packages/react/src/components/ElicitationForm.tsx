import React, { useEffect, useState } from 'react';
import { useWidget } from '@opencx/widget-react-headless';
import type {
  ElicitationRequest,
  ElicitationResponse,
} from '@opencx/widget-core';
import { X } from 'lucide-react';
import { McpIcon } from './lib/McpIcon';
import { Button } from './lib/button';

export function ElicitationForm({
  sessionId,
  active,
}: {
  sessionId: string;
  active: boolean;
}) {
  const { widgetCtx, config } = useWidget();
  const [pending, setPending] = useState<ElicitationRequest | null>(null);
  useEffect(() => {
    setPending(null);
    if (!active || config.capabilities?.connections === false) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const requests = await widgetCtx.api.listElicitations(
          sessionId,
          controller.signal,
        );
        if (!controller.signal.aborted) setPending(requests[0] ?? null);
      } catch {
        setPending((current) =>
          current && current.expiresAt > Date.now() ? current : null,
        );
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [widgetCtx, sessionId, active, config.capabilities?.connections]);
  return (
    <>
      {' '}
      {pending && pending.expiresAt > Date.now() ? (
        <RequestForm
          key={pending.id}
          request={pending}
          onAnswer={async (answer) => {
            await widgetCtx.api.answerElicitation(
              sessionId,
              pending.id,
              answer,
            );
            setPending(null);
          }}
        />
      ) : null}
    </>
  );
}

export function RequestForm({
  request,
  onAnswer,
}: {
  request: ElicitationRequest;
  onAnswer: (answer: ElicitationResponse) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const respond = async (answer: ElicitationResponse) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onAnswer(answer);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not submit. Try again.',
      );
    } finally {
      setBusy(false);
    }
  };
  const fields = request.form.requestedSchema.properties;
  const approval =
    Object.keys(fields).length === 1 &&
    fields.approve?.type === 'boolean' &&
    request.form.requestedSchema.required?.includes('approve');
  const inputClass =
    'w-full rounded-lg border border-foreground/15 bg-background px-2 py-1.5 text-base sm:text-sm';
  return (
    <form
      aria-label={`Request from ${request.serverName}`}
      className={`px-2 py-2 space-y-2 text-foreground ${approval ? 'overflow-visible' : 'max-h-[50vh] overflow-y-auto'}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (approval) {
          void respond({ action: 'accept', content: { approve: true } });
          return;
        }
        const data = new FormData(event.currentTarget);
        const content: NonNullable<ElicitationResponse['content']> = {};
        for (const [name, field] of Object.entries(fields)) {
          const value = data.get(name);
          if (field.type === 'boolean') content[name] = value === 'on';
          else if (field.type === 'array') {
            const selected = data
              .getAll(name)
              .filter((item): item is string => typeof item === 'string');
            if (
              field.minItems !== undefined &&
              selected.length < field.minItems
            ) {
              setError(
                `${field.title ?? name}: select at least ${field.minItems} options.`,
              );
              return;
            }
            if (
              field.maxItems !== undefined &&
              selected.length > field.maxItems
            ) {
              setError(
                `${field.title ?? name}: select no more than ${field.maxItems} options.`,
              );
              return;
            }
            content[name] = selected;
          } else if (typeof value === 'string' && value !== '')
            content[name] =
              field.type === 'number' || field.type === 'integer'
                ? Number(value)
                : value;
        }
        void respond({ action: 'accept', content });
      }}
    >
      <div className="flex items-start gap-2">
        <div
          className="mt-0.5 size-4 shrink-0 text-foreground/50"
          title={request.serverName}
        >
          <McpIcon />
        </div>
        <p className="min-w-0 flex-1 text-sm leading-5 break-words">
          {request.form.message}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-foreground/50"
          wobble={false}
          aria-label="Cancel request"
          disabled={busy}
          onClick={() => void respond({ action: 'cancel' })}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {!approval && (
        <fieldset disabled={busy} className="space-y-3">
          {Object.entries(fields).map(([name, field]) => {
            const id = `${request.id}-${name}`;
            const choices =
              field.oneOf ??
              field.enum?.map((value) => ({ const: value, title: value })) ??
              field.items?.anyOf ??
              field.items?.enum?.map((value) => ({
                const: value,
                title: value,
              }));
            const required =
              request.form.requestedSchema.required?.includes(name);
            return (
              <div key={name}>
                <label htmlFor={id} className="block text-sm font-medium mb-1">
                  {field.title ?? name}
                  {required ? ' *' : ''}
                </label>
                {field.description && (
                  <p className="text-sm text-foreground/60 mb-1">
                    {field.description}
                  </p>
                )}
                {field.type === 'boolean' ? (
                  <input
                    id={id}
                    name={name}
                    type="checkbox"
                    defaultChecked={field.default === true}
                    className="size-5 accent-current"
                  />
                ) : choices ? (
                  <select
                    id={id}
                    name={name}
                    multiple={field.type === 'array'}
                    required={required}
                    className={inputClass}
                    defaultValue={
                      typeof field.default === 'string' ||
                      Array.isArray(field.default)
                        ? field.default
                        : field.type === 'array'
                          ? []
                          : ''
                    }
                  >
                    {field.type !== 'array' && (
                      <option value="">Choose…</option>
                    )}
                    {choices.map((choice) => (
                      <option key={choice.const} value={choice.const}>
                        {choice.title ?? choice.const}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    name={name}
                    className={inputClass}
                    type={
                      field.type === 'number' || field.type === 'integer'
                        ? 'number'
                        : field.format === 'email'
                          ? 'email'
                          : field.format === 'uri'
                            ? 'url'
                            : field.format === 'date'
                              ? 'date'
                              : 'text'
                    }
                    required={required}
                    min={field.minimum}
                    max={field.maximum}
                    step={field.type === 'integer' ? 1 : 'any'}
                    minLength={field.minLength}
                    maxLength={field.maxLength}
                    defaultValue={
                      typeof field.default === 'string' ||
                      typeof field.default === 'number'
                        ? field.default
                        : ''
                    }
                  />
                )}
              </div>
            );
          })}
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 pl-6">
        <Button
          type="submit"
          size="sm"
          className="h-7 rounded-lg px-2.5 py-0 text-xs"
          wobble={false}
          disabled={busy}
        >
          {busy ? 'Submitting…' : approval ? 'Approve once' : 'Submit'}
        </Button>
        {approval && request.approvalKey && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 rounded-lg px-2.5 py-0 text-xs"
            wobble={false}
            disabled={busy}
            title="Allow the same tool, account and inputs. Reset anytime."
            onClick={() =>
              void respond({
                action: 'accept',
                content: { approve: true },
                remember: true,
              })
            }
          >
            Always allow
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-lg px-2.5 py-0 text-xs"
          wobble={false}
          disabled={busy}
          onClick={() => void respond({ action: 'decline' })}
        >
          Decline
        </Button>
      </div>
    </form>
  );
}
