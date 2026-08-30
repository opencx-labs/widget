import { useConfig } from '@opencx/widget-react-headless';
import { HistoryIcon } from 'lucide-react';
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { FrameDocument } from '../components/FrameDocument';
import { Button } from '../components/lib/button';
import { RootScreen } from '../screens';
import { ChatInput } from '../screens/chat/ChatFooter';
import { RADII } from './companion-geometry.utils';
import { FLAT_MESSAGE_CSS } from './message-styles';
import type { WidgetCompanionLayoutU } from '@opencx/widget-core';
import { PanelControls } from './PanelControls';
import { useTranslation } from '../hooks/useTranslation';
import { handleCompanionFrameKeyDown } from './companion-keyboard';

/**
 * Companion-only restyle of the stock screens — layout rules only, never
 * colors of its own: every color is a theme token (palette / primaryColor),
 * so the embedder's colors and `cssOverrides` apply to the companion exactly
 * as they do to popover (FrameDocument injects `cssOverrides` after this
 * sheet, so their customizations win). The `widgetContentContainer`
 * sizing/radius/shadow keys are popover-only: the companion shell owns its
 * own geometry (companion-geometry.utils).
 */
const companionLayoutOverrides = `
/* Quick-ask (resting) composer: the stock card is a two-row layout (textarea
   over an attach/send row) wrapped in outer padding. In the companion pill it
   reads as a single quick-ask bar, so drop the outer pad and lay the card out
   on ONE row — textarea flex-fills, attach + send sit inline at the end.
   Scoped to the quick-ask pane only; the full chat panel keeps the stock
   two-row composer. */
[data-companion-input] [data-component="chat/input_box/root"] {
  padding: 0 !important;
}
[data-companion-input] [data-component="chat/input_box/inner_root"] {
  flex-direction: row !important;
  align-items: center !important;
  /* The root's space-y-1 puts a 4px top margin on this card (its first
     sibling is the hidden dropzone input); with the outer padding gone that
     margin shows as a strip of shell background above the bar. */
  margin-top: 0 !important;
  /* The stock card is rounded-3xl (24px), but the companion shell that frames
     it clips at RADII.input in the resting-input state. A mismatch leaves the
     shell's background token peeking out as a two-tone crescent at each
     corner, so the card takes the shell radius via the custom property set on
     the quick-ask pane — one clean rounded bar. */
  border-radius: var(--opencx-companion-input-radius) !important;
}
[data-companion-input] [data-component="chat/input_box/textarea_and_attachments_container"] {
  flex: 1 1 auto !important;
  min-width: 0 !important;
}

/* Fullscreen reading column: the panel is a full-width window, but message
   text across a 1900px panel wraps at ~200 characters. Cap the conversation
   and composer to one centered column; the header and corner controls stay
   full-width window chrome. The messages keep the cap as PADDING on the
   scroll container so the scrollbar stays at the panel edge; the footer gets
   a real max-width (+16px compensates the input card's own p-2) so the
   composer card's edges land exactly on the message column's edges. */
[data-companion-root][data-layout="fullscreen"] [data-component="chat/msgs/root"] {
  padding-inline: max(16px, calc((100% - var(--opencx-companion-content-max-width)) / 2)) !important;
}
[data-companion-root][data-layout="fullscreen"] [data-component="chat/main/root"] > footer {
  width: 100%;
  max-width: calc(var(--opencx-companion-content-max-width) + 16px);
  margin-inline: auto;
}

/* Sessions (conversation history) gets the same reading column: cards and the
   sticky new-conversation button stretch edge-to-edge otherwise. Padding (not
   max-width) for the same reason as the messages — the list IS the scroll
   container, so the scrollbar stays at the panel edge. */
[data-companion-root][data-layout="fullscreen"] [data-component="sessions/list"] {
  padding-inline: max(16px, calc((100% - var(--opencx-companion-content-max-width)) / 2)) !important;
}
`;

export function CompanionContent({
  state,
  layout,
  onMessageSent,
  onClose,
  onEscape,
  onToggleFullscreen,
  onSelectLayout,
  onHistory,
  onExpand,
  canExpand,
  placeholder,
  hideAttachTools,
  onInputHeightChange,
}: {
  state: 'input' | 'chat';
  layout: WidgetCompanionLayoutU;
  /** The user sent from the quick-ask composer — morph into the chat panel */
  onMessageSent: () => void;
  /** Quick-ask composer placeholder (e.g. "Follow up…" while continuing) */
  placeholder: string;
  /** Hide attach + page-mark tools on the quick-ask composer (default UX:
   *  history-only until the panel expands). */
  hideAttachTools: boolean;
  /** Pointer-initiated staged close (× button) */
  onClose: () => void;
  /** Keyboard-initiated staged close (Escape) */
  onEscape: () => void;
  /** Keyboard toggle between fullscreen and the prior layout (Mod+Shift+F) */
  onToggleFullscreen: () => void;
  /** Switch layout from the corner picker (compact / sidebar / fullscreen) */
  onSelectLayout: (layout: WidgetCompanionLayoutU) => void;
  /** Open conversation history in the first allowed non-fullscreen layout */
  onHistory: () => void;
  /** Expand the follow-up bar back up into the open chat panel */
  onExpand: () => void;
  /** There's an open conversation to expand back into — show the expand arrow */
  canExpand: boolean;
  /** Live height of the quick-ask composer, so the shell card grows with it */
  onInputHeightChange: (height: number) => void;
}) {
  const { companion } = useConfig();
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputPaneRef = useRef<HTMLDivElement>(null);

  // Agent chat default: flat, document-style AI replies (no bubbles) for
  // every companion layout. `companion.bubbles: true` opts back into chat
  // bubbles.
  const overrides =
    companion?.bubbles === true
      ? companionLayoutOverrides
      : companionLayoutOverrides + FLAT_MESSAGE_CSS;

  // Shortcuts pressed anywhere inside the iframe (message list, chat
  // composer, ...) — the mirror of WidgetCompanion's host-document handler,
  // because keystrokes inside the iframe never reach the host. Both dispatch
  // through the shared registry so the two surfaces cannot drift.
  useEffect(() => {
    const doc = rootRef.current?.ownerDocument;
    if (!doc) return;
    function handleKey(e: KeyboardEvent) {
      handleCompanionFrameKeyDown(e, {
        state,
        onEscape,
        onToggleFullscreen,
      });
    }
    doc.addEventListener('keydown', handleKey);
    return () => doc.removeEventListener('keydown', handleKey);
  }, [onEscape, onToggleFullscreen, state]);

  // Measure the real composer (it grows as the user types) and drive the
  // shell card height from it. The composer lives in the iframe document, so
  // observe with THAT document's ResizeObserver, not the host window's.
  // Layout effect (not passive): report the true height BEFORE the first
  // paint so the shell morphs straight to it. A passive effect paints one
  // frame at the fallback height first, so the bar opened tall then shrank
  // to fit — a visible wobble on every open.
  useLayoutEffect(() => {
    if (state !== 'input') return;
    const node = inputPaneRef.current;
    const RO = node?.ownerDocument.defaultView?.ResizeObserver;
    if (!node || !RO) return;
    const report = () => onInputHeightChange(node.offsetHeight);
    report();
    const observer = new RO(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [state, onInputHeightChange]);

  // Focus the composer the moment the quick-ask pane mounts: the user's very
  // next keystrokes must land in the textarea, not the host page. Without
  // this, typing that races the expand animation is silently lost — the pill
  // only transferred focus on an explicit click into the input. (Generic
  // querySelector typing, no cast: the iframe's elements belong to another
  // realm, so an instanceof check against the host's HTMLTextAreaElement
  // would be wrong.)
  useLayoutEffect(() => {
    if (state !== 'input' || canExpand) return;
    inputPaneRef.current
      ?.querySelector<HTMLTextAreaElement>('textarea')
      ?.focus({ preventScroll: true });
  }, [state, canExpand]);

  return (
    <FrameDocument overrides={overrides} rootRef={rootRef}>
      {/* Exactly ONE pane is mounted at a time. A hidden-but-mounted
          chat screen runs focus/measure logic against display:none
          elements, which can spin into update loops the moment it is
          revealed. Session/message state lives in the provider, so
          unmounting a pane loses nothing. The iframe is always
          chat-sized; the composer is its bottom strip and the shell
          clips everything above it. */}
      {state === 'input' ? (
        // The quick-ask state renders the EXACT stock composer (white card,
        // textarea, attach + send) — identical to the legacy widget, so it
        // inherits every embedder customization. Pinned to the bottom of the
        // chat-tall iframe; the shell clips to the measured composer height.
        <div
          ref={inputPaneRef}
          data-companion-input
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            // The shell clips the resting input at RADII.input; the stock
            // card inside matches it via this custom property (see the
            // companionLayoutOverrides rule) so the two radii cannot drift.
            ['--opencx-companion-input-radius' as string]: `${RADII.input}px`,
          }}
        >
          <ChatInput
            onMessageSent={onMessageSent}
            disableTooltips
            hideAttachTools={hideAttachTools}
            placeholder={placeholder}
            trailingActions={
              <Button
                onClick={onHistory}
                size="fit"
                variant="ghost"
                aria-label={t('companion_history')}
                className="rounded-full size-8 flex items-center justify-center p-0"
              >
                <HistoryIcon className="size-4" />
              </Button>
            }
          />
          {canExpand ? (
            // Minimized mid-conversation: the whole follow-up bar is one click
            // target that pops back up into the open chat — no separate control.
            // The overlay sits above the (non-interactive here) composer so a
            // click anywhere expands.
            <button
              type="button"
              aria-label={t('companion_expand_chat')}
              onClick={onExpand}
              className="absolute inset-0 z-10 cursor-pointer"
            />
          ) : null}
        </div>
      ) : (
        <div
          data-companion-root
          data-layout={layout}
          style={{
            position: 'absolute',
            inset: 0,
            ['--opencx-companion-content-max-width' as string]:
              companion?.contentMaxWidth ?? '48rem',
          }}
        >
          {/* No inner padding tricks for the fullscreen column: the
              iframe itself is sized to the column (WidgetCompanion) —
              the screens assume they own the iframe viewport. */}
          <RootScreen />
          {/* Same header as compact in every layout: the stock chat header
              (back chevron + title) plus these corner controls. Fullscreen
              just swaps the expand icon for a minimize one. */}
          <PanelControls
            layout={layout}
            onSelectLayout={onSelectLayout}
            onClose={onClose}
          />
        </div>
      )}
    </FrameDocument>
  );
}
