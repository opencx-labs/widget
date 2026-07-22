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

  it('lifts the real element above the veil while active, ringed', () => {
    const btn = mountTarget();
    highlightElementOnHostPage({ selector: '#create-key' });
    // Promoted above the veil (2147483000) with its own stacking context so the
    // backdrop-filter blurs the page but not this element.
    expect(btn.style.isolation).toBe('isolate');
    expect(btn.style.zIndex).toBe('2147483001');
    expect(btn.style.boxShadow).not.toBe('');
  });

  it('restores the element untouched on dismiss, preserving pre-existing inline styles', () => {
    const btn = mountTarget();
    // Pre-existing inline styles the effect must hand back exactly.
    btn.style.zIndex = '5';
    btn.style.boxShadow = '0 0 1px red';
    highlightElementOnHostPage({ selector: '#create-key' });
    expect(btn.style.zIndex).toBe('2147483001'); // taken over while active
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    // Synchronous restore (the 300ms fade only removes the overlay nodes).
    expect(btn.style.zIndex).toBe('5');
    expect(btn.style.boxShadow).toBe('0 0 1px red');
    expect(btn.style.isolation).toBe('');
  });

  it('renders a veil, and an arrowed callout only when a label is given', () => {
    mountTarget();
    // No label → veil only (one descendant div).
    highlightElementOnHostPage({ selector: '#create-key' });
    expect(overlay()?.querySelectorAll('div').length).toBe(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    vi.advanceTimersByTime(500);

    // With a label → veil + callout + arrow (three descendant divs), and the
    // arrow is a rotated square.
    highlightElementOnHostPage({ selector: '#create-key', label: 'Create your key here' });
    const container = overlay();
    expect(container?.querySelectorAll('div').length).toBe(3);
    expect(container?.textContent).toContain('Create your key here');
    const hasArrow = Array.from(container?.querySelectorAll('div') ?? []).some((d) =>
      d.style.transform.includes('rotate(45deg)'),
    );
    expect(hasArrow).toBe(true);
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
