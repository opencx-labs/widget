import { describe, expect, it } from 'vitest';
import { flatMessageCss } from '../message-styles';

describe('flatMessageCss (v5 default: no bubbles for AI replies)', () => {
  it('unbubbles the agent message and keeps the user chip styled', () => {
    const css = flatMessageCss('[data-companion-root]');
    expect(css).toContain('chat/agent_msg/msg');
    expect(css).toContain('background: transparent');
    expect(css).toContain('chat/user_msg/msg');
  });

  it('tables scroll horizontally and cells never per-character wrap (regression: 1-char columns)', () => {
    // `overflow-wrap: anywhere` on the message shrinks table cells to their
    // min-content width, shredding every column into vertical letters. The
    // message uses break-word (no min-content effect), tables get their own
    // scroll container, and cells restore normal wrapping.
    const css = flatMessageCss('[data-companion-root]');
    expect(css).toContain('overflow-wrap: break-word');
    expect(css).not.toContain('overflow-wrap: anywhere');
    expect(css).toMatch(/table \{[^}]*display: block/);
    expect(css).toMatch(/table \{[^}]*overflow-x: auto/);
    expect(css).toMatch(/td \{[^}]*overflow-wrap: normal/);
    // Cells WRAP to fit the narrow panel (nowrap forced huge intrinsic column
    // widths that clipped at the edge); horizontal scroll is the fallback for
    // genuinely unbreakable content only.
    expect(css).toMatch(/td \{[^}]*white-space: normal/);
    expect(css).not.toContain('white-space: nowrap');
  });

  it('scopes every rule to the passed root selector', () => {
    const css = flatMessageCss('[data-opencx-sidebar-content]');
    for (const line of css.split('\n')) {
      if (line.includes('[data-component')) {
        expect(line.startsWith('[data-opencx-sidebar-content]')).toBe(true);
      }
    }
  });
});
