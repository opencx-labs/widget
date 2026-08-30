import { motion, useReducedMotion } from 'framer-motion';
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
import type { WidgetCompanionLayoutU } from '@opencx/widget-core';
import { buildFrameHtml } from '../components/FrameDocument';
import { usePageMarks } from '../page-marks/PageMarksProvider';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../hooks/useTranslation';
import { useTriggerLabel } from '../hooks/useTriggerLabel';
import { renderCustomTrigger } from '../utils/render-custom-trigger';
import { CompanionContent } from './CompanionContent';
import { CompanionFrame } from './CompanionFrame';
import {
  chatDims,
  compactWidth as resolveCompactWidth,
  DOCK_HEIGHT,
  PILL_SIZE,
  RADII,
  shellAnchor,
} from './companion-geometry.utils';
import { RestingPill } from './RestingPill';
import {
  CHAT_SHADOW,
  DOCK_SHADOW,
  EASE_OUT,
  INPUT_SHADOW,
  MORPH_SPRING,
  PILL_SHADOW,
} from './materials';
import type { PanelState } from './types';
import { useCompanionHostEffects } from './useCompanionHostEffects';
import { useCompanionMeasurements } from './useCompanionMeasurements';
import { useHostPortal } from './useHostPortal';
import { usePersistedPillDrag } from './usePersistedPillDrag';
import { handleCompanionHostKeyDown } from './companion-keyboard';

/** Gentler-not-zero: keep the fades, collapse the travel (reduced motion),
 * and skip the theatrics on keyboard-initiated opens. */
const SNAPPY = { duration: 0.15, ease: EASE_OUT } as const;

/** Quick-ask card seed height until the composer measures itself. */
const COMPANION_INPUT_FALLBACK_HEIGHT = 96;

const initialContent = buildFrameHtml({ transparent: true });

export function WidgetCompanion() {
  const { isOpen, setIsOpen } = useWidgetTrigger();
  const { widgetCtx, contentIframeRef } = useWidget();
  const { companion, assets, customComponents } = useConfig();
  const { theme, cssVars } = useTheme();
  const { t, dir, hostDocumentDir } = useTranslation();
  const { sessionState } = useSessions();
  const { isArmed: isPageMarkModeArmed } = usePageMarks();
  const { region, dockWidth, dockContentRef } = useCompanionMeasurements();

  // Seed from isOpen so a layout swap-in (sidebar → fullscreen/compact) mounts
  // straight into the open chat instead of flashing the resting pill for a
  // frame. The isOpen-sync effect refines it (input vs chat) right after.
  const [state, setState] = useState<PanelState>(isOpen ? 'chat' : 'pill');
  const {
    layout: panelLayout,
    setLayout: setPanelLayout,
    allowedLayouts,
    defaultLayout,
  } = useWidgetLayout();
  // The quick-ask card is the real composer, which grows as the user types;
  // its measured height drives the shell card so the two stay in lockstep.
  const [inputHeight, setInputHeight] = useState(
    COMPANION_INPUT_FALLBACK_HEIGHT,
  );

  const { sidebarWidth, sidebarResizing, resizeHandleProps } =
    useCompanionHostEffects({
      companion,
      layout: panelLayout,
      state,
      region,
      dir: hostDocumentDir,
      cssVars,
      storage: widgetCtx.storageCtx,
      resizeLabel: t('companion_resize_chat'),
    });

  const shouldReduceMotion = useReducedMotion();
  // Keyboard-driven transitions (Escape, ...) skip the spring + fade
  // delay — keyboard users are on the fast path, and the morph only earns
  // its time on a pointer journey. The flag tracks the CURRENT input
  // modality: set by keyboard handlers, cleared by pointer handlers, so a
  // keyboard flow stays snappy end-to-end and a click restores the spring.
  const [keyboardDriven, setKeyboardDriven] = useState(false);
  const morphTransition = sidebarResizing
    ? // Drag-resize is a direct manipulation: the shell must track the pointer
      // 1:1, not spring after it. Restored to MORPH_SPRING on pointer-up.
      { duration: 0 }
    : shouldReduceMotion || keyboardDriven
      ? SNAPPY
      : MORPH_SPRING;
  // Hover motion is gated off coarse pointers — tap-to-hover on touch reads
  // as a phantom wiggle before every open.
  const [canHover] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  );

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
  /** Every state shares one bottom offset: pill → input is pure horizontal
   * growth and the chat panel grows upward from the same baseline — no
   * vertical jump anywhere in the morph. It is the RESOLVED
   * theme.widgetTrigger.offset.bottom (useTheme supplies the default), so
   * embedders who position the popover trigger keep their offset here. */
  const bottomOffset = theme.widgetTrigger.offset.bottom;
  const pillAriaLabel = useTriggerLabel();

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
  // "Follow up…" unless the embedder supplied an explicit placeholder.
  const quickAskPlaceholder =
    companion?.placeholder ?? continueLabel ?? t('write_a_message_placeholder');
  const [pillHovered, setPillHovered] = useState(false);
  const docked =
    isPill &&
    !hasCustomTrigger &&
    dockLabelDisplay !== 'never' &&
    (dockLabelDisplay === 'always' || (canHover && pillHovered));

  const compactWidth = resolveCompactWidth(region, companion?.compact);
  const isSidebar = panelLayout === 'sidebar';
  const resolvedChatDims = chatDims({
    layout: panelLayout,
    region,
    sidebarWidth,
    bottomOffset,
    compact: companion?.compact,
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
  const contentWidth = state === 'chat' ? resolvedChatDims.width : compactWidth;
  // The column owns its full height in every layout — the stock chat header
  // (with PanelControls) lives inside it, so no top strip is reserved.
  const contentHeight = resolvedChatDims.height;

  // Container anchor, ANIMATED (px) so every layout morphs its position, not
  // just the inner shell's size: compact/fullscreen center horizontally and
  // grow from the bottom baseline; the sidebar pins to the inline-end edge and
  // spans the full height. Animating left/bottom (vs. a static style) is what
  // lets sidebar↔fullscreen↔compact spring between rects instead of jumping.
  const { centerX: shellCenterX, bottom: shellBottom } = shellAnchor({
    isChatOpen: state === 'chat',
    layout: panelLayout,
    region,
    sidebarWidth,
    dir: hostDocumentDir,
    bottomOffset,
  });

  const currentDims = useMemo(() => {
    if (state === 'pill') {
      if (docked) {
        return {
          width: dockWidth,
          height: DOCK_HEIGHT,
          borderRadius: RADII.pill,
        };
      }
      return { width: PILL_SIZE, height: PILL_SIZE, borderRadius: RADII.pill };
    }
    if (state === 'input') {
      return {
        width: compactWidth,
        height: inputHeight,
        borderRadius: RADII.input,
      };
    }
    return resolvedChatDims;
  }, [state, docked, dockWidth, compactWidth, resolvedChatDims, inputHeight]);

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

  const { dragX, dragConstraints, onDragStart, onDragEnd, shouldIgnoreLaunch } =
    usePersistedPillDrag({
      storage: widgetCtx.storageCtx,
      state,
      layout: panelLayout,
      viewportWidth: region.width,
      currentWidth: currentDims.width,
      restingWidth: docked ? dockWidth : PILL_SIZE,
      shouldReduceMotion,
    });

  // State reads that must not go stale in callbacks come straight from the
  // core contexts instead of render-time snapshots.
  const openPanel = useCallback(() => {
    const screen = widgetCtx.routerCtx.state.get().screen;
    const hasSession = !!widgetCtx.sessionCtx.sessionState.get().session?.id;
    // The welcome (data collection) screen needs the full panel; the bare
    // input bar is only for starting/continuing a conversation.
    setState(screen === 'welcome' || hasSession ? 'chat' : 'input');
  }, [widgetCtx]);

  const launchFromPill = useCallback(
    (keyboard: boolean) => {
      if (shouldIgnoreLaunch()) return;
      setKeyboardDriven(keyboard);
      if (panelLayout === 'sidebar') {
        setState('chat');
        return;
      }
      openPanel();
    },
    [openPanel, panelLayout, shouldIgnoreLaunch],
  );

  const closePanel = useCallback(() => {
    // Staged collapse, one rung per close: fullscreen → configured resting
    // layout → input bar → pill. Jumping from a large panel straight to the icon
    // reads as the widget vanishing; each stage keeps the user oriented
    // and one step from returning.
    if (panelLayout === 'fullscreen' && defaultLayout !== 'fullscreen') {
      setPanelLayout(defaultLayout);
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
  }, [defaultLayout, panelLayout, setPanelLayout, widgetCtx]);

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
  // only relaxes fullscreen to the valid default when the panel leaves chat,
  // never on a fresh mount. The sidebar is exempt: it's a persistent docked
  // layout, so closing
  // it must keep the layout as 'sidebar' (reopen returns to the sidebar, not
  // a floating card).
  useEffect(() => {
    if (
      state !== 'chat' &&
      hasBeenChatRef.current &&
      panelLayout === 'fullscreen' &&
      defaultLayout !== 'fullscreen'
    ) {
      setPanelLayout(defaultLayout);
    }
  }, [defaultLayout, panelLayout, setPanelLayout, state]);

  const isFullscreenModal = state === 'chat' && panelLayout === 'fullscreen';

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
      // While mark mode is armed, host-page interactions ARE the feature
      // (placing/moving marks, the host-rendered note card) — closing the
      // panel would unmount the composer and destroy the draft mark.
      if (isPageMarkModeArmed) return;
      const container = containerRef.current;
      if (!container) return;
      if (!e.composedPath().includes(container)) {
        setKeyboardDriven(false);
        closePanel();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [closePanel, state, isSidebar, isPageMarkModeArmed]);

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
  const selectLayout = useCallback(
    (target: WidgetCompanionLayoutU) => {
      if (!allowedLayouts.includes(target)) return;
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
    [allowedLayouts, widgetCtx, setPanelLayout],
  );

  const handleSelectLayout = useCallback(
    (target: WidgetCompanionLayoutU) => {
      setKeyboardDriven(false);
      selectLayout(target);
    },
    [selectLayout],
  );

  // The fullscreen shortcut is a TOGGLE, so it remembers where it came from:
  // pressing it in the sidebar goes fullscreen, pressing it again returns to
  // the sidebar (not to compact, which would silently drop the docked layout).
  const firstNonFullscreenLayout = allowedLayouts.find(
    (layout) => layout !== 'fullscreen',
  );
  const lastNonFullscreenLayoutRef = useRef<WidgetCompanionLayoutU>(
    firstNonFullscreenLayout ?? defaultLayout,
  );
  useEffect(() => {
    if (panelLayout !== 'fullscreen' && allowedLayouts.includes(panelLayout)) {
      lastNonFullscreenLayoutRef.current = panelLayout;
    } else if (
      lastNonFullscreenLayoutRef.current === 'fullscreen' ||
      !allowedLayouts.includes(lastNonFullscreenLayoutRef.current)
    ) {
      lastNonFullscreenLayoutRef.current =
        firstNonFullscreenLayout ?? defaultLayout;
    }
  }, [allowedLayouts, defaultLayout, firstNonFullscreenLayout, panelLayout]);

  const handleToggleFullscreen = useCallback(() => {
    if (!allowedLayouts.includes('fullscreen')) return;
    setKeyboardDriven(true);
    if (panelLayout !== 'fullscreen') {
      selectLayout('fullscreen');
      return;
    }
    const previous = lastNonFullscreenLayoutRef.current;
    if (previous !== 'fullscreen' && allowedLayouts.includes(previous)) {
      selectLayout(previous);
    }
  }, [allowedLayouts, panelLayout, selectLayout]);

  // Only the modified fullscreen chord belongs on the HOST document. Bare
  // Escape belongs to the host page; CompanionContent handles it inside the
  // widget iframe, where the panel actually owns keyboard focus.
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      handleCompanionHostKeyDown(e, {
        state,
        onToggleFullscreen: handleToggleFullscreen,
      });
    }
    document.addEventListener('keydown', handleGlobalKey);
    return () => document.removeEventListener('keydown', handleGlobalKey);
  }, [handleToggleFullscreen, state]);

  // History = the stock sessions screen, rendered inside the same panel
  const handleHistory = useCallback(() => {
    setKeyboardDriven(false);
    setState('chat');
    // The sessions list is a card-sized screen — a fullscreen column just
    // strands it in empty space. Prefer the first configured non-fullscreen
    // layout, but never transition to a layout the embedder excluded.
    setPanelLayout(firstNonFullscreenLayout ?? defaultLayout);
    widgetCtx.routerCtx.toSessionsScreen();
  }, [defaultLayout, firstNonFullscreenLayout, setPanelLayout, widgetCtx]);

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
      {customTrigger && renderCustomTrigger(customTrigger, isOpen, setIsOpen)}

      {/* Modal scrim — fully transparent; it never tints, darkens or blurs
          the host page. Its only job is to swallow host-page clicks while
          fullscreen is open (they hit the existing outside-mousedown handler
          → staged close). Lives OUTSIDE the container: position:fixed breaks
          inside a transformed ancestor. Always mounted (no pointer events at
          rest) so there's no exit-animation zombie in hidden tabs. */}
      <motion.div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: 'transparent',
          zIndex: theme.widgetContentContainer.zIndex,
          pointerEvents: isFullscreenModal ? 'auto' : 'none',
        }}
        initial={false}
        animate={{ opacity: isFullscreenModal ? 1 : 0 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
      />

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
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        transition={morphTransition}
      >
        {/* Morphing shell — its surface is the background theme token, so
            palette changes recolor companion chrome like any stock screen */}
        <motion.div
          onClick={
            isPill && !hasCustomTrigger
              ? () => launchFromPill(false)
              : undefined
          }
          role={isPill && !hasCustomTrigger ? 'button' : undefined}
          tabIndex={isPill && !hasCustomTrigger ? 0 : undefined}
          aria-label={isPill && !hasCustomTrigger ? pillAriaLabel : undefined}
          aria-expanded={isPill && !hasCustomTrigger ? false : undefined}
          onKeyDown={
            isPill && !hasCustomTrigger
              ? (event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  launchFromPill(true);
                }
              : undefined
          }
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
            // reads as a big dark blob mid-morph. The resting look is a
            // separate overlay (RestingPill) that fades its opacity instead.
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
                  onToggleFullscreen={handleToggleFullscreen}
                  onSelectLayout={handleSelectLayout}
                  onHistory={handleHistory}
                  onExpand={handleExpand}
                  canExpand={hasActiveSession}
                  placeholder={quickAskPlaceholder}
                  hideAttachTools={
                    (companion?.quickAskTools ?? 'history-only') ===
                    'history-only'
                  }
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
              {...resizeHandleProps}
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
