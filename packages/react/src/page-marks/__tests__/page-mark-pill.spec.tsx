import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginThumbnail } from '../mark-thumbnail';
import type { PageMark } from '../page-mark';
import { PageMarkPill } from '../PageMarkPill';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * The pill's two forms — thumbnail once the capture lands, text until then /
 * on failure — wired through the REAL thumbnail registry, with only the
 * rasterizer (html-to-image) mocked.
 */

vi.mock('html-to-image', () => ({
  toJpeg: vi.fn(async () => 'data:image/jpeg;base64,abc'),
}));

vi.mock('@opencx/widget-react-headless', () => ({
  useConfig: () => ({ language: 'en' }),
  useDocumentDir: () => ({ dir: 'ltr' }),
}));

const mark: PageMark = {
  shape: 'box',
  note: 'why is this greyed out?',
  pageUrl: 'http://host.test/',
  rect: { x: 10, y: 10, width: 120, height: 40 },
  elements: [
    { name: 'button "Invite team"', selector: '#invite-team', tag: 'button' },
  ],
};

describe('PageMarkPill', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = '';
  });

  function hostElement(size = 120): HTMLElement {
    const el = document.createElement('button');
    el.getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: size, height: 32 }) as DOMRect;
    document.body.appendChild(el);
    return el;
  }

  it('shows the thumbnail once it lands, the note captioned over it', async () => {
    const key = { ...mark };
    beginThumbnail(key, hostElement());
    await act(async () => {
      root.render(<PageMarkPill mark={key} onRemove={() => {}} />);
    });
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/jpeg;base64,abc',
    );
    expect(container.textContent).toContain('why is this greyed out?');
    expect(
      container.querySelector('button[aria-label*="greyed out"]'),
    ).not.toBeNull();
  });

  it('stays the text pill when no thumbnail was started or capture declined', async () => {
    await act(async () => {
      root.render(<PageMarkPill mark={{ ...mark }} onRemove={() => {}} />);
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('why is this greyed out?');

    const zeroSized = { ...mark };
    beginThumbnail(zeroSized, hostElement(0));
    await act(async () => {
      root.render(<PageMarkPill mark={zeroSized} onRemove={() => {}} />);
    });
    expect(container.querySelector('img')).toBeNull();
  });

  it('labels a note-less pill with the first element name, and routes remove', async () => {
    const onRemove = vi.fn();
    await act(async () => {
      root.render(
        <PageMarkPill
          mark={{ ...mark, note: undefined, shape: 'crossed-off' }}
          onRemove={onRemove}
        />,
      );
    });
    expect(container.textContent).toContain('button "Invite team"');
    act(() => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label^="Remove"]')
        ?.click();
    });
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('uses the localized region fallback when a mark has no note or element', async () => {
    await act(async () => {
      root.render(
        <PageMarkPill
          mark={{ ...mark, note: undefined, elements: [] }}
          onRemove={() => {}}
        />,
      );
    });

    expect(container.textContent).toContain('Marked region');
    expect(
      container.querySelector('button[aria-label="Remove Marked region"]'),
    ).not.toBeNull();
  });
});
