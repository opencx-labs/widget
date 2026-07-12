import { motion, useReducedMotion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useConfig,
  useWidget,
  useWidgetLayout,
  useWidgetTrigger,
} from '@opencx/widget-react-headless';
import { buildFrameHtml, FrameDocument } from '../components/FrameDocument';
import { Tooltippy } from '../components/lib/tooltip';
import { dc } from '../utils/data-component';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../hooks/useTranslation';
import { RootScreen } from '../screens';
import { CompanionFrame } from './CompanionFrame';
import { CompanionIcon } from './CompanionIcon';
import { FrameIconButton } from './FrameIconButton';
import { LayoutPicker } from './LayoutPicker';
import { EASE_OUT } from './materials';
import { flatMessageCss } from './message-styles';
import {
  mountAppFrame,
  setFrameAnimated,
  setFrameOpen,
  setFrameWidth,
  unmountAppFrame,
} from './app-frame';
import { useHostPortal } from './useHostPortal';

const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 320;
const MAX_WIDTH = 560;
const CANVAS = '#f4f4f5';
const EASE = [0.32, 0.72, 0.24, 1] as const;

const initialContent = buildFrameHtml({ transparent: true });

/**
 * The sidebar renders the STOCK screens (RootScreen) — the same renderer as
 * popover/companion, so every embedder option and custom component applies.
 * It now shows the STOCK in-iframe header (back chevron + title), exactly
 * like the compact/fullscreen companion layouts, with a small corner-controls
 * overlay for exit/close. The panel is a normal chat surface (bg-background),
 * so the stock bubbles render EXACTLY as in popover/companion. There is no
 * base override anymore — the flat-message CSS is appended only when bubbles
 * are turned off. The configurable canvas color frames the host page
 * (app-frame), it is not the message backdrop.
 */
const sidebarCanvasOverrides = '';

/**
 * Inside the iframe: the stock screens plus a corner-controls overlay
 * (exit sidebar + close), positioned top inline-end so it clears the stock
 * header's back button (top inline-start) and title.
 */
function SidebarContent() {
  const { companion } = useConfig();
  const { t } = useTranslation();
  const { setLayout } = useWidgetLayout();
  const { setIsOpen } = useWidgetTrigger();
  // Bubbles are the default; `companion.bubbles: false` swaps in the flat,
  // document-style rendering.
  const overrides =
    companion?.bubbles === false
      ? sidebarCanvasOverrides + flatMessageCss('[data-opencx-sidebar-content]')
      : sidebarCanvasOverrides;
  return (
    <FrameDocument overrides={overrides}>
      <div
        data-opencx-sidebar-content=""
        style={{ position: 'absolute', inset: 0 }}
      >
        <RootScreen />
        <div
          {...dc('companion/controls/root')}
          className="absolute top-2 z-10 flex items-center gap-1"
          style={{ insetInlineEnd: 8 }}
        >
          <LayoutPicker current="sidebar" onSelect={(l) => setLayout(l)} />
          <Tooltippy content={t('companion_close')} side="bottom">
            <FrameIconButton
              {...dc('companion/close_btn')}
              label={t('companion_close')}
              title=""
              onClick={() => setIsOpen(false)}
              className="size-7"
            >
              <XIcon className="size-4" />
            </FrameIconButton>
          </Tooltippy>
        </div>
      </div>
    </FrameDocument>
  );
}

export function WidgetSidebar() {
  const { isOpen, setIsOpen } = useWidgetTrigger();
  const { contentIframeRef } = useWidget();
  const { companion, accessibility, assets, customComponents } = useConfig();
  const shouldReduceMotion = useReducedMotion();
  const { theme, cssVars } = useTheme();
  const { t, dir } = useTranslation();
  const rtl = dir === 'rtl';

  const [width, setWidth] = useState(
    () => companion?.sidebar?.width ?? DEFAULT_WIDTH,
  );
  const canvas = companion?.sidebar?.canvasColor ?? CANVAS;
  // Frame-the-page is the default effect; embedders who don't want their
  // page root restyled opt out (companion.sidebar.framePage: false) and get
  // an overlay sidebar with its own surface instead.
  const framePage = companion?.sidebar?.framePage !== false;
  // The framed page and the sidebar card share ONE background so they read
  // as the same surface. `--opencx-background` holds HSL components.
  const pageBackground =
    'hsl(' + (cssVars as Record<string, string>)['--opencx-background'] + ')';

  // Popover-config carryover: same custom trigger contract, same trigger
  // offsets/zIndex, same trigger icon and pill label options.
  const customTrigger = customComponents?.widgetTrigger;
  const pillLabel = companion?.pillLabel ?? t('ask_button');
  const pillIcon = companion?.icon ?? assets?.widgetTrigger?.openIcon;
  const triggerAriaLabel =
    accessibility?.widgetTriggerButton?.label ?? 'Chat with us';

  // The app frame exists for the mode's lifetime; open only insets it
  useEffect(() => {
    if (!framePage) return;
    mountAppFrame({ canvas, dir, pageBackground });
    return () => unmountAppFrame();
  }, [framePage, canvas, dir, pageBackground]);

  useEffect(() => {
    if (framePage) setFrameWidth(width);
  }, [framePage, width]);

  useEffect(() => {
    if (framePage) setFrameOpen(isOpen);
  }, [framePage, isOpen]);

  // Esc closes (host document; keys inside the iframe stay with the screens)
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, setIsOpen]);

  // Drag-resize: host-DOM handle on the panel's inner edge; host clientX
  // maps to width directly. Frame + panel transitions pause during drag.
  const [resizing, setResizing] = useState(false);
  const onResizeDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizing(true);
    setFrameAnimated(false);
  }, []);
  const onResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const next = rtl ? e.clientX : window.innerWidth - e.clientX;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)));
    },
    [rtl],
  );
  const onResizeUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setResizing(false);
    setFrameAnimated(true);
  }, []);

  const portalTarget = useHostPortal();
  if (!portalTarget) return null;

  return createPortal(
    <>
      {/* Closed-state affordance. An embedder customComponents.widgetTrigger
          replaces it wholesale (popover parity); otherwise a small pill in
          the primary theme color at the popover trigger's offsets. Embedders
          driving open/close via isOpen or the ref can hide it entirely. */}
      {customTrigger ? (
        // display:contents keeps the wrapper layout-neutral
        <div data-opencx-companion style={{ display: 'contents' }}>
          {customTrigger({
            react: React,
            isOpen,
            setIsOpen: (open: boolean) => setIsOpen(open),
          })}
        </div>
      ) : (
        <motion.button
          data-opencx-companion
          aria-label={triggerAriaLabel}
          onClick={() => setIsOpen(true)}
          style={{
            ...cssVars,
            position: 'fixed',
            bottom: theme.widgetTrigger.offset.bottom,
            right: theme.widgetTrigger.offset.right,
            left: theme.widgetTrigger.offset.left,
            zIndex: theme.widgetTrigger.zIndex,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 36,
            padding: '0 16px',
            borderRadius: 999,
            border: 0,
            background: 'hsl(var(--opencx-primary))',
            color: 'hsl(var(--opencx-primary-foreground))',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            fontSize: 13.5,
            fontWeight: 500,
            cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
          }}
          initial={false}
          animate={{
            opacity: isOpen ? 0 : 1,
            // Reduced motion: keep the opacity fade, drop the scale movement.
            scale: shouldReduceMotion ? 1 : isOpen ? 0.9 : 1,
          }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
        >
          {pillIcon && (
            <CompanionIcon
              icon={pillIcon}
              pillBackground="transparent"
              size={18}
            />
          )}
          {pillLabel}
        </motion.button>
      )}

      {/* The panel: transparent on the exposed canvas when the page is
          framed; with framePage off it floats over the page on its own
          surface. Host-DOM chrome (header + resize) above an iframe that
          the stock screens fully own. */}
      <motion.aside
        data-opencx-companion
        role="complementary"
        aria-label="Chat panel"
        dir={rtl ? 'rtl' : 'ltr'}
        style={{
          ...cssVars,
          position: 'fixed',
          top: 16,
          bottom: 16,
          insetInlineEnd: 16,
          width,
          borderRadius: 20,
          overflow: 'hidden',
          zIndex: theme.widgetContentContainer.zIndex,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          pointerEvents: isOpen ? 'auto' : 'none',
          // A normal chat surface (like popover/companion), so stock bubbles
          // read the same and nothing bleeds through the host-DOM header. The
          // canvas color frames the host page (app-frame), not this panel.
          // Same value as the framed page so the two surfaces are identical.
          background: pageBackground,
          boxShadow:
            '0 0 0 1px rgba(0, 0, 0, 0.06), 0 12px 40px rgba(0, 0, 0, 0.15)',
        }}
        initial={false}
        // Full transform string, not the `x` shorthand: the slide plays while
        // the app-frame body-inset transition relayouts the whole host page,
        // and only the string form is hardware-accelerated (the shorthand is
        // main-thread rAF and stutters exactly then). Reduced motion drops the
        // slide entirely and cross-fades in place (the app-frame relayout is
        // also disabled under reduced motion, so there's nothing to track).
        animate={{
          transform:
            shouldReduceMotion || isOpen
              ? 'translateX(0%)'
              : `translateX(${rtl ? '-110%' : '110%'})`,
          opacity: shouldReduceMotion ? (isOpen ? 1 : 0) : 1,
        }}
        transition={
          resizing
            ? { duration: 0 }
            : shouldReduceMotion
              ? { duration: 0.15, ease: EASE_OUT }
              : { duration: 0.3, ease: EASE }
        }
      >
        <style>{`
@media (hover: hover) and (pointer: fine) {
  [data-opencx-sidebar-resize]:hover > div { background: rgba(0, 0, 0, 0.10) !important; }
}
        `}</style>

        <div
          data-opencx-sidebar-resize
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            insetInlineStart: -4,
            width: 8,
            cursor: 'ew-resize',
            zIndex: 1,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              insetInlineStart: 4,
              width: 1,
              background: 'transparent',
              transition: 'background 150ms ease-out',
            }}
          />
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <CompanionFrame
            iframeRef={contentIframeRef}
            initialContent={initialContent}
            title="OpenCX Chat Sidebar"
            style={{
              width: '100%',
              height: '100%',
              border: 0,
              backgroundColor: 'transparent',
              overflow: 'visible',
            }}
          >
            <SidebarContent />
          </CompanionFrame>
        </div>
      </motion.aside>
    </>,
    portalTarget,
  );
}
