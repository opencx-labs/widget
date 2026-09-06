import { describe, expect, it } from 'vitest';
import { FLAT_MESSAGE_CSS } from '../message-styles';

describe('FLAT_MESSAGE_CSS (agent chat default: no bubbles for AI replies)', () => {
  it('unbubbles the agent message and keeps the user chip styled', () => {
    expect(FLAT_MESSAGE_CSS).toContain('chat/agent_msg/msg');
    expect(FLAT_MESSAGE_CSS).toContain('background: transparent');
    expect(FLAT_MESSAGE_CSS).toContain('chat/user_msg/msg');
  });

  it('tables scroll horizontally and cells never per-character wrap (regression: 1-char columns)', () => {
    // `overflow-wrap: anywhere` on the message shrinks table cells to their
    // min-content width, shredding every column into vertical letters. The
    // message uses break-word (no min-content effect), tables get their own
    // scroll container, and cells restore normal wrapping.
    expect(FLAT_MESSAGE_CSS).toContain('overflow-wrap: break-word');
    expect(FLAT_MESSAGE_CSS).not.toContain('overflow-wrap: anywhere');
    expect(FLAT_MESSAGE_CSS).toMatch(/table \{[^}]*display: block/);
    expect(FLAT_MESSAGE_CSS).toMatch(/table \{[^}]*overflow-x: auto/);
    expect(FLAT_MESSAGE_CSS).toMatch(/td \{[^}]*overflow-wrap: normal/);
    // Cells WRAP to fit the narrow panel (nowrap forced huge intrinsic column
    // widths that clipped at the edge); horizontal scroll is the fallback for
    // genuinely unbreakable content only.
    expect(FLAT_MESSAGE_CSS).toMatch(/td \{[^}]*white-space: normal/);
    expect(FLAT_MESSAGE_CSS).not.toContain('white-space: nowrap');
  });

  it('scopes every rule to the companion panel root', () => {
    for (const line of FLAT_MESSAGE_CSS.split('\n')) {
      if (line.includes('[data-component')) {
        expect(line.startsWith('[data-companion-root]')).toBe(true);
      }
    }
  });
});
