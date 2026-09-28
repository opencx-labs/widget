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
  value?: string;
  valueLabel?: string;
}> = [];
let consentAnswer = true;
let onConsent = () => {};

const widgetCtx = {
  features: { pageContext: true, clientTools: true, pageActions: true },
};

vi.mock('@opencx/widget-react-headless', () => ({
  useWidget: () => ({ widgetCtx }),
  useAgentChatUi: () => ({
    pageEffects,
    isStreaming: true,
    replyToPageCall: (callId: string, outcome: string, detail?: string) =>
      replies.push({ callId, outcome, detail }),
    requestPageActionConsent: async (request: {
      callId: string;
      action: string;
      controlName: string;
      value?: string;
      valueLabel?: string;
    }) => {
      consentAsked.push(request);
      onConsent();
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
  // Once for the file, never between tests — see the note in beforeEach.
  resetRefsForTest();

  // The pointer's travel is real time. These specs assert what the adapter
  // DOES, not how long it looks good for, so they run the reduced-motion
  // path where the gesture is instant. Its own timing is covered by the
  // browser-mode cursor spec.
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    pageEffects = [];
    replies = [];
    consentAsked = [];
    consentAnswer = true;
    onConsent = () => {};
    widgetCtx.features.pageActions = true;
    widgetCtx.features.pageContext = true;
    widgetCtx.features.clientTools = true;
    // NOT reset between tests on purpose. Resetting restarts the reference
    // counter, so an action still in flight from the previous test would
    // resolve THIS test's identically-numbered ref and click its button.
    // Letting the counter run makes that collision impossible.
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

  it.each([
    '<button id="t">Pay now</button>',
    '<button id="t">Delete account</button>',
    '<button id="t">Confirm order</button>',
    '<button id="t">Submit</button>',
    '<div id="t" role="button">Transfer funds</div>',
    '<button id="t" aria-label="Authorize payment"></button>',
    '<form><button id="t">Continue</button></form>',
    '<input id="t" type="submit" value="Go">',
    '<a id="t" href="/billing">Billing</a>',
    '<button id="t">Next page</button>',
    '<div id="t" role="tab">Invoices</div>',
  ])('requires Allow regardless of control markup: %s', async (html) => {
    consentAnswer = false;
    const ref = control(html);
    pageEffects = [
      {
        key: 'markup',
        callId: 'markup',
        type: 'act-on-page',
        input: { ref, action: 'click' },
      },
    ];
    await render();
    expect(consentAsked).toHaveLength(1);
    expect(repliesFor('markup')[0]?.outcome).toBe('declined');
  });

  it('does not act when page access is revoked during consent', async () => {
    const ref = control('<button id="t">Delete account</button>');
    const clicked = vi.fn();
    document.querySelector('#t')?.addEventListener('click', clicked);
    onConsent = () => {
      widgetCtx.features.pageContext = false;
    };
    pageEffects = [
      {
        key: 'revoked',
        callId: 'revoked',
        type: 'act-on-page',
        input: { ref, action: 'click' },
      },
    ];
    await render();
    await vi.waitFor(() => expect(repliesFor('revoked')).toHaveLength(1));
    expect(repliesFor('revoked')[0]?.outcome).toBe('declined');
    expect(clicked).not.toHaveBeenCalled();
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

  it('asks before an ordinary click and executes it only after Allow', async () => {
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

    expect(consentAsked).toEqual([
      { callId: 'c-ordinary', action: 'click', controlName: 'Show details' },
    ]);
    // Positive control: it still answered the call — after the page settled,
    // and with a real outcome, not the catch-all an exception would give.
    await vi.waitFor(() => expect(repliesFor('c-ordinary')).toHaveLength(1));
    expect(repliesFor('c-ordinary')[0]?.outcome).toBe('no_change');
  });

  it.each([
    {
      label: 'Arabic payment',
      html: '<button id="t">ادفع الآن</button>',
      action: 'click',
      event: 'click',
    },
    {
      label: 'generic Continue',
      html: '<button id="t">Continue</button>',
      action: 'click',
      event: 'click',
    },
    {
      label: 'auto-saving text',
      html: '<input id="t" aria-label="Display name" value="Before">',
      action: 'fill',
      value: 'After',
      event: 'input',
    },
    {
      label: 'auto-saving selection',
      html: '<select id="t" aria-label="Plan"><option value="basic">Basic</option><option value="pro">Pro</option></select>',
      action: 'select',
      value: 'pro',
      event: 'change',
    },
    {
      label: 'auto-saving checkbox',
      html: '<input id="t" type="checkbox" aria-label="Automatic renewal">',
      action: 'check',
      event: 'change',
    },
    {
      label: 'auto-saving switch off',
      html: '<input id="t" type="checkbox" checked aria-label="Automatic renewal">',
      action: 'uncheck',
      event: 'change',
    },
  ])(
    'declining $label prevents any host event; allowing a new call acts once',
    async ({ html, action, value, event }) => {
      consentAnswer = false;
      const ref = control(html);
      const target = document.querySelector<HTMLElement>('#t');
      if (!target) throw new Error('missing fixture');
      const changed = vi.fn(() => {
        target.dataset.acted = 'true';
      });
      target.addEventListener(event, changed);
      const effect = {
        key: 'denied',
        callId: 'denied',
        type: 'act-on-page' as const,
        input: { ref, action, value },
      };
      pageEffects = [effect];
      await render();
      expect(consentAsked).toHaveLength(1);
      expect(consentAsked[0]?.value).toBe(value);
      expect(changed).not.toHaveBeenCalled();
      expect(repliesFor('denied')[0]?.outcome).toBe('declined');

      consentAnswer = true;
      pageEffects = [{ ...effect, key: 'allowed', callId: 'allowed' }];
      await render();
      await vi.waitFor(() => expect(repliesFor('allowed')).toHaveLength(1));
      expect(repliesFor('allowed')[0]?.outcome).toBe('done');
      expect(changed).toHaveBeenCalledOnce();
    },
  );

  it('shows the visible dropdown choice for an opaque option value', async () => {
    consentAnswer = false;
    const ref = control(
      '<select id="t" aria-label="Plan"><option value="plan_1">Basic</option><option value="plan_42">Pro — $49/month</option></select>',
    );
    pageEffects = [
      {
        key: 'opaque',
        callId: 'opaque',
        type: 'act-on-page',
        input: { ref, action: 'select', value: 'plan_42' },
      },
    ];
    await render();
    expect(consentAsked[0]).toMatchObject({
      value: 'plan_42',
      valueLabel: 'Pro — $49/month',
    });
    expect(document.querySelector<HTMLSelectElement>('#t')?.value).toBe(
      'plan_1',
    );
  });

  it.each(['label', 'value', 'removed', 'replaced', 'disabled'])(
    'declines when the approved dropdown option is %s before execution',
    async (change) => {
      const ref = control(
        '<select id="t" aria-label="Plan"><option value="plan_1">Basic</option><option value="plan_42">Pro — $49/month</option></select>',
      );
      const select = document.querySelector<HTMLSelectElement>('#t');
      const option = select?.options.item(1);
      if (!select || !option) throw new Error('missing select fixture');
      const changed = vi.fn();
      select.addEventListener('change', changed);
      onConsent = () => {
        if (change === 'label') option.label = 'Enterprise — $499/month';
        if (change === 'value') option.value = 'plan_499';
        if (change === 'removed') option.remove();
        if (change === 'replaced') option.replaceWith(option.cloneNode(true));
        if (change === 'disabled') option.disabled = true;
      };
      pageEffects = [
        {
          key: change,
          callId: change,
          type: 'act-on-page',
          input: { ref, action: 'select', value: 'plan_42' },
        },
      ];
      await render();
      await vi.waitFor(() => expect(repliesFor(change)).toHaveLength(1));
      expect(repliesFor(change)[0]?.outcome).toBe('declined');
      expect(changed).not.toHaveBeenCalled();
      expect(select.value).toBe('plan_1');
    },
  );

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
