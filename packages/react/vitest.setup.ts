/**
 * jsdom lacks `CSS.escape` (and sometimes the `CSS` namespace entirely), while
 * every supported browser has it. Polyfill the minimum here so tests exercise
 * the same `CSS.escape` code path that runs in production instead of a
 * test-only fallback.
 */
const cssNamespace: Record<string, unknown> =
  typeof CSS === 'undefined' ? {} : (CSS as unknown as Record<string, unknown>);
if (typeof CSS === 'undefined') {
  Object.assign(globalThis, { CSS: cssNamespace });
}

if (typeof cssNamespace.escape !== 'function') {
  // Minimal CSS.escape: hex-escape a leading digit (`2fa` → `\32 fa`), keep
  // identifier characters and non-ASCII as-is, backslash-escape the rest —
  // the load-bearing subset of the CSSOM serialization algorithm.
  cssNamespace.escape = (value: string): string => {
    const str = String(value);
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str.charAt(i);
      const code = str.charCodeAt(i);
      const isDigit = code >= 0x30 && code <= 0x39;
      const isIdentChar =
        isDigit ||
        (code >= 0x41 && code <= 0x5a) || // A-Z
        (code >= 0x61 && code <= 0x7a) || // a-z
        code >= 0x80 ||
        ch === '-' ||
        ch === '_';
      if (i === 0 && isDigit) {
        out += `\\${code.toString(16)} `;
      } else if (isIdentChar) {
        out += ch;
      } else {
        out += `\\${ch}`;
      }
    }
    return out;
  };
}

/**
 * jsdom has no `PointerEvent`. The widget clicks the way a mouse does —
 * pointerover → pointerdown → mouseup → click — because that is the only
 * sequence a real component library responds to, so without this the whole
 * acting path throws here and every test of it would pass for the wrong
 * reason. Chromium's own behaviour is covered by the browser-mode specs;
 * this is the minimum that lets jsdom dispatch the same events.
 */
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? '';
      this.isPrimary = init.isPrimary ?? false;
    }
  }
  Object.assign(globalThis, { PointerEvent: PointerEventPolyfill });
}
