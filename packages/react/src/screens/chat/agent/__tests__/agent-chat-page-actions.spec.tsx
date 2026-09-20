// The consent path, which is the part that must never be wrong: what gets
// asked about, what a No does, and the rule that every call is answered
// exactly once — silence is the one thing the agent must never receive.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Effect = {
  key: string;
  callId: string;
  type: 'act-on-page' | 'highlight-element';
  input: unknown;
};

let pageEffects: Effect[] = [];
let replies: Array<{ callId: string; outcome: string; detail?: string }> = [];
let consentAsked: Array<{
  callId: string;
  action: string;
  controlName: string;
}> = [];
let consentAnswer = true;

vi.mock('@opencx/widget-react-headless', () => ({
  useAgentChatUi: () => ({
    pageEffects,
    replyToPageCall: (callId: string, outcome: string, detail?: string) =>
      replies.push({ callId, outcome, detail }),
    requestPageActionConsent: async (request: {
      callId: string;
      action: string;
      controlName: string;
    }) => {
      consentAsked.push(request);
      return consentAnswer;
    },
  }),
}));

import { AgentChatPageActions } from '../AgentChatPageActions';
import {
  beginSnapshot,
  resetRefsForTest,
} from '../../../../page-controls/control-ref';

describe('AgentChatPageActions', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    pageEffects = [];
    replies = [];
    consentAsked = [];
    consentAnswer = true;
    resetRefsForTest();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = '';
  });

  /**
   * Answers for ONE call. An action started by an earlier test settles on
   * its own schedule, so a bare `replies` assertion would be reading
   * someone else's mail.
   */
  const repliesFor = (callId: string) =>
    replies.filter((reply) => reply.callId === callId);

  const render = async () => {
    await act(async () => root.render(<AgentChatPageActions />));
    // Let the adapter's own async work settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  /** A control on the page, with the reference the reader handed out. */
  const control = (html: string) => {
    document.body.insertAdjacentHTML('beforeend', html);
    const el = document.querySelector<HTMLElement>('#t');
    if (!el) throw new Error('fixture needs #t');
    el.getBoundingClientRect = () =>
      ({
        x: 10,
        y: 10,
        left: 10,
        top: 10,
        width: 90,
        height: 30,
        right: 100,
        bottom: 40,
      }) as DOMRect;
    return beginSnapshot()(el);
  };

  it('asks before a committing click, naming the control from the page', async () => {
    const ref = control('<button id="t">Cancel subscription</button>');
    pageEffects = [
      {
        key: 'k1',
        callId: 'c-commit',
        type: 'act-on-page',
        // The model's own words are NOT what the visitor is shown.
        input: { ref, action: 'click' },
      },
    ];
    await render();

    expect(consentAsked).toEqual([
      {
        callId: 'c-commit',
        action: 'click',
        controlName: 'Cancel subscription',
      },
    ]);
  });

  it('a No is answered as declined, and nothing is clicked', async () => {
    consentAnswer = false;
    const ref = control('<button id="t">Delete account</button>');
    let clicked = 0;
    document.querySelector('#t')?.addEventListener('click', () => {
      clicked += 1;
    });
    pageEffects = [
      {
        key: 'k1',
        callId: 'c-declined',
        type: 'act-on-page',
        input: { ref, action: 'click' },
      },
    ];
    await render();

    expect(clicked).toBe(0);
    expect(repliesFor('c-declined')).toEqual([
      { callId: 'c-declined', outcome: 'declined', detail: undefined },
    ]);
  });

  it('does not ask before an ordinary click', async () => {
    const ref = control('<button id="t">Show details</button>');
    pageEffects = [
      {
        key: 'k1',
        callId: 'c-ordinary',
        type: 'act-on-page',
        input: { ref, action: 'click' },
      },
    ];
    await render();

    expect(consentAsked).toEqual([]);
    // Positive control: it still answered the call — after the page settled,
    // and with a real outcome, not the catch-all an exception would give.
    await vi.waitFor(() => expect(repliesFor('c-ordinary')).toHaveLength(1));
    expect(repliesFor('c-ordinary')[0]?.outcome).toBe('no_change');
  });

  it('answers a reference that means nothing without touching the page', async () => {
    pageEffects = [
      {
        key: 'k1',
        callId: 'c-gone',
        type: 'act-on-page',
        input: { ref: '#t', action: 'click' },
      },
    ];
    await render();

    expect(consentAsked).toEqual([]);
    expect(repliesFor('c-gone')).toEqual([
      { callId: 'c-gone', outcome: 'gone', detail: undefined },
    ]);
  });

  it('answers an action it does not recognise instead of guessing', async () => {
    const ref = control('<button id="t">Go</button>');
    pageEffects = [
      {
        key: 'k1',
        callId: 'c-verb',
        type: 'act-on-page',
        input: { ref, action: 'drag' },
      },
    ];
    await render();

    expect(repliesFor('c-verb')).toEqual([
      { callId: 'c-verb', outcome: 'unsupported', detail: undefined },
    ]);
  });

  it('answers each call once, however often it re-renders', async () => {
    const ref = control('<button id="t">Show details</button>');
    pageEffects = [
      {
        key: 'k1',
        callId: 'c-once',
        type: 'act-on-page',
        input: { ref, action: 'click' },
      },
    ];
    await render();
    await vi.waitFor(() => expect(repliesFor('c-once')).toHaveLength(1));
    pageEffects = [...pageEffects];
    await render();

    expect(repliesFor('c-once')).toHaveLength(1);
  });

  it('leaves highlight effects to the adapter that owns them', async () => {
    const ref = control('<button id="t">Export</button>');
    pageEffects = [
      {
        key: 'k1',
        callId: 'c-highlight',
        type: 'highlight-element',
        input: { ref },
      },
    ];
    await render();

    expect(repliesFor('c-highlight')).toEqual([]);
  });
});
