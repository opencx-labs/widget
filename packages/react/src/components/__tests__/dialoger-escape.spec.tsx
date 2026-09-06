import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** The widget's content iframe, whose document the Dialoger listens on. */
let contentIframe: HTMLIFrameElement;

vi.mock('@opencx/widget-react-headless', () => ({
  useWidget: () => ({ contentIframeRef: { current: contentIframe } }),
}));

import { DialogerContent, DialogerProvider, useDialoger } from '../Dialoger';

let isOpen = false;

function OpenOnMount({ open }: { open: boolean }) {
  const dialoger = useDialoger();
  isOpen = dialoger.isOpen;
  useEffect(() => {
    if (open) dialoger.open(<DialogerContent>dialog body</DialogerContent>);
    // Opening once on mount is the whole fixture; re-running on every render
    // would reopen a dialog the test just closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return null;
}

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function render(open: boolean) {
  act(() => {
    root.render(
      <DialogerProvider>
        <OpenOnMount open={open} />
      </DialogerProvider>,
    );
  });
}

/** Dispatch Escape inside the content iframe and report whether the widget's
 * own document-level handlers would still get to act on it. */
function pressEscapeInFrame(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    contentIframe.contentWindow?.document.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  contentIframe = document.createElement('iframe');
  document.body.appendChild(contentIframe);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  contentIframe.remove();
});

describe('Dialoger Escape ownership', () => {
  it('leaves Escape alone while no dialog is open', () => {
    render(false);

    const event = pressEscapeInFrame();

    // Consuming it here is what broke Escape-to-dismiss for the whole panel:
    // the companion's frame handler stands down on `defaultPrevented`.
    expect(event.defaultPrevented).toBe(false);
  });

  it('consumes Escape and closes while a dialog is open', () => {
    render(true);
    expect(isOpen).toBe(true);

    const event = pressEscapeInFrame();

    expect(event.defaultPrevented).toBe(true);
    expect(isOpen).toBe(false);
  });

  it('hands Escape back once the dialog is closed again', () => {
    render(true);
    pressEscapeInFrame();

    expect(pressEscapeInFrame().defaultPrevented).toBe(false);
  });
});
