import type { MarkedElementRef } from '@opencx/widget-core';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginThumbnail } from '../mark-thumbnail';
import { SentMarkChip } from '../SentMarkChip';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * The sent bubble must show what the composer showed: the marked region's
 * pixels, not the element's tag name. The message carries the mark OBJECT, so
 * the snapshot taken at attach time is still reachable after the send.
 */

vi.mock('html-to-image', () => ({
  toJpeg: vi.fn(async () => 'data:image/jpeg;base64,abc'),
}));

describe('SentMarkChip', () => {
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

  it('shows the mark thumbnail with the note captioned over it', async () => {
    const mark = { shape: 'box', note: 'is this live?' };
    beginThumbnail(mark, hostElement());
    const element: MarkedElementRef = {
      name: 'div "Mode Live"',
      note: 'is this live?',
      mark,
    };

    await act(async () => {
      root.render(<SentMarkChip element={element} />);
    });

    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/jpeg;base64,abc',
    );
    expect(container.textContent).toContain('is this live?');
  });

  it('falls back to the note, then the element name, when no snapshot exists', async () => {
    await act(async () => {
      root.render(
        <SentMarkChip
          element={{ name: 'div "Mode Live"', note: 'this bit' }}
        />,
      );
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('this bit');

    await act(async () => {
      root.render(<SentMarkChip element={{ name: 'div "Mode Live"' }} />);
    });
    expect(container.textContent).toContain('div "Mode Live"');
  });

  it('shows the persisted snapshot after a reload, when no in-memory capture exists', async () => {
    await act(async () => {
      root.render(
        <SentMarkChip
          element={{
            name: 'div "Call summary"',
            note: 'call failed',
            snapshotUrl: 'https://storage.test/marks/1.jpg',
          }}
        />,
      );
    });
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://storage.test/marks/1.jpg',
    );
    expect(container.textContent).toContain('call failed');
    expect(container.textContent).not.toContain('div "Call summary"');
  });
});
