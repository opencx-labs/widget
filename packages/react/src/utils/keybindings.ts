/**
 * The widget's keyboard shortcuts, as data. Every shortcut is a named action
 * here; handlers match events with `matchesBinding(event, WIDGET_KEYBINDINGS[a])`
 * and buttons render hints with `formatBinding(WIDGET_KEYBINDINGS[a])` — never
 * a hardcoded key check or a literal "⌘…" string in a component, so a binding
 * can never drift from the hint that advertises it.
 *
 * `Mod` resolves per platform: ⌘ on Apple devices, Ctrl everywhere else — the
 * widget runs on whatever machine the host page is viewed on.
 *
 * Scope rule for an EMBEDDED widget: bindings with modifiers are only
 * listened for while the panel is open, and single-key bindings only inside
 * the widget's own iframe/composer. The host page's shortcuts are not ours
 * to shadow.
 */

export type WidgetActionId =
  | 'close-panel'
  | 'toggle-fullscreen'
  | 'send'
  | 'send-alt'
  | 'history-prev'
  | 'history-next';

export const WIDGET_KEYBINDINGS: Record<WidgetActionId, string> = {
  /** Staged close: fullscreen → configured resting layout → input bar → pill. */
  'close-panel': 'Escape',
  /** Toggle the companion chat panel between fullscreen and its prior layout. */
  'toggle-fullscreen': 'Mod+Shift+F',
  /** Send the composed message (Shift+Enter inserts a newline). */
  send: 'Enter',
  /**
   * Muscle-memory alias for `send`, from every other chat app. Deliberately
   * NOT advertised in the send button's hint — that shows the primary
   * binding — but it lives here so the handler never hardcodes it.
   */
  'send-alt': 'Mod+Enter',
  /**
   * Start walking sent-message history backwards (only from an empty
   * composer, or with the caret at the very start), and keep walking once in.
   */
  'history-prev': 'ArrowUp',
  /** Walk recall forward; past the newest entry the stashed draft returns. */
  'history-next': 'ArrowDown',
};

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

/** True when the event matches a "Mod+Shift+F"-style binding exactly —
 * extra held modifiers disqualify, so bindings never fire by accident. */
export function matchesBinding(
  event: Pick<
    KeyboardEvent,
    'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'
  >,
  binding: string,
  apple: boolean = isApplePlatform(),
): boolean {
  const parts = binding.split('+');
  const key = parts.at(-1) ?? '';
  const mods = new Set(parts.slice(0, -1));
  const wantMeta = mods.has('Cmd') || (mods.has('Mod') && apple);
  const wantCtrl = mods.has('Ctrl') || (mods.has('Mod') && !apple);
  if (event.metaKey !== wantMeta) return false;
  if (event.ctrlKey !== wantCtrl) return false;
  if (event.altKey !== mods.has('Alt')) return false;
  if (event.shiftKey !== mods.has('Shift')) return false;
  return event.key.toLowerCase() === key.toLowerCase();
}

const APPLE_MOD_SYMBOLS: Record<string, string> = {
  Mod: '⌘',
  Cmd: '⌘',
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
};

/** Keys whose display form is a compact symbol on every platform. */
const KEY_SYMBOLS: Record<string, string> = {
  Escape: 'Esc',
  Enter: '⏎',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** "Mod+Shift+F" → "⌘⇧F" on Apple platforms, "Ctrl+Shift+F" elsewhere. */
export function formatBinding(
  binding: string,
  apple: boolean = isApplePlatform(),
): string {
  const parts = binding.split('+');
  const key = parts.at(-1) ?? '';
  const mods = parts.slice(0, -1);
  const keyLabel =
    KEY_SYMBOLS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  if (apple) {
    return [...mods.map((m) => APPLE_MOD_SYMBOLS[m] ?? m), keyLabel].join('');
  }
  return [...mods.map((m) => (m === 'Mod' ? 'Ctrl' : m)), keyLabel].join('+');
}
