import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EASE_OUT, FADE_TRANSITION, QUICK_TWEEN } from '../motion';

/**
 * Motion-contract sweep (see ../../MOTION.md). This does not measure frames —
 * it asserts the deterministic layer of "feel" across every CSS animation the
 * widget ships:
 *
 * 1. One easing: one-shot animations ride EASE_OUT (in CSS notation).
 * 2. Duration bounds: 100–300ms for anything that doesn't loop.
 * 3. Nothing loops except the sanctioned indeterminate-progress indicators.
 * 4. Reduced motion: every animation class has an `animation: none` override
 *    under prefers-reduced-motion.
 *
 * Changing a duration or easing is fine — do it deliberately and update
 * MOTION.md and the constants here in the same change.
 */

const PKG_ROOT = join(__dirname, '..', '..');
const EASE_OUT_CSS = `cubic-bezier(${EASE_OUT.join(', ')})`;

/** Sanctioned loops: indeterminate progress may repeat forever. */
const LOOP_ALLOWLIST = new Set(['opencx-text-shimmer']);
const MIN_MS = 100;
const MAX_MS = 300;

const SOURCES = [
  {
    label: 'index.css',
    text: readFileSync(join(PKG_ROOT, 'index.css'), 'utf8'),
  },
];

interface AnimationDecl {
  source: string;
  name: string;
  durationMs: number;
  rest: string;
  loops: boolean;
}

function toMs(raw: string): number {
  if (raw.endsWith('ms')) return parseFloat(raw);
  return parseFloat(raw) * 1000;
}

/** Every `animation: <name> <duration> …;` shorthand across the sources
 * (`animation: none` reduced-motion overrides don't match — no duration). */
function collectAnimationDecls(): AnimationDecl[] {
  const decls: AnimationDecl[] = [];
  const pattern = /animation:\s*([a-z][a-z0-9-]*)\s+([\d.]+m?s)([^;]*);/g;
  for (const { label, text } of SOURCES) {
    for (const match of Array.from(text.matchAll(pattern))) {
      decls.push({
        source: label,
        name: match[1]!,
        durationMs: toMs(match[2]!),
        rest: match[3]!,
        loops: /\binfinite\b/.test(match[3]!),
      });
    }
  }
  return decls;
}

describe('motion contract', () => {
  const decls = collectAnimationDecls();

  it('finds the animation inventory (the sweep must not silently go blind)', () => {
    expect(decls.length).toBeGreaterThanOrEqual(5);
  });

  it('nothing loops except sanctioned indeterminate-progress indicators', () => {
    for (const decl of decls) {
      if (decl.loops) {
        expect(
          LOOP_ALLOWLIST.has(decl.name),
          `${decl.source}: ${decl.name}`,
        ).toBe(true);
      }
    }
  });

  it('every one-shot animation stays within the 100–300ms bounds', () => {
    for (const decl of decls) {
      if (decl.loops) continue;
      expect(
        decl.durationMs,
        `${decl.source}: ${decl.name}`,
      ).toBeGreaterThanOrEqual(MIN_MS);
      expect(
        decl.durationMs,
        `${decl.source}: ${decl.name}`,
      ).toBeLessThanOrEqual(MAX_MS);
    }
  });

  it('every one-shot animation rides the shared EASE_OUT curve', () => {
    for (const decl of decls) {
      if (decl.loops) continue;
      expect(decl.rest, `${decl.source}: ${decl.name}`).toContain(EASE_OUT_CSS);
    }
  });

  it('paired enter/exit durations stay within 50ms of each other', () => {
    const byName = new Map(decls.map((d) => [d.name, d]));
    const enter = byName.get('opencx-placeholder-in');
    const exit = byName.get('opencx-placeholder-out');
    expect(enter).toBeDefined();
    expect(exit).toBeDefined();
    expect(Math.abs(enter!.durationMs - exit!.durationMs)).toBeLessThanOrEqual(
      50,
    );
  });

  it('every animation class has a reduced-motion override', () => {
    for (const { label, text } of SOURCES) {
      const media = text
        .split('@media (prefers-reduced-motion: reduce)')
        .slice(1)
        .join('\n');
      expect(media, `${label}: missing prefers-reduced-motion block`).not.toBe(
        '',
      );
      // Class names mirror animation names.
      const classNames = new Set(
        collectAnimationDecls()
          .filter((d) => d.source === label)
          .map((d) => d.name),
      );
      for (const className of Array.from(classNames)) {
        expect(
          media,
          `${label}: ${className} lacks a reduced-motion override`,
        ).toContain(className);
      }
    }
  });

  it('the tailwind `ease-opencx` timing function is EASE_OUT', () => {
    const config = readFileSync(join(PKG_ROOT, 'tailwind.config.js'), 'utf8');
    expect(config).toContain(`opencx: '${EASE_OUT_CSS}'`);
  });

  it('the shared tween tokens ride EASE_OUT within the duration bounds', () => {
    for (const token of [FADE_TRANSITION, QUICK_TWEEN]) {
      expect(token.ease).toBe(EASE_OUT);
      const ms = token.duration * 1000;
      expect(ms).toBeGreaterThanOrEqual(MIN_MS);
      expect(ms).toBeLessThanOrEqual(MAX_MS);
    }
  });
});
