import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from 'framer-motion';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  useConfig,
  useSessions,
  useWidget,
  useWidgetLayout,
  useWidgetTrigger,
} from '@opencx/widget-react-headless';
import { buildFrameHtml } from '../components/FrameDocument';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../hooks/useTranslation';
import {
  mountAppFrame,
  setFrameAnimated,
  setFrameOpen,
  setFrameWidth,
  unmountAppFrame,
} from './app-frame';
import { CompanionContent } from './CompanionContent';
import { CompanionFrame } from './CompanionFrame';
import { CompanionGeometryUtils } from './companion-geometry.utils';
import { RestingPill } from './RestingOverlays';
import {
  CHAT_SHADOW,
  DOCK_SHADOW,
  EASE_OUT,
  INPUT_SHADOW,
  PILL_SHADOW,
  SCRIM_BACKDROP_FILTER,
} from './materials';
import type { PanelLayout, PanelState } from './types';
import { useHostPortal } from './useHostPortal';

// Near-critically damped (ratio ≈ 1.0 at stiffness 500 / mass 1): the morph
// stays snappy but never overshoots. An underdamped spring (damping 40 → ratio
// 0.89) made the input bar's height bounce every time it settled — reads as
// jitter on a text composer, which should feel crisp, not springy.
const SPRING = {
  type: 'spring',
  stiffness: 500,
  damping: 45,
  mass: 1,
} as const;
/** Gentler-not-zero: keep the fades, collapse the travel (reduced motion),
 * and skip the theatrics on keyboard-initiated opens. */
const SNAPPY = { duration: 0.15, ease: EASE_OUT } as const;

// The resting disc size. Kept in sync with RestingPill's ICON_SIZE so the disc
// fills the collapsed round pill exactly (that equality is what lets the pill
// grow into the dock bar without the icon resizing). 32 in the 44 dock leaves
// ~6px of breathing room around the disc.
const PILL_SIZE = 32;
const DOCK_HEIGHT = 44;
const DOCK_FALLBACK_WIDTH = 240;
const PANEL_MAX_WIDTH = 440;
const PANEL_HORIZONTAL_MARGIN = 32;
const CHAT_MIN_HEIGHT = 420;
const CHAT_MAX_HEIGHT = 640;
/** Every state shares one bottom offset: pill → input is pure horizontal
 * growth and the chat panel grows upward from the same baseline — no
 * vertical jump anywhere in the morph. Embedders who already position the
 * popover trigger via theme.widgetTrigger.offset.bottom keep their offset. */
const DEFAULT_BOTTOM_OFFSET = 24;
const TOP_MARGIN = 48;
/** Quick-ask card seed height until the composer measures itself. */
const COMPANION_INPUT_FALLBACK_HEIGHT = 96;
const VIEWPORT_EDGE_PADDING = 12;
const PILL_OFFSET_STORAGE_KEY = 'opencx_companion_pill_offset';

// Sidebar layout: a docked, drag-resizable panel at the inline-end edge that
// pushes the host page aside (app-frame). Same width bounds as the aside it
// replaces; its margins + rects live in CompanionGeometryUtils.
const DEFAULT_SIDEBAR_WIDTH = 400;
const MIN_SIDEBAR_WIDTH = 320;
const MAX_SIDEBAR_WIDTH = 560;
const SIDEBAR_CANVAS = '#f4f4f5';
const SIDEBAR_WIDTH_STORAGE_KEY = 'opencx_companion_sidebar_width';

function loadSidebarWidth(): number | null {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Read a CSS custom property (e.g. `--opencx-background`) off the theme's
 * cssVars without an unchecked cast. The app-frame needs the concrete color
 * value because it styles `body`, which sits outside the widget's var scope. */
function readCssVar(vars: React.CSSProperties, name: string): string {
  for (const [key, value] of Object.entries(vars)) {
    if (key === name && typeof value === 'string') return value;
  }
  return '';
}

const initialContent = buildFrameHtml({ transparent: true });

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getViewportSize() {
  if (typeof window === 'undefined') {
    return { width: 1440, height: 900 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

function loadPillOffset(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(PILL_OFFSET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { x?: unknown }).x === 'number' &&
      typeof (parsed as { y?: unknown }).y === 'number'
    ) {
      return parsed as { x: number; y: number };
    }
    return null;
  } catch {
    return null;
  }
}

export function WidgetCompanion() {
  const { isOpen, setIsOpen } = useWidgetTrigger();
  const { widgetCtx, contentIframeRef } = useWidget();
  const config = useConfig();
  const { companion, accessibility, assets, customComponents } = config;
  const { theme, cssVars } = useTheme();
  const { t, dir } = useTranslation();
  const { sessionState } = useSessions();

  // Seed from isOpen so a layout swap-in (sidebar → fullscreen/compact) mounts
  // straight into the open chat instead of flashing the resting pill for a
  // frame. The isOpen-sync effect refines it (input vs chat) right after.
  const [state, setState] = useState<PanelState>(isOpen ? 'chat' : 'pill');
  const { layout: panelLayout, setLayout: setPanelLayout } = useWidgetLayout();
  const [viewportSize, setViewportSize] = useState(getViewportSize);
  // The quick-ask card is the real composer, which grows as the user types;
  // its measured height drives the shell card so the two stay in lockstep.
  const [inputHeight, setInputHeight] = useState(
    COMPANION_INPUT_FALLBACK_HEIGHT,
  );

  // Sidebar layout: a resizable width (persisted) and a resize-in-progress
  // flag that pauses the app-frame transition mid-drag.
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    clamp(
      companion?.sidebar?.width ?? loadSidebarWidth() ?? DEFAULT_SIDEBAR_WIDTH,
      MIN_SIDEBAR_WIDTH,
      MAX_SIDEBAR_WIDTH,
    ),
  );
  const [sidebarResizing, setSidebarResizing] = useState(false);

  const shouldReduceMotion = useReducedMotion();
  // Keyboard-driven transitions (Escape, ...) skip the spring + fade
  // delay — keyboard users are on the fast path, and the morph only earns
  // its time on a pointer journey. The flag tracks the CURRENT input
  // modality: set by keyboard handlers, cleared by pointer handlers, so a
  // keyboard flow stays snappy end-to-end and a click restores the spring.
  const [keyboardDriven, setKeyboardDriven] = useState(false);
  const morphTransition = sidebarResizing
    ? // Drag-resize is a direct manipulation: the shell must track the pointer
      // 1:1, not spring after it. Restored to SPRING on pointer-up.
      { duration: 0 }
    : shouldReduceMotion || keyboardDriven
      ? SNAPPY
      : SPRING;
  // Hover motion is gated off coarse pointers — tap-to-hover on touch reads
  // as a phantom wiggle before every open.
  const [canHover] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  );

  // Optional scoping container (companion.container): the pill anchors to
  // this region's bottom center and fullscreen covers the region, not the
  // window — e.g. a main content area, excluding the host app's own nav.
  const containerOpt = companion?.container;
  const [containerEl, setContainerEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!containerOpt) {
      setContainerEl(null);
    } else if (typeof containerOpt === 'string') {
      setContainerEl(document.querySelector<HTMLElement>(containerOpt));
    } else {
      setContainerEl(containerOpt);
    }
  }, [containerOpt]);
  const [containerRect, setContainerRect] = useState<{
    width: number;
    height: number;
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    if (!containerEl) {
      setContainerRect(null);
      return;
    }
    const measure = () => {
      const r = containerEl.getBoundingClientRect();
      setContainerRect({
        width: r.width,
        height: r.height,
        left: r.left,
        top: r.top,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(containerEl);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [containerEl]);
  const region =
    containerEl && containerRect
      ? containerRect
      : {
          width: viewportSize.width,
          height: viewportSize.height,
          left: 0,
          top: 0,
        };

  const [pillOffset, setPillOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const dragX = useMotionValue(0);
  const wasDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // True once the panel has actually reached the chat state this mount. The
  // layout-reset effect keys off it so a swap-in (which starts in 'pill')
  // can't clobber the fullscreen layout the user just switched to.
  const hasBeenChatRef = useRef(false);

  const isPill = state === 'pill';

  // Existing embedder customizations carry over without new config:
  // their popover trigger icon and bottom offset apply to the pill, and a
  // customComponents.widgetTrigger replaces the pill outright (the panel
  // still opens from the same bottom-center baseline via isOpen).
  const customTrigger = customComponents?.widgetTrigger;
  const hasCustomTrigger = !!customTrigger;
  const pillBackground =
    companion?.pillBackground ?? 'hsl(var(--opencx-primary))';
  const companionIcon = companion?.icon ?? assets?.widgetTrigger?.openIcon;
  const bottomOffset =
    config.theme?.widgetTrigger?.offset?.bottom ?? DEFAULT_BOTTOM_OFFSET;
  const pillAriaLabel =
    accessibility?.widgetTriggerButton?.label ?? 'Chat with us';

  // Resting dock: the pill carries a label bar by default — a bare icon
  // has no affordance. `hover` expands on pointer hover only (icon-only on
  // touch, where hover-reveal is unreachable); `never` opts out entirely.
  // Width follows the measured content.
  // With a live conversation, the resting bar and quick-ask invite a
  // continuation instead of a fresh start.
  const hasActiveSession = !!sessionState.session?.id;
  const continueLabel = hasActiveSession
    ? t('follow_up_placeholder')
    : undefined;
  const dockLabel =
    companion?.pillLabel ??
    companion?.placeholder ??
    continueLabel ??
    t('write_a_message_placeholder');
  const dockLabelDisplay = companion?.pillLabelDisplay ?? 'always';
  // Quick-ask composer placeholder: continuing an open conversation reads
  // "Follow up…"; a fresh ask uses the embedder's placeholder or the default.
  const quickAskPlaceholder =
    continueLabel ?? companion?.placeholder ?? t('write_a_message_placeholder');
  const [pillHovered, setPillHovered] = useState(false);
  const [dockContentWidth, setDockContentWidth] = useState<number | null>(null);
  const dockContentRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setDockContentWidth(node.offsetWidth),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const docked =
    isPill &&
    !hasCustomTrigger &&
    dockLabelDisplay !== 'never' &&
    (dockLabelDisplay === 'always' || (canHover && pillHovered));

  const compactWidth = Math.max(
    280,
    Math.min(PANEL_MAX_WIDTH, region.width - PANEL_HORIZONTAL_MARGIN),
  );
  const chatHeight = clamp(
    region.height * 0.65,
    CHAT_MIN_HEIGHT,
    Math.min(CHAT_MAX_HEIGHT, region.height - bottomOffset - TOP_MARGIN),
  );
  const isSidebar = panelLayout === 'sidebar';
  const effectiveSidebarWidth = CompanionGeometryUtils.effectiveSidebarWidth(
    region,
    sidebarWidth,
  );
  const chatDims = CompanionGeometryUtils.chatDims({
    layout: panelLayout,
    region,
    compactWidth,
    chatHeight,
    sidebarWidth,
  });

  // The content iframe keeps a constant chat-sized footprint for BOTH open
  // states — the input bar is just the bottom strip of it, and the shell
  // clips the rest (overflow hidden). Two reasons:
  // 1. Resizing the iframe would reflow text mid-morph (visible squish).
  // 2. Resizing it in the same commit that reveals the chat screen trips a
  //    resize→setState loop inside the chat screen ("Maximum update depth").
  // In chat state the iframe fills the whole shell in EVERY layout, so the
  // stock header + composer span the full width — fullscreen is just a bigger
  // panel (a full-width block), not a centered reading column.
  const contentWidth = state === 'chat' ? chatDims.width : compactWidth;
  // The column owns its full height in every layout — the stock chat header
  // (with PanelControls) lives inside it, so no top strip is reserved.
  const contentHeight = chatDims.height;

  // Container anchor, ANIMATED (px) so every layout morphs its position, not
  // just the inner shell's size: compact/fullscreen center horizontally and
  // grow from the bottom baseline; the sidebar pins to the inline-end edge and
  // spans the full height. Animating left/bottom (vs. a static style) is what
  // lets sidebar↔fullscreen↔compact spring between rects instead of jumping.
  const regionOffsetBottom = containerEl
    ? viewportSize.height - (region.top + region.height)
    : 0;
  const { centerX: shellCenterX, bottom: shellBottom } =
    CompanionGeometryUtils.shellAnchor({
      isChatOpen: state === 'chat',
      layout: panelLayout,
      region,
      sidebarWidth,
      dir,
      bottomOffset,
      regionOffsetBottom,
    });

  const dockWidth = Math.min(
    dockContentWidth ?? DOCK_FALLBACK_WIDTH,
    region.width - PANEL_HORIZONTAL_MARGIN,
  );

  const currentDims = useMemo(() => {
    if (state === 'pill') {
      if (docked) {
        return { width: dockWidth, height: DOCK_HEIGHT, borderRadius: 999 };
      }
      return { width: PILL_SIZE, height: PILL_SIZE, borderRadius: 999 };
    }
    if (state === 'input') {
      return {
        width: compactWidth,
        height: inputHeight,
        borderRadius: 16,
      };
    }
    return chatDims;
  }, [state, docked, dockWidth, compactWidth, chatDims, inputHeight]);

  // Grow-to-the-side anchoring for the expand-on-hover pill: the shell is
  // center-anchored (translateX -50%), so a bare width spring would grow the
  // dock symmetrically from the center and drag the icon inward. Shifting the
  // shell by half the width delta pins its inline-start edge instead, so the
  // icon stays put and only the label bar extends out toward the inline-end.
  // Only for the `hover` mode — the `always` bar has no collapsed state to
  // anchor to and stays centered as before.
  const dockGrowX =
    state === 'pill' && docked && dockLabelDisplay === 'hover'
      ? ((dir === 'rtl' ? -1 : 1) * (dockWidth - PILL_SIZE)) / 2
      : 0;

  useEffect(() => {
    function handleResize() {
      setViewportSize(getViewportSize());
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Restore pill offset from localStorage
  useEffect(() => {
    const saved = loadPillOffset();
    if (saved) {
      setPillOffset(saved);
      dragX.set(saved.x);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the dragged offset when resting as a pill; clamp it when open so
  // the panel stays fully inside the viewport.
  useEffect(() => {
    const settle = shouldReduceMotion ? SNAPPY : SPRING;
    if (isPill) {
      // Clamp a restored/saved offset to the current resting width so a dock
      // that was saved wide (or the viewport since shrank) can't rest off-edge.
      const bound = Math.max(
        0,
        region.width / 2 -
          (docked ? dockWidth : PILL_SIZE) / 2 -
          VIEWPORT_EDGE_PADDING,
      );
      animate(dragX, clamp(pillOffset.x, -bound, bound), settle);
    } else if (
      state === 'chat' &&
      (panelLayout === 'fullscreen' || panelLayout === 'sidebar')
    ) {
      // Fullscreen and the docked sidebar are viewport/edge-anchored, not
      // bottom-center — they must NOT carry the pill's drag offset, or the
      // panel lands shifted off-screen by however far the pill was dragged.
      animate(dragX, 0, settle);
    } else {
      const maxOffset =
        region.width / 2 - currentDims.width / 2 - VIEWPORT_EDGE_PADDING;
      animate(dragX, clamp(pillOffset.x, -maxOffset, maxOffset), settle);
    }
  }, [
    isPill,
    state,
    panelLayout,
    pillOffset,
    dragX,
    region.width,
    currentDims.width,
    docked,
    dockWidth,
    shouldReduceMotion,
  ]);

  const handleDragEnd = useCallback(() => {
    const offset = { x: dragX.get(), y: 0 };
    setPillOffset((prev) => (prev.x === offset.x ? prev : offset));
    try {
      localStorage.setItem(PILL_OFFSET_STORAGE_KEY, JSON.stringify(offset));
    } catch {
      // Storage full or unavailable — ignore
    }
  }, [dragX]);

  // Keep the WHOLE resting element on screen, not just its center: the dock
  // bar is far wider than the bare pill, so the bound must use the current
  // resting width (dockWidth when labeled) or the dock slides half off-edge.
  const restingBound = Math.max(
    0,
    region.width / 2 -
      (docked ? dockWidth : PILL_SIZE) / 2 -
      VIEWPORT_EDGE_PADDING,
  );
  const dragConstraints = useMemo(
    () => ({ left: -restingBound, right: restingBound, top: 0, bottom: 0 }),
    [restingBound],
  );

  // State reads that must not go stale in callbacks come straight from the
  // core contexts instead of render-time snapshots.
  const openPanel = useCallback(() => {
    const screen = widgetCtx.routerCtx.state.get().screen;
    const hasSession = !!widgetCtx.sessionCtx.sessionState.get().session?.id;
    // The welcome (data collection) screen needs the full panel; the bare
    // input bar is only for starting/continuing a conversation.
    setState(screen === 'welcome' || hasSession ? 'chat' : 'input');
  }, [widgetCtx]);

  const closePanel = useCallback(() => {
    // Staged collapse, one rung per close: fullscreen → compact chat →
    // input bar → pill. Jumping from a large panel straight to the icon
    // reads as the widget vanishing; each stage keeps the user oriented
    // and one step from returning.
    if (panelLayout === 'fullscreen') {
      setPanelLayout('compact');
      return;
    }
    // The docked sidebar has no compact intermediate — it collapses straight
    // to the launcher pill (the app-frame un-insets as the shell shrinks).
    if (panelLayout === 'sidebar') {
      setState('pill');
      return;
    }
    setState((prev) => {
      if (
        prev === 'chat' &&
        widgetCtx.sessionCtx.sessionState.get().session?.id
      ) {
        return 'input';
      }
      return 'pill';
    });
  }, [panelLayout, widgetCtx]);

  // Close paths split by input modality so morphTransition matches intent
  const handlePointerClose = useCallback(() => {
    setKeyboardDriven(false);
    closePanel();
  }, [closePanel]);

  const handleKeyboardClose = useCallback(() => {
    setKeyboardDriven(true);
    closePanel();
  }, [closePanel]);

  /** Straight to pill — used only for external (config/imperative) closes */
  const dismiss = useCallback(() => {
    setState('pill');
  }, []);

  useEffect(() => {
    if (state === 'chat') hasBeenChatRef.current = true;
  }, [state]);

  // Layouts are a chat-panel concept only. Guard on hasBeenChatRef so this
  // only relaxes to compact when the panel LEAVES chat — never on a fresh
  // mount. The sidebar is exempt: it's a persistent docked layout, so closing
  // it must keep the layout as 'sidebar' (reopen returns to the sidebar, not
  // a compact card) — only fullscreen relaxes back down on close.
  useEffect(() => {
    if (
      state !== 'chat' &&
      hasBeenChatRef.current &&
      panelLayout !== 'sidebar'
    ) {
      setPanelLayout('compact');
    }
  }, [state, panelLayout]);

  const isFullscreenModal = state === 'chat' && panelLayout === 'fullscreen';
  // Page-touching effects are the embedder's call, not ours
  const fullscreenBackdropBlur = companion?.fullscreen?.backdropBlur !== false;
  const fullscreenLockScroll = companion?.fullscreen?.lockScroll !== false;

  // Modal behavior: the host page must not scroll behind the fullscreen
  useEffect(() => {
    if (!isFullscreenModal || !fullscreenLockScroll) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFullscreenModal, fullscreenLockScroll]);

  // Two-way sync with the shared trigger context (config.isOpen, imperative
  // widget ref API). `lastPushedIsOpenRef` marks the values WE pushed so the
  // external-change effect can tell an echo of our own push from a genuine
  // outside setIsOpen. The external effect must NOT depend on `state`:
  // otherwise it re-runs in the same commit that pushes a new state — still
  // seeing the stale isOpen — and closes what was just opened, ping-ponging
  // pill↔input until React hits its nested-update limit.
  const lastPushedIsOpenRef = useRef<boolean>(false);
  useEffect(() => {
    const open = state !== 'pill';
    lastPushedIsOpenRef.current = open;
    setIsOpen(open);
  }, [state, setIsOpen]);

  useEffect(() => {
    if (isOpen === lastPushedIsOpenRef.current) return;
    lastPushedIsOpenRef.current = isOpen;
    if (isOpen) openPanel();
    else dismiss();
  }, [isOpen, openPanel, dismiss]);

  // Escape to close (host document;
  // keystrokes inside the iframe are handled by CompanionContent)
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && state !== 'pill') {
        handleKeyboardClose();
      }
    }
    document.addEventListener('keydown', handleGlobalKey);
    return () => document.removeEventListener('keydown', handleGlobalKey);
  }, [handleKeyboardClose, state]);

  // Click-outside closes. Clicks inside the content iframe never reach the
  // host document, so this only fires for genuine host-page clicks.
  // composedPath, not e.target: when the widget mounts inside a shadow
  // root (e.g. the opencx dashboard playground), document-level listeners
  // see e.target retargeted to the shadow HOST — contains() would report
  // every in-panel click as outside and instantly close the panel.
  useEffect(() => {
    // The docked sidebar is meant to coexist with the page (the whole point of
    // the app-frame), so page clicks must NOT close it — only its X / Escape do.
    if (state === 'pill' || isSidebar) return;
    function handleClick(e: MouseEvent) {
      const container = containerRef.current;
      if (!container) return;
      if (!e.composedPath().includes(container)) {
        setKeyboardDriven(false);
        closePanel();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [closePanel, state, isSidebar]);

  // The quick-ask composer IS the stock composer — it already dispatched the
  // message into the CURRENT session context (creating the session if needed).
  // So the shell only flips the router SCREEN to chat and morphs the card into
  // the panel. It must NOT call routerCtx.toChatScreen(): that runs resetChat()
  // first, which wipes the just-sent optimistic message and aborts the in-flight
  // createSession/send (surfacing as an unhandled "Resetting chat" rejection and
  // dropping the panel to an empty conversation).
  const handleQuickAskSent = useCallback(() => {
    if (widgetCtx.routerCtx.state.get().screen !== 'chat') {
      widgetCtx.routerCtx.state.setPartial({ screen: 'chat' });
    }
    setState('chat');
  }, [widgetCtx]);

  // Pop the follow-up bar back up into the open conversation. The input state
  // with an active session is only ever reached by minimizing an open chat, so
  // the router is already on the chat screen; guard the screen flip anyway.
  const handleExpand = useCallback(() => {
    setKeyboardDriven(false);
    if (
      widgetCtx.routerCtx.state.get().screen !== 'chat' &&
      widgetCtx.sessionCtx.sessionState.get().session?.id
    ) {
      widgetCtx.routerCtx.state.setPartial({ screen: 'chat' });
    }
    setState('chat');
  }, [widgetCtx]);

  // The corner layout picker switches between all arrangements. Every target —
  // compact, fullscreen, sidebar — re-renders THIS shell in place, so the panel
  // morphs from the current rect to the next (no component swap).
  const handleSelectLayout = useCallback(
    (target: PanelLayout) => {
      setKeyboardDriven(false);
      // Fullscreen is a conversation stage — the sessions list stays in the
      // compact card (it strands badly in a huge column), so leave it first.
      if (
        target === 'fullscreen' &&
        widgetCtx.routerCtx.state.get().screen === 'sessions'
      ) {
        widgetCtx.routerCtx.toChatScreen(
          widgetCtx.sessionCtx.sessionState.get().session?.id,
        );
      }
      setPanelLayout(target);
    },
    [widgetCtx, setPanelLayout],
  );

  // Drag-resize the sidebar: a host-DOM handle on the panel's inline-start
  // edge maps clientX to width. The app-frame transition pauses mid-drag so
  // the page tracks the panel 1:1 instead of lagging behind a spring.
  const onSidebarResizeDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setSidebarResizing(true);
      setFrameAnimated(false);
    },
    [],
  );
  const onSidebarResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const next = dir === 'rtl' ? e.clientX : window.innerWidth - e.clientX;
      setSidebarWidth(clamp(next, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH));
    },
    [dir],
  );
  const onSidebarResizeUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setSidebarResizing(false);
      setFrameAnimated(true);
      try {
        localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
      } catch {
        // Storage full or unavailable — ignore
      }
    },
    [sidebarWidth],
  );

  // Sidebar app-frame: while the sidebar layout is active, body itself becomes
  // a framed child window that insets to make room for the panel (app-frame.ts).
  // Mounted for the layout's lifetime; the open inset toggles with the panel
  // state; width tracks the resizable panel.
  const sidebarCanvas = companion?.sidebar?.canvasColor ?? SIDEBAR_CANVAS;
  const sidebarFramePage = companion?.sidebar?.framePage !== false;
  const pageBackground = `hsl(${readCssVar(cssVars, '--opencx-background')})`;
  useEffect(() => {
    if (!isSidebar || !sidebarFramePage) return;
    mountAppFrame({ canvas: sidebarCanvas, dir, pageBackground });
    return () => unmountAppFrame();
  }, [isSidebar, sidebarFramePage, sidebarCanvas, dir, pageBackground]);
  useEffect(() => {
    if (isSidebar && sidebarFramePage) setFrameWidth(effectiveSidebarWidth);
  }, [isSidebar, sidebarFramePage, effectiveSidebarWidth]);
  useEffect(() => {
    if (isSidebar && sidebarFramePage) setFrameOpen(state !== 'pill');
  }, [isSidebar, sidebarFramePage, state]);

  // History = the stock sessions screen, rendered inside the same panel
  const handleHistory = useCallback(() => {
    setKeyboardDriven(false);
    setState('chat');
    // The sessions list is a card-sized screen — a fullscreen column just
    // strands it in empty space. Always show history in the compact panel.
    setPanelLayout('compact');
    widgetCtx.routerCtx.toSessionsScreen();
  }, [widgetCtx]);

  // Portal to document.documentElement: <Widget> may render arbitrarily
  // deep in the host app (shadow roots, transformed/stacking-context
  // ancestors — e.g. the opencx dashboard preview, where an app rail
  // otherwise paints OVER the fullscreen modal). Root-level mounting is
  // the same guarantee the embed script provides; see useHostPortal for
  // why it must sit above body.
  const portalTarget = useHostPortal();
  if (!portalTarget) return null;

  return createPortal(
    <>
      {/* Embedder-supplied trigger (same contract as popover mode) — it
          replaces the resting pill entirely and drives the panel via
          setIsOpen; the panel still opens from the bottom-center baseline. */}
      {customTrigger?.({
        react: React,
        isOpen,
        setIsOpen: (open: boolean) => setIsOpen(open),
      })}

      {/* Blur veil — softly defocuses the host page while fullscreen; no
          tint or darkening, ever. Lives OUTSIDE the container:
          position:fixed breaks inside a transformed ancestor. Always
          mounted (opacity 0 + no pointer events at rest) so there's no
          exit-animation zombie in hidden tabs. Clicking it hits the
          existing outside-mousedown handler → staged close. */}
      {fullscreenBackdropBlur && (
        <motion.div
          aria-hidden
          style={{
            position: 'fixed',
            ...(containerEl
              ? {
                  left: region.left,
                  top: region.top,
                  width: region.width,
                  height: region.height,
                }
              : { inset: 0 }),
            background: 'transparent',
            backdropFilter: SCRIM_BACKDROP_FILTER,
            WebkitBackdropFilter: SCRIM_BACKDROP_FILTER,
            zIndex: theme.widgetContentContainer.zIndex,
            pointerEvents: isFullscreenModal ? 'auto' : 'none',
          }}
          initial={false}
          animate={{ opacity: isFullscreenModal ? 1 : 0 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
        />
      )}
      <motion.div
        ref={containerRef}
        style={{
          ...cssVars,
          position: 'fixed',
          x: dragX,
          translateX: '-50%',
          zIndex: theme.widgetContentContainer.zIndex,
          // With a custom trigger the shell has no resting look of its own
          visibility: hasCustomTrigger && isPill ? 'hidden' : undefined,
        }}
        // Anchor animates with the morph spring: the shell's center-x and
        // bottom spring between the compact/fullscreen center and the sidebar
        // edge, so a layout switch expands FROM the current rect in place.
        initial={false}
        animate={{ left: shellCenterX, bottom: shellBottom }}
        drag={isPill && !hasCustomTrigger ? 'x' : false}
        dragMomentum={false}
        dragElastic={0.15}
        dragConstraints={dragConstraints}
        onDragStart={() => {
          wasDraggingRef.current = true;
        }}
        onDragEnd={() => {
          handleDragEnd();
          requestAnimationFrame(() => {
            wasDraggingRef.current = false;
          });
        }}
        transition={morphTransition}
      >
        {/* Morphing shell — its surface is the background theme token, so
            palette changes recolor companion chrome like any stock screen */}
        <motion.div
          onClick={
            isPill && !hasCustomTrigger
              ? () => {
                  if (wasDraggingRef.current) return;
                  setKeyboardDriven(false);
                  // The companion pill is the single launcher for every layout.
                  // Sidebar opens straight into the full docked panel (no
                  // quick-ask bar): the shell morphs the pill up into the
                  // sidebar rect in place — one shell, no component swap.
                  if (panelLayout === 'sidebar') {
                    setState('chat');
                    return;
                  }
                  openPanel();
                }
              : undefined
          }
          role={isPill && !hasCustomTrigger ? 'button' : undefined}
          aria-label={isPill && !hasCustomTrigger ? pillAriaLabel : undefined}
          onPointerEnter={
            isPill && !hasCustomTrigger ? () => setPillHovered(true) : undefined
          }
          onPointerLeave={() => setPillHovered(false)}
          style={{
            position: 'relative',
            overflow: 'hidden',
            transformOrigin: 'center bottom',
            cursor:
              isPill && !hasCustomTrigger
                ? docked
                  ? 'pointer'
                  : 'grab'
                : 'default',
            // Static surface — spring-interpolating a dark→light background
            // reads as a big dark blob mid-morph. The resting looks are
            // separate overlays that cross-fade instead.
            background: 'hsl(var(--opencx-background))',
          }}
          // First paint lands directly on the resting pill; no mount morph
          initial={false}
          animate={{
            x: dockGrowX,
            width: currentDims.width,
            height: currentDims.height,
            borderTopLeftRadius: currentDims.borderRadius,
            borderTopRightRadius: currentDims.borderRadius,
            borderBottomLeftRadius: currentDims.borderRadius,
            borderBottomRightRadius: currentDims.borderRadius,
            boxShadow: isPill
              ? docked
                ? DOCK_SHADOW
                : PILL_SHADOW
              : state === 'input'
                ? INPUT_SHADOW
                : CHAT_SHADOW,
          }}
          // Hover: scale only — animating boxShadow repaints a large region
          // on an interaction that fires tens of times a day. The dock gets
          // a whisper (1.01); the icon pill can afford the playful 1.12.
          whileHover={
            isPill && !hasCustomTrigger && canHover && !shouldReduceMotion
              ? { scale: docked ? 1.01 : 1.12 }
              : undefined
          }
          whileTap={
            isPill && !hasCustomTrigger
              ? { scale: docked ? 0.995 : 0.92 }
              : undefined
          }
          transition={morphTransition}
        >
          {!hasCustomTrigger && (
            <RestingPill
              visible={isPill}
              docked={docked}
              label={dockLabel}
              icon={companionIcon}
              pillBackground={pillBackground}
              dir={dir}
              measureRef={dockContentRef}
            />
          )}

          {/* Content iframe — one instance across input↔chat so the iframe
              survives the staged collapse. Deliberately NOT wrapped in
              AnimatePresence: exit animations depend on rAF, which never
              ticks in hidden/background tabs, so an exiting clone of this
              whole tree (iframe + screens) could stay mounted indefinitely
              and fight the live one over shared refs. The shrinking shell
              covers the instant unmount visually. */}
          {state !== 'pill' && (
            <motion.div
              style={{
                position: 'absolute',
                bottom: 0,
                left: '50%',
                translateX: '-50%',
                width: contentWidth,
                height: contentHeight,
              }}
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: {
                  duration: 0.15,
                  // The fade waits for the morph on pointer opens; on
                  // keyboard opens or reduced motion that wait is just lag
                  delay: keyboardDriven || shouldReduceMotion ? 0 : 0.1,
                },
              }}
            >
              <CompanionFrame
                iframeRef={contentIframeRef}
                initialContent={initialContent}
                title="OpenCX Live Chat"
                style={{
                  width: '100%',
                  height: '100%',
                  overflow: 'hidden',
                  backgroundColor: 'transparent',
                  boxSizing: 'border-box',
                  borderWidth: '0px',
                }}
              >
                <CompanionContent
                  state={state === 'chat' ? 'chat' : 'input'}
                  layout={panelLayout}
                  onMessageSent={handleQuickAskSent}
                  onClose={handlePointerClose}
                  onEscape={handleKeyboardClose}
                  onSelectLayout={handleSelectLayout}
                  onHistory={handleHistory}
                  onExpand={handleExpand}
                  canExpand={hasActiveSession}
                  placeholder={quickAskPlaceholder}
                  onInputHeightChange={setInputHeight}
                />
              </CompanionFrame>
            </motion.div>
          )}

          {/* Drag-resize handle — the sidebar's inline-start edge. Host-DOM
              (not in the iframe) so the pointer capture spans the whole drag. */}
          {isSidebar && state === 'chat' && (
            <div
              data-opencx-sidebar-resize
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize chat"
              onPointerDown={onSidebarResizeDown}
              onPointerMove={onSidebarResizeMove}
              onPointerUp={onSidebarResizeUp}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                insetInlineStart: 0,
                width: 8,
                cursor: 'ew-resize',
                zIndex: 2,
              }}
            />
          )}
        </motion.div>
      </motion.div>
    </>,
    portalTarget,
  );
}
