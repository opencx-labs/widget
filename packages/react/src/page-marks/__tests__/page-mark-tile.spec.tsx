import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({ language: 'en' }),
  useDocumentDir: () => ({ dir: 'ltr' }),
}));
const thumbnail = vi.hoisted(() => ({ value: null as string | null }));
vi.mock('../useMarkThumbnail', () => ({
  useMarkThumbnail: () => thumbnail.value,
}));

import { PageMarkPill } from '../PageMarkPill';
import type { PageMark } from '../page-mark';

/**
 * A mark previews with the files, so it wears a file's tile: one square,
 * whatever the marked region's aspect. A natural-width thumbnail made a wide
 * capture many times the width of a narrow one.
 */
const mark: PageMark = {
  shape: 'box',
  pageUrl: 'https://app.test/inbox',
  rect: { x: 0, y: 0, width: 400, height: 20 },
  elements: [],
  note: 'why is this greyed out?',
};

let container: HTMLDivElement;
let root: Root;

function tile() {
  return container.querySelector<HTMLElement>(
    '[data-component="chat/input_box/page_mark_pill"]',
  );
}

beforeEach(() => {
  thumbnail.value = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('The composer mark tile', () => {
  it('is one square with the note captioned, once the picture lands', () => {
    thumbnail.value = 'data:image/jpeg;base64,abc';
    act(() => root.render(<PageMarkPill mark={mark} onRemove={() => {}} />));
    expect(tile()?.className).toContain('size-12');
    expect(container.querySelector('img')?.className).toContain('size-full');
    expect(container.textContent).toContain('why is this greyed out?');
  });

  it('keeps the same square before any picture exists', () => {
    act(() => root.render(<PageMarkPill mark={mark} onRemove={() => {}} />));
    expect(container.querySelector('img')).toBeNull();
    expect(tile()?.className).toContain('size-12');
    expect(container.textContent).toContain('why is this greyed out?');
  });

  it('un-draws the mark from its own corner button', () => {
    const onRemove = vi.fn();
    act(() => root.render(<PageMarkPill mark={mark} onRemove={onRemove} />));
    act(() =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label^="Remove"]')
        ?.click(),
    );
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
