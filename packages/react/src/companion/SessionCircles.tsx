import React, { useEffect, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useCompanionChats, useSessions } from '@opencx/widget-react-headless';
import { LoaderCircleIcon, PlusIcon, XIcon } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { useSessionIdentity } from './useSessionIdentity';
import { useTheme } from '../hooks/useTheme';
import { useIsSmallScreen } from '../hooks/useIsSmallScreen';
import { ChatPicker } from './ChatPicker';
import { useChatPicker } from './useChatPicker';
import { useHostPortal } from './useHostPortal';
import { Button } from '../components/lib/button';
import { CompanionControlStyles } from './CompanionControlStyles';

type Chat = ReturnType<typeof useCompanionChats>['chats'][number];

function SessionCircle({
  chat,
  number,
  selected,
  interactive,
  onSelect,
  onClose,
  portalTarget,
}: {
  chat: Chat;
  number: number;
  selected: boolean;
  interactive: boolean;
  onSelect: () => void;
  onClose: (button: HTMLButtonElement) => void;
  portalTarget: HTMLElement | null;
}) {
  const { t } = useTranslation();
  const { cssVars, theme } = useTheme();
  const [tooltipOpen, setTooltipOpen] = useState(false);
  useEffect(() => {
    if (!interactive) {
      setTooltipOpen(false);
    }
  }, [interactive]);
  const { title } = useSessionIdentity(chat);
  const label = `${title}${chat.working ? ` — ${t('thinking')}` : ''}`;
  function tooltip(text: string) {
    return (
      portalTarget && (
        <Tooltip.Portal container={portalTarget}>
          <Tooltip.Content
            side="top"
            sideOffset={8}
            collisionPadding={12}
            data-companion-session-tooltip=""
            // Keep the chat title outside the launcher's clipping surface.
            style={{
              ...cssVars,
              zIndex: theme.widgetContentContainer.zIndex + 2,
              maxWidth: 'min(280px, calc(100vw - 24px))',
              padding: '7px 10px',
              borderRadius: 9,
              background: 'hsl(var(--opencx-foreground))',
              color: 'hsl(var(--opencx-background))',
              font: '12px/1.4 ui-sans-serif, system-ui, sans-serif',
              overflowWrap: 'anywhere',
              textAlign: 'center',
              boxShadow: '0 4px 14px rgb(0 0 0 / .12)',
            }}
          >
            {text}
            <Tooltip.Arrow
              width={8}
              height={4}
              style={{ fill: 'hsl(var(--opencx-foreground))' }}
            />
          </Tooltip.Content>
        </Tooltip.Portal>
      )
    );
  }
  const closeLabel = t('companion_close_chat', { title });
  return (
    <div data-session-item="">
      <Tooltip.Root
        open={interactive && tooltipOpen}
        onOpenChange={setTooltipOpen}
      >
        <Tooltip.Trigger asChild>
          <Button
            variant="ghost"
            size="selfless"
            data-companion-action=""
            type="button"
            data-session-circle={chat.id}
            aria-label={label}
            aria-pressed={selected}
            tabIndex={interactive ? 0 : -1}
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
            }}
          >
            {chat.working && (
              <LoaderCircleIcon size={28} aria-hidden data-session-working="" />
            )}
            <span aria-hidden>{number}</span>
          </Button>
        </Tooltip.Trigger>
        {tooltip(label)}
      </Tooltip.Root>
      <Button
        variant="ghost"
        size="selfless"
        data-companion-action=""
        type="button"
        data-session-close={chat.id}
        aria-label={closeLabel}
        tabIndex={interactive ? 0 : -1}
        onClick={(event) => {
          event.stopPropagation();
          setTooltipOpen(false);
          onClose(event.currentTarget);
        }}
      >
        <XIcon size={10} aria-hidden />
      </Button>
    </div>
  );
}

/** Direct switches; the compact picker handles only overflow. Works in both documents. */
export function SessionCircles({
  onSelected = () => {},
  onLastClosed = () => {},
  interactive = true,
}: {
  onSelected?: () => void;
  onLastClosed?: () => void;
  interactive?: boolean;
}) {
  const {
    openChats: activeChats,
    activeId,
    selectChat,
    newChat,
    closeChat,
  } = useCompanionChats();
  const { canCreateNewSession } = useSessions();
  const { isSmallScreen } = useIsSmallScreen();
  const { t, dir } = useTranslation();
  const picker = useChatPicker();
  const portalTarget = useHostPortal();
  // Reserve an overflow slot and always keep the current session visible.
  const limit = isSmallScreen ? 2 : 3;
  const visible = activeChats.slice(
    0,
    activeChats.length > limit ? limit - 1 : limit,
  );
  const current = activeChats.find((chat) => chat.id === activeId);
  if (current && !visible.includes(current))
    visible[visible.length - 1] = current;
  const hiddenCount = activeChats.length - visible.length;
  const hiddenWorking = activeChats.some(
    (chat) => chat.working && !visible.includes(chat),
  );
  const close = React.useRef(picker.close);
  close.current = picker.close;
  useEffect(() => {
    if (!interactive) close.current(true);
  }, [interactive]);

  function choose(id?: number) {
    picker.close(true);
    if (id === undefined) newChat();
    else selectChat(id);
    onSelected();
  }

  function dismiss(id: number, button: HTMLButtonElement) {
    picker.close(true);
    const index = visible.findIndex((chat) => chat.id === id);
    const next = visible[index + 1] ?? visible[index - 1];
    button
      .closest('[data-companion-session-circles]')
      ?.querySelector<HTMLElement>(
        next ? `[data-session-circle="${next.id}"]` : '[data-new-session]',
      )
      ?.focus({ preventScroll: true });
    closeChat(id);
    if (activeChats.length === 1) onLastClosed();
  }

  return (
    <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
      <div
        role="group"
        aria-label={t('companion_active_chats', { count: activeChats.length })}
        aria-hidden={!interactive || undefined}
        data-companion-session-circles=""
        dir={dir}
        // Session clicks must not start a drag of the resting launcher.
        onPointerDown={(event) => event.stopPropagation()}
        style={{
          position: 'relative',
          // Keep header circles below the overlaid layout menu.
          zIndex: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
          pointerEvents: interactive ? 'auto' : 'none',
        }}
      >
        <CompanionControlStyles />
        <style>{`
        [data-companion-session-tooltip][data-state="delayed-open"] { animation: opencx-session-tooltip-in 120ms ease-out; }
        @keyframes opencx-session-tooltip-in { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { [data-companion-session-tooltip] { animation: none !important; } }
        [data-companion-session-circles] > button,
        [data-companion-session-circles] [data-session-circle] {
          position: relative; display: grid; place-items: center; flex: 0 0 28px;
          width: 28px; height: 28px; padding: 0; border-radius: 50%;
          border: 1px solid hsl(var(--opencx-border));
          background: transparent; color: hsl(var(--opencx-muted-foreground));
          font: 11px ui-sans-serif, system-ui, sans-serif; font-variant-numeric: tabular-nums;
          cursor: pointer;
        }
        [data-companion-session-circles] [data-session-circle][aria-pressed="true"] {
          border-color: hsl(var(--opencx-primary) / .45);
          background: hsl(var(--opencx-primary) / .08);
          color: hsl(var(--opencx-foreground));
        }
        @media (hover: hover) and (pointer: fine) {
          [data-companion-session-circles] > button:hover,
          [data-companion-session-circles] [data-session-item]:hover [data-session-circle] { background: hsl(var(--opencx-muted)); color: hsl(var(--opencx-foreground)); }
        }
        [data-companion-session-circles] button:focus-visible { outline: 2px solid hsl(var(--opencx-ring)); outline-offset: 2px; }
        [data-companion-session-circles] > button:disabled { opacity: .4; cursor: default; }
        [data-companion-session-circles] [data-session-item] { position: relative; display: flex; align-items: center; width: 36px; height: 32px; flex-shrink: 0; }
        [data-companion-session-circles] [data-session-close] {
          position: absolute; inset-inline-end: 0; top: -1px; z-index: 1;
          width: 16px; height: 16px; display: grid; place-items: center; padding: 0;
          border: 1px solid hsl(var(--opencx-border) / .7); border-radius: 50%;
          background: hsl(var(--opencx-background)); color: hsl(var(--opencx-muted-foreground)); cursor: pointer;
        }
        @media (hover: hover) and (pointer: fine) {
          [data-companion-session-circles] [data-session-close] { opacity: 0; pointer-events: none; }
          [data-companion-session-circles] [data-session-item]:hover [data-session-close],
          [data-companion-session-circles] [data-session-item]:focus-within [data-session-close] { opacity: 1; pointer-events: auto; }
          [data-companion-session-circles] [data-session-close]:hover { color: hsl(var(--opencx-foreground)); }
        }
        @media (pointer: coarse) {
          [data-companion-session-circles] [data-session-item] { width: 42px; }
          [data-companion-session-circles] [data-session-close] { width: 24px; height: 24px; top: -3px; }
          [data-companion-session-circles] [data-session-close] svg { width: 12px; height: 12px; }
        }
        [data-companion-session-circles] > button[data-new-session] { border-style: dashed; }
        [data-companion-session-circles] [data-session-working] {
          position: absolute; inset: -1px; color: hsl(var(--opencx-primary));
          animation: opencx-session-spin 1.2s linear infinite;
        }
        @keyframes opencx-session-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { [data-companion-session-circles] [data-session-working] { animation: none; } }
      `}</style>
        {visible.map((chat) => (
          <SessionCircle
            key={chat.id}
            chat={chat}
            number={chat.id}
            selected={chat.id === activeId}
            interactive={interactive}
            portalTarget={portalTarget}
            onSelect={() => choose(chat.id)}
            onClose={(button) => dismiss(chat.id, button)}
          />
        ))}
        {hiddenCount > 0 && (
          <Button
            variant="ghost"
            size="selfless"
            data-companion-action=""
            type="button"
            aria-label={t('companion_chats')}
            aria-haspopup="menu"
            aria-expanded={picker.open}
            tabIndex={interactive ? 0 : -1}
            onPointerEnter={(event) => picker.hover(event.currentTarget)}
            onPointerLeave={picker.leave}
            onClick={(event) => {
              event.stopPropagation();
              picker.toggle(event.currentTarget, event.detail > 0);
            }}
          >
            {hiddenWorking && (
              <LoaderCircleIcon size={28} aria-hidden data-session-working="" />
            )}
            <span aria-hidden>+{hiddenCount}</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="selfless"
          data-companion-action=""
          type="button"
          data-new-session=""
          aria-label={t('new_conversation')}
          disabled={!canCreateNewSession}
          tabIndex={interactive ? 0 : -1}
          onClick={(event) => {
            event.stopPropagation();
            choose();
          }}
        >
          <PlusIcon size={14} aria-hidden />
        </Button>
        {picker.anchor && portalTarget && (
          <ChatPicker
            picker={picker}
            portalTarget={portalTarget}
            placement="above"
            onSelected={onSelected}
          />
        )}
      </div>
    </Tooltip.Provider>
  );
}
