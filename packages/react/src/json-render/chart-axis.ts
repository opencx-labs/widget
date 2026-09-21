/**
 * Y-axis sizing for the cartesian charts.
 *
 * recharts 2.x has no auto-width axis: `YAxis.width` is a fixed number, and a
 * tick label wider than the room left of its tick pokes out past the svg's
 * left edge, where the viewport clips it. That is how a 120/80/150/90/200 bar
 * chart rendered "0" for every tick in the 400px chat panel — only the last
 * digit of each label survived. The axis is sized from the labels recharts
 * actually painted instead: measured in a browser, estimated where the text
 * cannot be measured (jsdom, a hidden embed).
 */

/** Slack past the widest label so hinting never shaves its first glyph. */
const Y_TICK_LABEL_PAD = 2;

/**
 * Fallback glyph advance as a fraction of the font size, used when the text
 * cannot be measured. Sized for digits in UI sans fonts, which run 0.55–0.65em;
 * erring wide costs a couple of px of plot, erring narrow clips.
 */
const ESTIMATED_GLYPH_ADVANCE = 0.62;

/** recharts' painted Y tick labels (`<text>`, right-anchored at their `x`). */
export const Y_TICK_LABEL_SELECTOR =
  '.recharts-yAxis .recharts-cartesian-axis-tick-value';

export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * ESTIMATED_GLYPH_ADVANCE;
}

type MeasurableText = Element & { getComputedTextLength: () => number };

/** SVG text content elements in a browser; jsdom's `<text>` has no such method. */
function isMeasurableText(node: Element): node is MeasurableText {
  return (
    'getComputedTextLength' in node &&
    typeof node.getComputedTextLength === 'function'
  );
}

/**
 * The painted width of an svg text node: the browser's glyph run when it can
 * report one (a non-positive length means not laid out — a hidden embed), the
 * estimate otherwise.
 */
export function measureSvgTextWidth(node: Element, fontSize: number): number {
  if (isMeasurableText(node)) {
    const measured = node.getComputedTextLength();
    if (measured > 0) return measured;
  }
  return estimateTextWidth(node.textContent ?? '', fontSize);
}

/**
 * The narrowest `YAxis.width` that keeps every painted tick label inside the
 * svg, or `null` when no Y ticks are in the DOM (a pie, or nothing painted
 * yet). Derived from geometry, not from recharts constants: each label's
 * right edge sits at its tick's `x`, and `currentWidth - x` is whatever gap
 * the axis reserves between label and plot — so the requirement is the widest
 * label plus that gap, whichever tick size/margin recharts applied.
 */
export function requiredYAxisWidth(
  container: ParentNode,
  currentWidth: number,
  fontSize: number,
): number | null {
  let widest = 0;
  let anchorX: number | null = null;
  container.querySelectorAll(Y_TICK_LABEL_SELECTOR).forEach((tick) => {
    const rawX = tick.getAttribute('x');
    if (rawX === null) return;
    const x = Number(rawX);
    if (!Number.isFinite(x)) return;
    anchorX = x;
    widest = Math.max(widest, measureSvgTextWidth(tick, fontSize));
  });
  if (anchorX === null) return null;
  return Math.ceil(widest + (currentWidth - anchorX) + Y_TICK_LABEL_PAD);
}
