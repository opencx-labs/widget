import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanionFrame } from '../CompanionFrame';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const FRAME_HTML = '<!doctype html><html><head></head><body></body></html>';

describe('CompanionFrame', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // jsdom's iframe swaps its contentDocument asynchronously (about:blank
    // navigation), so React ends up unmounting portal children from a body
    // that was replaced underneath it — a jsdom artifact, not component
    // behavior. Give every iframe ONE stable in-memory document instead;
    // these specs exercise the ref-callback contract, not doc.write.
    const docs = new WeakMap<HTMLIFrameElement, Document>();
    vi.spyOn(
      HTMLIFrameElement.prototype,
      'contentDocument',
      'get',
    ).mockImplementation(function contentDocument(this: HTMLIFrameElement) {
      let doc = docs.get(this);
      if (!doc) {
        doc = document.implementation.createHTMLDocument('');
        docs.set(this, doc);
      }
      return doc;
    });
    // `Document.open` is overloaded ((): Document and (url, name, features):
    // Window | null), so a plain mockImplementation can't type-satisfy both
    // signatures — mockReturnThis matches the document-returning form we use.
    vi.spyOn(Document.prototype, 'open').mockReturnThis();
    vi.spyOn(Document.prototype, 'write').mockImplementation(() => {});
    vi.spyOn(Document.prototype, 'close').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  function frame(ref?: React.MutableRefObject<HTMLIFrameElement | null>) {
    return (
      <CompanionFrame
        initialContent={FRAME_HTML}
        title="test frame"
        style={{}}
        iframeRef={ref}
      >
        <div id="frame-child" />
      </CompanionFrame>
    );
  }

  it('writes the document and portals children into the iframe body', () => {
    act(() => root.render(frame()));

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(
      iframe?.contentDocument?.body.querySelector('#frame-child'),
    ).not.toBeNull();
  });

  it('exposes the iframe on iframeRef and clears it on unmount', () => {
    const ref: React.MutableRefObject<HTMLIFrameElement | null> = {
      current: null,
    };
    act(() => root.render(frame(ref)));
    expect(ref.current).toBeInstanceOf(HTMLIFrameElement);

    act(() => root.render(<React.Fragment />));
    expect(ref.current).toBeNull();
  });

  it('survives rapid remount cycles cleanly', () => {
    // Coverage for the churn path (HMR, error-boundary retries, widget
    // config refresh remounts). NOTE: this can't reproduce the production
    // "Maximum update depth exceeded" cascade — that needs interleaved
    // commit pressure act() batches away — so the real guard is the
    // no-setState-on-detach rule in CompanionFrame's ref callback.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    act(() => {
      for (let i = 0; i < 60; i++) {
        root.render(frame());
        root.render(<React.Fragment />);
      }
      root.render(frame());
    });

    const depthErrors = errorSpy.mock.calls.filter((args) =>
      args.join(' ').includes('Maximum update depth'),
    );
    expect(depthErrors).toHaveLength(0);
    expect(container.querySelector('iframe')).not.toBeNull();
  });
});
