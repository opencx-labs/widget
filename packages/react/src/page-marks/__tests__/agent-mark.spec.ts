import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dismissActiveHighlight,
  highlightElementInputSchema,
  highlightElementOnHostPage,
} from '../agent-mark';

/**
 * The agent's side of the same pen: `highlight_element` resolves the hint,
 * inks a hand-drawn mark on the host page, floats the callout, dismisses on
 * click/Esc/timeout — and degrades to a no-op (false) when the element is
 * gone. Notation is mocked (jsdom lacks the APIs it draws through), with
 * `show()` inserting a sibling SVG like the real thing so the widget's
 * post-show adoption is exercised for real.
 */

type MockInk = {
  target: unknown;
  options: Record<string, unknown>;
  showing: boolean;
  finished: Promise<void>;
  showCount: number;
  hideCount: number;
  removeCount: number;
  show(): MockInk;
  hide(): MockInk;
  remove(): void;
  update(): MockInk;
};

const notation = vi.hoisted(() => {
  const created: MockInk[] = [];
  const annotate = (target: unknown, options: Record<string, unknown>) => {
    const ink: MockInk = {
      target,
      options,
      showing: false,
      finished: Promise.resolve(),
      showCount: 0,
      hideCount: 0,
      removeCount: 0,
      show() {
        ink.showCount += 1;
        ink.showing = true;
        if (target instanceof HTMLElement && target.parentElement) {
          const svg = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'svg',
          );
          svg.setAttribute('class', 'notation');
          target.insertAdjacentElement('afterend', svg);
        }
        return ink;
      },
      hide() {
        ink.hideCount += 1;
        ink.showing = false;
        return ink;
      },
      remove() {
        ink.removeCount += 1;
      },
      update() {
        return ink;
      },
    };
    created.push(ink);
    return ink;
  };
  return { created, annotate };
});

vi.mock('@shardsui/notation', () => ({ annotate: notation.annotate }));

const lastInk = () => notation.created.at(-1) as MockInk;

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no rAF loop by default in fake-timer mode.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(performance.now()), 16),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) =>
    window.clearTimeout(id),
  );
});

afterEach(() => {
  dismissActiveHighlight();
  notation.created.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
  document
    .querySelectorAll('[data-opencx-overlay]')
    .forEach((el) => el.remove());
});

/** Deterministic heuristic inputs — jsdom computes no real layout. */
function stubComputedStyle(
  overrides: Partial<
    Pick<CSSStyleDeclaration, 'display' | 'fontSize' | 'direction'>
  > = {},
) {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    display: 'inline-block',
    fontSize: '16px',
    direction: 'ltr',
    ...overrides,
  } as CSSStyleDeclaration);
}

function mountTarget(rect?: Partial<DOMRect>): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.id = 'create-key';
  btn.textContent = 'Create Key';
  btn.scrollIntoView = vi.fn();
  btn.getBoundingClientRect = () =>
    ({
      x: 40,
      y: 40,
      left: 40,
      top: 40,
      width: 120,
      height: 32,
      right: 160,
      bottom: 72,
      ...rect,
    }) as DOMRect;
  document.body.appendChild(btn);
  return btn;
}

const container = () => document.querySelector('div[data-opencx-overlay]');
const inkSvg = () => document.querySelector('svg.notation');

describe('highlightElementOnHostPage', () => {
  it('inks the element found by selector and adopts the ink as widget-owned', () => {
    stubComputedStyle();
    const btn = mountTarget();
    expect(
      highlightElementOnHostPage({ selector: '#create-key' }, { zIndex: 17 }),
    ).toBe(true);
    expect(btn.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'center' }),
    );

    const ink = lastInk();
    expect(ink.target).toBe(btn);
    expect(ink.showCount).toBe(1);
    expect(ink.options.type).toBe('circle'); // small control
    const svg = inkSvg() as SVGSVGElement;
    expect(svg.hasAttribute('data-opencx-overlay')).toBe(true);
    expect(svg.style.zIndex).toBe('17');
    expect(svg.style.filter).toContain('drop-shadow');
  });

  it('chooses the mark like a hand would: underline inlines, box regions', () => {
    stubComputedStyle({ display: 'inline' });
    mountTarget({ width: 64, height: 18, right: 104, bottom: 58 });
    highlightElementOnHostPage({ selector: '#create-key' });
    expect(lastInk().options.type).toBe('underline');
    dismissActiveHighlight();

    stubComputedStyle({ display: 'block' });
    document.body.innerHTML = '';
    mountTarget({ width: 600, height: 300, right: 640, bottom: 340 });
    highlightElementOnHostPage({ selector: '#create-key' });
    expect(lastInk().options.type).toBe('box');
  });

  it('honors an explicit mark type, and the schema shrugs off invented ones', () => {
    stubComputedStyle();
    mountTarget();
    highlightElementOnHostPage(
      highlightElementInputSchema.parse({
        selector: '#create-key',
        type: 'arrow',
      }),
    );
    expect(lastInk().options.type).toBe('arrow');
    expect(
      highlightElementInputSchema.parse({ selector: '#a', type: 'sparkle' })
        .type,
    ).toBeUndefined();
  });

  it('passes theme color, seed, and the reading direction to the pen', () => {
    stubComputedStyle({ direction: 'rtl' });
    mountTarget();
    highlightElementOnHostPage(
      { selector: '#create-key' },
      { accentColor: 'rebeccapurple', seed: 7 },
    );
    expect(lastInk().options).toMatchObject({
      color: 'rebeccapurple',
      seed: 7,
      rtl: true,
    });
  });

  it('falls back to text when the selector is stale, and reports a miss as false', () => {
    stubComputedStyle();
    mountTarget();
    expect(
      highlightElementOnHostPage({ selector: '#gone', text: 'Create Key' }),
    ).toBe(true);
    expect(notation.created).toHaveLength(1);

    document.body.innerHTML = '';
    expect(
      highlightElementOnHostPage({ selector: '#gone', text: 'nothing' }),
    ).toBe(false);
    // A miss never touches the pen and never disturbs a prior highlight.
    expect(notation.created).toHaveLength(1);
    expect(lastInk().hideCount).toBe(0);
  });

  it('renders an arrowed callout only when a label is given', () => {
    stubComputedStyle();
    mountTarget();
    highlightElementOnHostPage({ selector: '#create-key' });
    expect(container()?.querySelector('[data-cx-role="callout"]')).toBeNull();
    dismissActiveHighlight();
    vi.advanceTimersByTime(400); // let the dismissed overlay finish fading

    highlightElementOnHostPage({
      selector: '#create-key',
      label: 'Create your key here',
    });
    const callout = container()?.querySelector('[data-cx-role="callout"]');
    expect(callout?.textContent).toContain('Create your key here');
    expect(callout?.querySelector('div')?.getAttribute('style')).toContain(
      'rotate(45deg)',
    );
  });

  it('auto-dismisses by un-drawing: hide, then release, then the callout goes', async () => {
    stubComputedStyle();
    mountTarget();
    highlightElementOnHostPage({ selector: '#create-key', label: 'here' });
    expect(container()).not.toBeNull();

    await vi.advanceTimersByTimeAsync(8000);
    expect(lastInk().hideCount).toBe(1);
    expect(lastInk().removeCount).toBe(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(container()).toBeNull();
  });

  it('dismisses early on click and on Escape', async () => {
    stubComputedStyle();
    mountTarget();
    highlightElementOnHostPage({ selector: '#create-key' });
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(lastInk().hideCount).toBe(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(container()).toBeNull();

    highlightElementOnHostPage({ selector: '#create-key' });
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(lastInk().hideCount).toBe(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(container()).toBeNull();
  });

  it('keeps one highlight at a time: a new one un-draws the previous', () => {
    stubComputedStyle();
    mountTarget();
    highlightElementOnHostPage({ selector: '#create-key' });
    const first = lastInk();
    highlightElementOnHostPage({ selector: '#create-key', label: 'again' });
    expect(first.hideCount).toBe(1);
    expect(notation.created).toHaveLength(2);
  });

  it('never mutates the host element — the ink is its own overlay', () => {
    stubComputedStyle();
    const btn = mountTarget();
    btn.style.zIndex = '5';
    btn.style.boxShadow = '0 0 1px red';
    highlightElementOnHostPage({ selector: '#create-key' });

    expect(btn.style.isolation).toBe('');
    expect(btn.style.position).toBe('');
    expect(btn.style.zIndex).toBe('5');
    expect(btn.style.boxShadow).toBe('0 0 1px red');
  });

  it('jump-cuts the page scroll under prefers-reduced-motion, smooth otherwise', () => {
    stubComputedStyle();
    const matchMedia = (matches: boolean) =>
      vi.fn().mockReturnValue({ matches });

    vi.stubGlobal('matchMedia', matchMedia(true));
    let btn = mountTarget();
    highlightElementOnHostPage({ selector: '#create-key' });
    expect(btn.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'auto' }),
    );
    dismissActiveHighlight();
    document.body.innerHTML = '';

    vi.stubGlobal('matchMedia', matchMedia(false));
    btn = mountTarget();
    highlightElementOnHostPage({ selector: '#create-key' });
    expect(btn.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' }),
    );
  });
});

describe('highlightElementInputSchema', () => {
  it('accepts any subset of selector/text/label/type and rejects wrong types', () => {
    expect(highlightElementInputSchema.safeParse({}).success).toBe(true);
    expect(
      highlightElementInputSchema.safeParse({
        selector: '#a',
        text: 'b',
        label: 'c',
        type: 'circle',
      }).success,
    ).toBe(true);
    expect(highlightElementInputSchema.safeParse({ selector: 1 }).success).toBe(
      false,
    );
    expect(highlightElementInputSchema.safeParse({ label: {} }).success).toBe(
      false,
    );
  });
});
