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
    onEscape,
    onToggleFullscreen,
  }: {
    state: Exclude<PanelState, 'pill'>;
    onEscape: () => void;
    onToggleFullscreen: () => void;
  },
): void {
  if (event.defaultPrevented) return;
  if (matchesBinding(event, WIDGET_KEYBINDINGS['close-panel'])) {
    if (!isInsideNestedEscapeScope(event)) onEscape();
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
