import { ArrowUpIcon, XIcon } from 'lucide-react';
import React from 'react';
import type { CtaButton, CtaConfig } from '@opencx/widget-core';
import { cn } from './components/lib/utils/cn';
import { dc } from './utils/data-component';

export type CtaCardProps = {
  cta: CtaConfig;
  onButtonClick: (button: CtaButton, index: number) => void;
  onComposerSubmit: (text: string) => void;
  onDismiss: () => void;
};

/**
 * Purely presentational CTA/teaser card. All visibility rules, persistence,
 * and widget wiring live in `CtaContainer` — this component only renders the
 * configured content and reports interactions upward.
 */
export function CtaCard({
  cta,
  onButtonClick,
  onComposerSubmit,
  onDismiss,
}: CtaCardProps) {
  const [draft, setDraft] = React.useState('');

  return (
    <div
      {...dc('cta/root')}
      className={cn(
        'font-sans relative flex flex-col gap-3',
        'bg-background text-foreground',
        'rounded-2xl p-4 shadow-xl',
      )}
    >
      <button
        {...dc('cta/dismiss_btn')}
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className={cn(
          'absolute end-2 top-2 z-10 rounded-full p-1 cursor-pointer',
          'text-muted-foreground hover:bg-secondary',
        )}
      >
        <XIcon className="size-4" />
      </button>

      {cta.imageUrl && (
        <img
          {...dc('cta/image')}
          src={cta.imageUrl}
          alt=""
          className="-mx-4 -mt-4 w-[calc(100%+2rem)] rounded-t-2xl object-cover"
        />
      )}

      <p {...dc('cta/title')} className="m-0 pe-6 text-base font-semibold">
        {cta.title}
      </p>

      {cta.body && (
        <p {...dc('cta/body')} className="m-0 text-sm text-muted-foreground">
          {cta.body}
        </p>
      )}

      {cta.avatarUrls && cta.avatarUrls.length > 0 && (
        <div {...dc('cta/avatars')} className="flex -space-x-2">
          {cta.avatarUrls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              className="size-7 rounded-full border-2 border-background object-cover"
            />
          ))}
        </div>
      )}

      {cta.buttons && cta.buttons.length > 0 && (
        <div className="flex flex-col gap-2">
          {cta.buttons.map((button, index) => (
            <button
              key={index}
              {...dc('cta/btn')}
              type="button"
              data-variant={button.variant ?? 'primary'}
              onClick={() => onButtonClick(button, index)}
              className={cn(
                'rounded-xl px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors',
                (button.variant ?? 'primary') === 'primary'
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'bg-secondary text-secondary-foreground hover:opacity-90',
              )}
            >
              {button.text}
            </button>
          ))}
        </div>
      )}

      {cta.composer && (
        <form
          {...dc('cta/composer/root')}
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const text = draft.trim();
            if (!text) return;
            onComposerSubmit(text);
            setDraft('');
          }}
        >
          <input
            {...dc('cta/composer/input')}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={cta.composer.placeholder ?? 'Write a message…'}
            className={cn(
              'min-w-0 flex-1 rounded-full border border-input bg-transparent',
              'px-3.5 py-2 text-sm outline-none focus:border-primary',
            )}
          />
          <button
            {...dc('cta/composer/send_btn')}
            type="submit"
            aria-label="Send"
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full cursor-pointer',
              'bg-primary text-primary-foreground hover:opacity-90',
            )}
          >
            <ArrowUpIcon className="size-4" />
          </button>
        </form>
      )}
    </div>
  );
}
