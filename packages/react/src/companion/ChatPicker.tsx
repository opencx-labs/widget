import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import * as Menu from '@radix-ui/react-menu';
import { useCompanionChats, useSessions } from '@opencx/widget-react-headless';
import { CheckIcon, LoaderCircleIcon, PlusIcon, XIcon } from 'lucide-react';
import {
  Button,
  buttonVariants,
  type ButtonProps,
} from '../components/lib/button';
import { Wobble } from '../components/lib/wobble';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../hooks/useTranslation';
import { EASE_OUT_CSS, QUICK_TWEEN } from '../motion';
import { useSessionIdentity } from './useSessionIdentity';
import { type useChatPicker } from './useChatPicker';
import { CompanionControlStyles } from './CompanionControlStyles';

type Chat = ReturnType<typeof useCompanionChats>['chats'][number];

export function ChatPickerTrigger({
  picker,
  ...props
}: ButtonProps & {
  picker: ReturnType<typeof useChatPicker>;
}) {
  return (
    <>
      <CompanionControlStyles />
      <Button
        {...props}
        variant="ghost"
        size="selfless"
        type="button"
        data-companion-action=""
        aria-haspopup="menu"
        aria-expanded={picker.open}
        onPointerEnter={(event) => picker.hover(event.currentTarget)}
        onPointerLeave={picker.leave}
        onClick={(event) => {
          event.stopPropagation();
          picker.toggle(event.currentTarget, event.detail > 0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            picker.toggle(event.currentTarget);
          }
        }}
      />
    </>
  );
}

function ChatRow({
  chat,
  selected,
  onSelect,
  onClose,
}: {
  chat: Chat;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { title, preview, status } = useSessionIdentity(chat);
  return (
    <Wobble>
      <div
        data-chat-row=""
        data-companion-action=""
        data-selected={selected || undefined}
      >
        <Menu.RadioItem
          asChild
          value={String(chat.id)}
          textValue={title}
          onSelect={(event) => {
            event.preventDefault();
            onSelect();
          }}
        >
          <button
            className={buttonVariants({
              size: 'selfless',
              className: 'bg-transparent',
            })}
            type="button"
            data-companion-action=""
            aria-description={preview || undefined}
            aria-label={`${title} — ${status}${selected ? ` — ${t('companion_viewing')}` : ''}`}
            data-chat-select={chat.id}
          >
            <span data-chat-indicator="" aria-hidden>
              <Menu.ItemIndicator>
                <CheckIcon size={14} />
              </Menu.ItemIndicator>
            </span>
            <span data-chat-title="">{title}</span>
            {chat.working && (
              <LoaderCircleIcon size={14} data-working="" aria-hidden />
            )}
          </button>
        </Menu.RadioItem>
        <Menu.Item
          asChild
          textValue={t('companion_close_chat', { title })}
          onSelect={(event) => {
            event.preventDefault();
            onClose();
          }}
        >
          <button
            className={buttonVariants({
              size: 'selfless',
              className: 'bg-transparent',
            })}
            type="button"
            data-companion-action=""
            aria-label={t('companion_close_chat', { title })}
            data-chat-close={chat.id}
          >
            <XIcon size={14} aria-hidden />
          </button>
        </Menu.Item>
      </div>
    </Wobble>
  );
}

type ChatPickerProps = {
  picker: ReturnType<typeof useChatPicker>;
  portalTarget: HTMLElement | null;
  placement: 'above' | 'below';
  onSelected?: () => void;
};

/** One controller owns hover intent and opening state at every entry point. */
export function ChatPicker(props: ChatPickerProps) {
  const { picker, portalTarget } = props;
  return picker.anchor && portalTarget ? (
    <ChatPickerContent
      {...props}
      anchor={picker.anchor}
      portalTarget={portalTarget}
    />
  ) : null;
}

/** Radix handles placement and focus; the bridge crosses the widget iframe. */
function ChatPickerContent({
  picker,
  anchor,
  portalTarget: container,
  placement,
  onSelected,
}: ChatPickerProps & { anchor: HTMLElement; portalTarget: HTMLElement }) {
  const {
    open,
    animate,
    autoFocus,
    close: onClose,
    enter: onPointerEnter,
    leave: onPointerLeave,
  } = picker;
  const {
    chats: activeChats,
    activeId,
    selectChat,
    newChat,
    closeChat,
  } = useCompanionChats();
  const { canCreateNewSession } = useSessions();
  const { t, dir } = useTranslation();
  const { cssVars, theme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef(
    anchor.ownerDocument.activeElement as HTMLElement | null,
  );
  const setMenuRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && !menuRef.current)
        previousFocus.current = anchor.ownerDocument
          .activeElement as HTMLElement | null;
      menuRef.current = node;
    },
    [anchor],
  );
  const restoringHoverFocus = useRef(false);
  const callbacks = useRef({ onClose, onSelected });
  callbacks.current = { onClose, onSelected };
  const virtualAnchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect() {
          let rect = anchor.getBoundingClientRect();
          let view = anchor.ownerDocument.defaultView;
          const hostWindow = container.ownerDocument.defaultView;
          // Only coordinate conversion is widget-specific. Radix handles collisions,
          // scrolling, direction and popup placement in the host document.
          while (view && view !== hostWindow) {
            const frame = view.frameElement as HTMLIFrameElement | null;
            if (!frame) break;
            const outer = frame.getBoundingClientRect();
            const sx = outer.width / frame.offsetWidth || 1;
            const sy = outer.height / frame.offsetHeight || 1;
            rect = new DOMRect(
              outer.left + rect.left * sx,
              outer.top + rect.top * sy,
              rect.width * sx,
              rect.height * sy,
            );
            view = frame.ownerDocument.defaultView;
          }
          return rect;
        },
      },
    }),
    [anchor, container],
  );
  const workingCount = activeChats.filter((chat) => chat.working).length;

  useEffect(() => {
    if (!open || anchor.ownerDocument === container.ownerDocument) return;
    // Events inside an iframe don't bubble to the host's Radix dismissable layer.
    const outside = (event: Event) => {
      if (event.composedPath().includes(anchor)) return;
      if (
        event.type === 'focusin' &&
        !autoFocus &&
        event.target === previousFocus.current
      )
        return;
      callbacks.current.onClose(event.type === 'focusin');
    };
    const doc = anchor.ownerDocument;
    doc.addEventListener('pointerdown', outside, true);
    doc.addEventListener('focusin', outside);
    return () => {
      doc.removeEventListener('pointerdown', outside, true);
      doc.removeEventListener('focusin', outside);
    };
  }, [anchor, container, open, autoFocus]);

  useLayoutEffect(() => {
    menuRef.current?.toggleAttribute('inert', !open);
    if (open && autoFocus)
      menuRef.current
        ?.querySelector<HTMLElement>('[aria-checked="true"]')
        ?.focus({ preventScroll: true });
  }, [open, autoFocus]);

  function choose(id?: number) {
    anchor.focus({ preventScroll: true });
    if (id === undefined) newChat();
    else selectChat(id);
    callbacks.current.onClose(true);
    callbacks.current.onSelected?.();
  }
  function dismissChat(id: number) {
    const index = activeChats.findIndex((chat) => chat.id === id);
    const next = activeChats[index + 1] ?? activeChats[index - 1];
    if (id === activeId) {
      anchor.focus({ preventScroll: true });
      callbacks.current.onClose(true);
    } else
      menuRef.current
        ?.querySelector<HTMLElement>(
          next ? `[data-chat-select="${next.id}"]` : '[data-new-chat]',
        )
        ?.focus({ preventScroll: true });
    closeChat(id);
    if (id === activeId) callbacks.current.onSelected?.();
  }
  return createPortal(
    <Menu.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !restoringHoverFocus.current) callbacks.current.onClose();
      }}
      modal={false}
      dir={dir === 'rtl' ? 'rtl' : 'ltr'}
    >
      <Menu.Anchor virtualRef={virtualAnchor} />
      <Menu.Content
        ref={setMenuRef}
        loop
        side={placement === 'above' ? 'top' : 'bottom'}
        align={placement === 'below' ? 'start' : 'center'}
        sideOffset={6}
        collisionPadding={12}
        updatePositionStrategy="always"
        aria-label={t('companion_chats')}
        data-companion-chat-picker=""
        data-motion={animate ? 'pointer' : 'instant'}
        onEntryFocus={(event) => {
          event.preventDefault();
          if (autoFocus)
            menuRef.current
              ?.querySelector<HTMLElement>('[aria-checked="true"]')
              ?.focus({ preventScroll: true });
          else {
            // Focusing the composer iframe blurs the host window. Radix normally
            // dismisses on window blur; this one synchronous focus restoration
            // belongs to opening the hover preview, not leaving the menu.
            restoringHoverFocus.current = true;
            previousFocus.current?.focus({ preventScroll: true });
            restoringHoverFocus.current = false;
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          anchor.focus({ preventScroll: true });
          callbacks.current.onClose(true);
        }}
        onFocusOutside={(event) => {
          if (
            menuRef.current?.contains(
              event.detail.originalEvent.target as Node,
            ) ||
            event.detail.originalEvent.target === anchor ||
            event.detail.originalEvent.target ===
              anchor.ownerDocument.defaultView?.frameElement ||
            (!autoFocus &&
              event.detail.originalEvent.target === previousFocus.current)
          )
            event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (event.detail.originalEvent.composedPath().includes(anchor))
            event.preventDefault();
        }}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            event.preventDefault();
            anchor.focus({ preventScroll: true });
            callbacks.current.onClose(true);
          }
        }}
        style={{
          ...cssVars,
          zIndex: theme.widgetContentContainer.zIndex + 1,
          boxSizing: 'border-box',
          width: 'min(248px, calc(100vw - 24px))',
          maxHeight: 'min(360px, var(--radix-popper-available-height))',
          padding: 6,
          borderRadius: 10,
          border: '1px solid hsl(var(--opencx-border) / .5)',
          background: 'hsl(var(--opencx-background))',
          color: 'hsl(var(--opencx-foreground))',
          boxShadow: '0 4px 16px rgb(0 0 0 / .08), 0 1px 3px rgb(0 0 0 / .06)',
          font: '13px/1.4 ui-sans-serif, system-ui, sans-serif',
          overflowY: 'auto',
          outline: 'none',
        }}
      >
        <CompanionControlStyles />
        <style>{`
        [data-companion-chat-picker] {
          transform-origin: var(--radix-popper-transform-origin);
          animation: opencx-menu-in ${QUICK_TWEEN.duration * 1000}ms ${EASE_OUT_CSS};
        }
        [data-companion-chat-picker][data-state="closed"] { animation-name: opencx-menu-out; pointer-events: none; }
        [data-companion-chat-picker][data-motion="instant"] { animation: none; }
        @media (prefers-reduced-motion: reduce) {
          [data-companion-chat-picker] { animation: none !important; }
        }
        @keyframes opencx-menu-in { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: scale(1); } }
        @keyframes opencx-menu-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(.96); } }
        [data-companion-chat-picker] button {
          display: flex; align-items: center; justify-content: flex-start; gap: 8px; width: 100%; min-height: 34px;
          padding: 7px 8px; border: 0; border-radius: 7px; background: transparent;
          color: inherit; font: inherit; text-align: start; cursor: pointer; box-sizing: border-box;
        }
        [data-companion-chat-picker] [data-chat-row] { display: flex; align-items: center; border-radius: 7px; }
        [data-companion-chat-picker] [data-chat-row] + [data-chat-row] { margin-top: 4px; }
        [data-companion-chat-picker] [data-chat-select] { flex: 1; min-width: 0; min-height: 36px; color: hsl(var(--opencx-foreground) / .8); }
        [data-companion-chat-picker] [data-selected] [data-chat-select] { color: hsl(var(--opencx-foreground)); }
        [data-companion-chat-picker] [data-chat-indicator] { width: 14px; height: 14px; display: flex; align-items: center; flex-shrink: 0; color: hsl(var(--opencx-muted-foreground)); }
        [data-companion-chat-picker] [data-selected] [data-chat-indicator],
        [data-companion-chat-picker] [data-working] { color: hsl(var(--opencx-foreground)); }
        [data-companion-chat-picker] [data-chat-title] { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; line-height: 20px; }
        [data-companion-chat-picker] [data-chat-close] { width: 28px; min-height: 28px; padding: 0; margin-inline-end: 4px; flex-shrink: 0; justify-content: center; color: hsl(var(--opencx-muted-foreground)); }
        [data-companion-chat-picker] [data-chat-row]:focus-within { background: hsl(var(--opencx-secondary)); }
        @media (hover: hover) and (pointer: fine) {
          [data-companion-chat-picker] [data-chat-row]:hover,
          [data-companion-chat-picker] [data-new-chat][data-highlighted] { background: hsl(var(--opencx-secondary)); }
          [data-companion-chat-picker] [data-chat-close]:hover { color: hsl(var(--opencx-foreground)); }
        }
        [data-companion-chat-picker] [data-chat-row] button {
          background: transparent; transform: none;
        }
        [data-companion-chat-picker] [data-chat-close][data-highlighted] { color: hsl(var(--opencx-foreground)); }
        [data-companion-chat-picker] button:active { background: hsl(var(--opencx-foreground) / .065); }
        [data-companion-chat-picker] button:focus { outline: none; }
        [data-companion-chat-picker] button:disabled { opacity: .45; cursor: default; }
        @media (pointer: coarse) {
          [data-companion-chat-picker] button, [data-companion-chat-picker] [data-chat-select] { min-height: 48px; }
          [data-companion-chat-picker] [data-chat-close] { width: 48px; min-height: 48px; }
          [data-companion-chat-picker] [data-chat-title], [data-companion-chat-picker] [data-new-chat] { font-size: 16px; }
        }
        [data-companion-chat-picker] svg { flex-shrink: 0; }
        [data-companion-chat-picker] [data-working] { animation: opencx-picker-spin 1.2s linear infinite; }
        @keyframes opencx-picker-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { [data-companion-chat-picker] [data-working] { animation: none; } }
      `}</style>
        <Menu.Label
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            padding: '5px 8px 7px',
            fontSize: 12,
            color: 'hsl(var(--opencx-muted-foreground))',
          }}
        >
          <span>{t('companion_chats')}</span>
          {workingCount > 0 && (
            <span role="status">
              {t('companion_working_chats', { count: workingCount })}
            </span>
          )}
        </Menu.Label>
        <Menu.RadioGroup value={String(activeId)}>
          {activeChats.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              selected={chat.id === activeId}
              onSelect={() => choose(chat.id)}
              onClose={() => dismissChat(chat.id)}
            />
          ))}
        </Menu.RadioGroup>
        <Menu.Separator
          style={{
            height: 1,
            background: 'hsl(var(--opencx-border) / .4)',
            margin: '5px 4px',
          }}
        />
        <Menu.Group>
          <Menu.Item
            asChild
            disabled={!canCreateNewSession}
            onSelect={(event) => {
              event.preventDefault();
              choose();
            }}
          >
            <Button
              variant="ghost"
              size="selfless"
              type="button"
              data-companion-action=""
              data-new-chat=""
              disabled={!canCreateNewSession}
            >
              <PlusIcon size={14} aria-hidden />
              {t('new_conversation')}
            </Button>
          </Menu.Item>
        </Menu.Group>
      </Menu.Content>
    </Menu.Root>,
    container,
  );
}
