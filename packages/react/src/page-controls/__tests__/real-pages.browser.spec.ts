// The same gate, against OpenCX's own pages instead of a fixture somebody
// wrote to pass it.
//
// The markup in `real-pages.json` is production HTML from open.cx and
// docs.open.cx, captured 2026-09-20 and stripped of scripts, stylesheet
// links, iframes and inline handlers so it mounts inert. Real component
// library, real nav, real accessible names, real depth — and nothing that
// can execute or phone home.
//
// What this is NOT: the authenticated dashboard. That page is full of real
// customer sessions, and neither reading it into a fixture nor acting on it
// live is something to do casually. These are the internal pages that carry
// no customer data.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { accessibleName } from '../accessible-name';
import { resetRefsForTest } from '../control-ref';
import { guardRef } from '../guard';
import { readPageControls } from '../read-controls';
import REAL_PAGES from './fixtures/real-pages.json';

const GATE = 0.9;
const pages = Object.entries(REAL_PAGES as Record<string, string>);

beforeEach(() => {
  resetRefsForTest();
  document.body.style.margin = '0';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('OpenCX pages, read by the shipped reader', () => {
  it.each(pages)(
    '%s: names every control it offers, and points at them',
    (name, html) => {
      document.body.innerHTML = html;

      const started = performance.now();
      const snapshot = readPageControls();
      const collectMs = performance.now() - started;

      // A real page has to produce something, or the reader is not being
      // exercised at all and every rate below would be vacuous.
      expect(
        snapshot.controls.length,
        `${name} produced no controls`,
      ).toBeGreaterThan(5);

      const misses: string[] = [];
      for (const control of snapshot.controls) {
        // Every offered control must have a name (the agent's only handle)…
        if (!control.name.trim()) {
          misses.push(`${control.ref}: offered with an empty name`);
          continue;
        }
        // …and must still be reachable a moment later, which is what a
        // highlight actually needs.
        const guarded = guardRef(control.ref);
        if (!guarded.ok) {
          misses.push(`"${control.name}" (${control.role}): ${guarded.reason}`);
        }
      }

      const landed = snapshot.controls.length - misses.length;
      const rate = landed / snapshot.controls.length;
      const summary = [
        `${name}: ${landed}/${snapshot.controls.length} (${(rate * 100).toFixed(1)}%) in ${collectMs.toFixed(1)}ms`,
        ...misses.slice(0, 12).map((miss) => `  ✗ ${miss}`),
      ].join('\n');

      console.log(summary);

      expect(rate, summary).toBeGreaterThanOrEqual(GATE);
    },
  );

  it.each(pages)(
    '%s: never offers a control it is not allowed to read',
    (name, html) => {
      document.body.innerHTML = html;
      const offered = readPageControls().controls;

      const leaked: string[] = [];
      for (const control of offered) {
        // Nothing from a credential field, a private region, an aria-hidden
        // subtree or our own widget may appear in the list.
        const match = Array.from(
          document.querySelectorAll<HTMLElement>('*'),
        ).find((el) => accessibleName(el) === control.name);
        if (!match) continue;
        if (
          match.closest('[data-opencx-private]') ||
          match.closest('[aria-hidden="true"]') ||
          match.closest(
            '#opencx-root, [data-opencx-root], [data-opencx-overlay]',
          ) ||
          (match instanceof HTMLInputElement &&
            ['password', 'file', 'hidden'].includes(match.type))
        ) {
          leaked.push(`"${control.name}"`);
        }
      }

      expect(leaked, `${name} leaked: ${leaked.join(', ')}`).toEqual([]);
    },
  );

  it.each(pages)('%s: sends no field values', (name, html) => {
    document.body.innerHTML = html;
    // Give every field a value a leak would carry.
    document.querySelectorAll('input, textarea').forEach((field) => {
      if (
        field instanceof HTMLInputElement &&
        ['checkbox', 'radio'].includes(field.type)
      )
        return;
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement
      ) {
        field.value = 'SENTINEL-4242-VALUE';
      }
    });

    const wire = JSON.stringify(readPageControls().controls);

    expect(wire, `${name} put a field's contents on the wire`).not.toContain(
      'SENTINEL',
    );
  });
});
