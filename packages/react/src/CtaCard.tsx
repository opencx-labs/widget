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
        'font-sans relative flex flex-col',
        'bg-background text-foreground',
        'rounded-2xl border border-black/5 p-4',
        'shadow-[0_12px_40px_-8px_rgba(0,0,0,0.18)]',
      )}
    >
      <button
        {...dc('cta/dismiss_btn')}
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className={cn(
          'absolute end-2 top-2 z-10 rounded-full p-1.5 cursor-pointer transition-colors',
          // Over an image header the glyph needs its own scrim to stay visible.
          cta.imageUrl
            ? 'bg-black/25 text-white backdrop-blur-[2px] hover:bg-black/40'
            : 'text-muted-foreground hover:bg-secondary',
        )}
      >
        <XIcon className="size-4" />
      </button>

      {cta.imageUrl && (
        <img
          {...dc('cta/image')}
          src={cta.imageUrl}
          alt=""
          className="-mx-4 -mt-4 mb-3.5 max-h-44 w-[calc(100%+2rem)] rounded-t-2xl object-cover"
        />
      )}

      <p
        {...dc('cta/title')}
        className="m-0 pe-6 text-[17px] font-bold leading-snug tracking-[-0.01em]"
      >
        {cta.title}
      </p>

      {cta.body && (
        <p
          {...dc('cta/body')}
          className="m-0 mt-1 text-[13.5px] leading-normal text-muted-foreground"
        >
          {cta.body}
        </p>
      )}

      {cta.avatarUrls && cta.avatarUrls.length > 0 && (
        <div {...dc('cta/avatars')} className="mt-2.5 flex -space-x-2.5">
          {cta.avatarUrls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              className="size-8 rounded-full border-2 border-background object-cover"
            />
          ))}
        </div>
      )}

      {cta.buttons && cta.buttons.length > 0 && (
        <div className="mt-3.5 flex flex-col gap-2">
          {cta.buttons.map((button, index) => (
            <button
              key={index}
              {...dc('cta/btn')}
              type="button"
              data-variant={button.variant ?? 'primary'}
              onClick={() => onButtonClick(button, index)}
              className={cn(
                'rounded-[14px] px-4 py-2.5 text-sm cursor-pointer transition-colors',
                (button.variant ?? 'primary') === 'primary'
                  ? 'bg-primary font-semibold text-primary-foreground hover:opacity-90'
                  : 'bg-secondary font-medium text-secondary-foreground hover:opacity-90',
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
          className="mt-3 flex items-center gap-2"
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
              'min-w-0 flex-1 rounded-full border border-transparent bg-secondary',
              'px-3.5 py-2 text-sm outline-none transition-colors focus:border-primary',
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
