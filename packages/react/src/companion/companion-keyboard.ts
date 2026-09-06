import type { WidgetCompanionLayoutU } from '@opencx/widget-core';
import type { PanelState } from './types';
import { matchesBinding, WIDGET_KEYBINDINGS } from '../utils/keybindings';

const NESTED_ESCAPE_SCOPE = '[data-opencx-escape-scope]';

function isInsideNestedEscapeScope(event: KeyboardEvent): boolean {
  // Companion content lives in an iframe. Avoid `instanceof Element`: its
  // target belongs to the iframe realm, while this module runs in the host.
  const target = event.target as {
    closest?: (selector: string) => unknown;
  } | null;
  return target?.closest?.(NESTED_ESCAPE_SCOPE) != null;
}

/** Host-page shortcuts must always be modified chords. A bare Escape belongs
 * to the host page; the iframe handler below owns closing the companion. */
export function handleCompanionHostKeyDown(
  event: KeyboardEvent,
  {
    state,
    onToggleFullscreen,
  }: {
    state: PanelState;
    onToggleFullscreen: () => void;
  },
): void {
  if (event.defaultPrevented || state !== 'chat') return;
  if (!matchesBinding(event, WIDGET_KEYBINDINGS['toggle-fullscreen'])) return;
  event.preventDefault();
  onToggleFullscreen();
}

/** Shortcuts for the companion iframe. Nested dismissibles get first refusal
 * on Escape; Radix marks the event default-prevented in capture phase, and the
 * explicit scope covers other inline dismissibles using the same convention. */
export function handleCompanionFrameKeyDown(
  event: KeyboardEvent,
  {
    state,
    onDismiss,
    onToggleFullscreen,
  }: {
    state: Exclude<PanelState, 'pill'>;
    onDismiss: () => void;
    onToggleFullscreen: () => void;
  },
): void {
  if (event.defaultPrevented) return;
  if (matchesBinding(event, WIDGET_KEYBINDINGS['close-panel'])) {
    if (!isInsideNestedEscapeScope(event)) onDismiss();
    return;
  }
  if (
    state === 'chat' &&
    matchesBinding(event, WIDGET_KEYBINDINGS['toggle-fullscreen'])
  ) {
    event.preventDefault();
    onToggleFullscreen();
  }
}

/** What Escape does to an open panel. */
export type EscapeAction =
  | { kind: 'layout'; layout: WidgetCompanionLayoutU }
  | { kind: 'close' };

/**
 * Escape reads the panel's LAYOUT, not its state: fullscreen is a mode the
 * visitor entered, so Escape leaves the mode and lands back on the layout they
 * came from — everywhere else Escape means dismiss, straight to the launcher.
 * (The × button keeps its staged collapse: that control is a minimize, this
 * key is a dismissal, and conflating them made Escape feel like it did
 * nothing.)
 *
 * Falls back to the configured resting layout when the one they came from is
 * no longer allowed, and closes outright when every non-fullscreen layout is
 * excluded — a fullscreen-only embed has no mode to fall back to.
 */
export function resolveEscapeAction({
  panelLayout,
  previousLayout,
  defaultLayout,
  allowedLayouts,
}: {
  panelLayout: WidgetCompanionLayoutU;
  /** The non-fullscreen layout the panel was in before going fullscreen. */
  previousLayout: WidgetCompanionLayoutU;
  defaultLayout: WidgetCompanionLayoutU;
  allowedLayouts: ReadonlyArray<WidgetCompanionLayoutU>;
}): EscapeAction {
  if (panelLayout !== 'fullscreen') return { kind: 'close' };
  const candidates = [previousLayout, defaultLayout];
  for (const layout of candidates) {
    if (layout !== 'fullscreen' && allowedLayouts.includes(layout)) {
      return { kind: 'layout', layout };
    }
  }
  const anyOther = allowedLayouts.find((layout) => layout !== 'fullscreen');
  return anyOther ? { kind: 'layout', layout: anyOther } : { kind: 'close' };
}
