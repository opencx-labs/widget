import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  highlightElementInputSchema,
  highlightElementOnHostPage,
} from '../agent-highlight';

/**
 * The `highlight_element` browser effect: resolve the hint, spotlight the
 * element on the host page, dismiss on click/Esc/timeout — and degrade to a
 * no-op (false) when the element is gone.
 */

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no rAF loop by default in fake-timer mode.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    return window.setTimeout(() => cb(performance.now()), 16);
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
  document
    .querySelectorAll('[data-opencx-picker-overlay]')
    .forEach((el) => el.remove());
});

function mountTarget(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.id = 'create-key';
  btn.textContent = 'Create Key';
  btn.scrollIntoView = vi.fn();
  document.body.appendChild(btn);
  return btn;
}

const overlay = () => document.querySelector('[data-opencx-picker-overlay]');

describe('highlightElementOnHostPage', () => {
  it('spotlights an element found by selector, with the label rendered', () => {
    const btn = mountTarget();
    const found = highlightElementOnHostPage({
      selector: '#create-key',
      label: 'Create your key here',
    });
    expect(found).toBe(true);
    expect(btn.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'center' }),
    );
    expect(overlay()).not.toBeNull();
    expect(overlay()?.textContent).toContain('Create your key here');
  });

  it('falls back to text when the selector is stale, and reports a miss as false', () => {
    mountTarget();
    expect(
      highlightElementOnHostPage({ selector: '#gone', text: 'Create Key' }),
    ).toBe(true);
    expect(overlay()).not.toBeNull();

    document.body.innerHTML = '';
    expect(highlightElementOnHostPage({ selector: '#gone', text: 'nothing' })).toBe(
      false,
    );
  });

  it('auto-dismisses after the highlight duration', () => {
    mountTarget();
    highlightElementOnHostPage({ selector: '#create-key' });
    expect(overlay()).not.toBeNull();
    vi.advanceTimersByTime(7000);
    expect(overlay()).toBeNull();
  });

  it('dismisses early on click and on Escape', () => {
    mountTarget();
    highlightElementOnHostPage({ selector: '#create-key' });
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(500);
    expect(overlay()).toBeNull();

    highlightElementOnHostPage({ selector: '#create-key' });
    expect(overlay()).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    vi.advanceTimersByTime(500);
    expect(overlay()).toBeNull();
  });

  it('never mutates the host element — the ring is its own overlay', () => {
    const btn = mountTarget();
    // Pre-existing inline styles that must survive completely untouched.
    btn.style.zIndex = '5';
    btn.style.boxShadow = '0 0 1px red';
    highlightElementOnHostPage({ selector: '#create-key' });

    // No promotion: nothing is written to the element, so a host ancestor that
    // forms a stacking context can never trap it behind the dim.
    expect(btn.style.isolation).toBe('');
    expect(btn.style.position).toBe('');
    expect(btn.style.zIndex).toBe('5');
    expect(btn.style.boxShadow).toBe('0 0 1px red');
    // The ring is drawn as a separate top-level layer instead.
    expect(overlay()?.querySelector('[data-cx-role="ring"]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(btn.style.zIndex).toBe('5');
    expect(btn.style.boxShadow).toBe('0 0 1px red');
  });

  it('tiles exactly four panels around the element, leaving a sharp window', () => {
    mountTarget();
    highlightElementOnHostPage({ selector: '#create-key' });
    const panels = overlay()?.querySelectorAll('[data-cx-role="panel"]');
    expect(panels?.length).toBe(4);
    // Panels trap off-target clicks; the window over the element stays usable.
    panels?.forEach((p) => {
      expect(p.getAttribute('style')).toContain('pointer-events: auto');
    });
  });

  it('renders an arrowed callout only when a label is given', () => {
    mountTarget();
    highlightElementOnHostPage({ selector: '#create-key' });
    expect(overlay()?.querySelector('[data-cx-role="callout"]')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    vi.advanceTimersByTime(500);

    highlightElementOnHostPage({ selector: '#create-key', label: 'Create your key here' });
    const callout = overlay()?.querySelector('[data-cx-role="callout"]');
    expect(callout).not.toBeNull();
    expect(callout?.textContent).toContain('Create your key here');
    // The arrow is a rotated square child of the pill.
    const arrow = callout?.querySelector('div');
    expect(arrow?.getAttribute('style')).toContain('rotate(45deg)');
  });
});

describe('highlightElementInputSchema', () => {
  it('accepts any subset of selector/text/label and rejects wrong types', () => {
    expect(highlightElementInputSchema.safeParse({}).success).toBe(true);
    expect(
      highlightElementInputSchema.safeParse({ selector: '#a', text: 'b', label: 'c' }).success,
    ).toBe(true);
    expect(highlightElementInputSchema.safeParse({ selector: 42 }).success).toBe(false);
    expect(highlightElementInputSchema.safeParse('nope').success).toBe(false);
  });
});
