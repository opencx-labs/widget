import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// `RichText` only reads `anchorTarget` off the widget config. Stubbing it keeps
// these tests about the SANITIZER rather than about provider plumbing.
vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({ anchorTarget: '_top' }),
}));

const { RichText } = await import('../RichText');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * `RichText` renders UNTRUSTED content — AI replies, agent messages and
 * knowledge-base passages — and the widget's React runs in the EMBEDDER's realm,
 * so raw HTML here executes on the customer's own site.
 *
 * `rehypeRaw` is enabled (authored HTML in a reply should still render), which
 * makes the sanitizer load-bearing rather than defence-in-depth. These tests
 * pin the guarantee: markdown and safe HTML survive, script-shaped HTML does
 * not. They also pin plugin ORDER — sanitize must run after raw, or it has no
 * parsed tree to strip and silently does nothing.
 */

let roots: Root[] = [];

function render(markdown: string): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<RichText>{markdown}</RichText>));
  return container;
}

afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

describe('RichText sanitization (untrusted model/agent output)', () => {
  it('strips <script> tags from raw HTML', () => {
    const el = render('Hello <script>window.__pwned = true;</script> there');
    expect(el.querySelector('script')).toBeNull();
    expect(el.textContent).toContain('Hello');
  });

  it('strips inline event handlers that would fire on render', () => {
    const el = render('<img src="x" onerror="window.__pwned = true" alt="broken">');
    const img = el.querySelector('img');
    expect(img?.getAttribute('onerror')).toBeNull();
  });

  it('strips javascript: hrefs from authored anchors', () => {
    const el = render('<a href="javascript:window.__pwned=1">click me</a>');
    const href = el.querySelector('a')?.getAttribute('href');
    expect(href?.startsWith('javascript:')).not.toBe(true);
  });

  it('strips <iframe> so a reply cannot embed a foreign origin', () => {
    const el = render('<iframe src="https://evil.example.com"></iframe>');
    expect(el.querySelector('iframe')).toBeNull();
  });

  it('still renders ordinary markdown', () => {
    const el = render('**bold** and _italic_');
    expect(el.querySelector('strong')?.textContent).toBe('bold');
    expect(el.querySelector('em')?.textContent).toBe('italic');
  });

  it('still renders safe authored HTML — the reason rehypeRaw is enabled at all', () => {
    const el = render('<p>a <strong>real</strong> paragraph</p>');
    expect(el.querySelector('strong')?.textContent).toBe('real');
  });

  it('keeps normal links working', () => {
    const el = render('[docs](https://example.com/docs)');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('https://example.com/docs');
  });

  it('keeps the className remark-gfm puts on fenced code blocks', () => {
    const el = render('```js\nconst a = 1;\n```');
    const code = el.querySelector('code');
    expect(code).not.toBeNull();
    expect(code?.className ?? '').toContain('language-js');
  });
});
