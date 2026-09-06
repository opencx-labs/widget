import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { MarkInk, PageMark } from '../page-mark';
import { PageMarksProvider, usePageMarks } from '../PageMarksProvider';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type PageMarksStore = ReturnType<typeof usePageMarks>;

function Probe({ capture }: { capture(store: PageMarksStore): void }) {
  const store = usePageMarks();
  capture(store);
  return <output data-count={store.marks.length} data-armed={store.isArmed} />;
}

function mountWidget(capture: (store: PageMarksStore) => void) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <PageMarksProvider>
        <Probe capture={capture} />
      </PageMarksProvider>,
    );
  });
  return { container, root };
}

function mark(note: string): PageMark {
  return {
    shape: 'box',
    note,
    pageUrl: `https://example.com/${note}`,
    rect: { x: 0, y: 0, width: 20, height: 20 },
    elements: [],
  };
}

function ink(): MarkInk {
  return {
    setRect: vi.fn(),
    setShape: vi.fn(),
    undraw: vi.fn(),
    remove: vi.fn(),
  };
}

function unmount(root: Root, container: HTMLElement) {
  act(() => root.unmount());
  container.remove();
}

describe('PageMarksProvider', () => {
  it('isolates marks and armed state between Widget instances', () => {
    let first!: PageMarksStore;
    let second!: PageMarksStore;
    const firstWidget = mountWidget((store) => {
      first = store;
    });
    const secondWidget = mountWidget((store) => {
      second = store;
    });
    const firstMark = mark('first');
    const secondMark = mark('second');
    const firstInk = ink();
    const secondInk = ink();

    act(() => {
      first.attach(firstMark, firstInk);
      first.setArmed(true);
    });
    expect(first.marks).toEqual([firstMark]);
    expect(first.isArmed).toBe(true);
    expect(second.marks).toEqual([]);
    expect(second.isArmed).toBe(false);

    act(() => second.attach(secondMark, secondInk));
    act(() => first.detachAll());
    expect(first.marks).toEqual([]);
    expect(second.marks).toEqual([secondMark]);
    expect(firstInk.undraw).toHaveBeenCalledTimes(1);
    expect(secondInk.undraw).not.toHaveBeenCalled();

    unmount(firstWidget.root, firstWidget.container);
    unmount(secondWidget.root, secondWidget.container);
  });

  it('synchronously removes every owned ink when its Widget unmounts', () => {
    let store!: PageMarksStore;
    const widget = mountWidget((value) => {
      store = value;
    });
    const firstInk = ink();
    const secondInk = ink();

    act(() => {
      store.attach(mark('first'), firstInk);
      store.attach(mark('second'), secondInk);
    });
    unmount(widget.root, widget.container);

    expect(firstInk.remove).toHaveBeenCalledTimes(1);
    expect(secondInk.remove).toHaveBeenCalledTimes(1);
    expect(firstInk.undraw).not.toHaveBeenCalled();
    expect(secondInk.undraw).not.toHaveBeenCalled();
  });
});
