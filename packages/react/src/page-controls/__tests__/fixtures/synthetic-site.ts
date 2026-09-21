/**
 * A synthetic customer site: the control shapes a support agent actually
 * meets, not the ones that are easy to click.
 *
 * Each case says what it is, how to build it, and what "it worked" means
 * for that control — checked by asking the DOM afterwards, never by
 * trusting the code that just ran. `supported` marks the ones the widget
 * claims it can operate; the accuracy gate is measured over those, and the
 * unsupported ones are here to prove the widget refuses them rather than
 * silently doing nothing.
 */

export type ActionCase = {
  /** What this control is, in the words a bug report would use. */
  readonly name: string;
  /** The page fragment. Exactly one element carries `id="target"`. */
  readonly html: string;
  /** Wiring a real page would do in JavaScript. */
  readonly setup?: (target: HTMLElement) => void;
  readonly action: 'click' | 'fill' | 'select' | 'check' | 'uncheck';
  readonly value?: string;
  /** True when the page really did change the way the action promised. */
  readonly didHappen: (target: HTMLElement) => boolean;
  /**
   * Given a reference, will the widget operate this control? The action
   * gate is measured over `true`; every `false` must come back refused,
   * even when a reference resolves to it.
   */
  readonly supported: boolean;
  /**
   * Does the page reader offer this control to the agent in the first
   * place? Defaults to `supported`. The two are genuinely different: an
   * unnamed field is simply never offered (nothing to call it), while a
   * private region must be refused even if a reference from a moment ago
   * still resolves.
   */
  readonly offeredByReader?: boolean;
};

const box = (extra = '') =>
  `style="width:160px;height:36px;position:relative;${extra}"`;

export const ACTION_CASES: readonly ActionCase[] = [
  {
    name: 'plain button with a click handler',
    html: `<button id="target" ${box()}>Export</button><p id="out"></p>`,
    setup: (target) =>
      target.addEventListener('click', () => {
        const out = document.getElementById('out');
        if (out) out.textContent = 'exported';
      }),
    action: 'click',
    didHappen: () => document.getElementById('out')?.textContent === 'exported',
    supported: true,
  },
  {
    name: 'component-library menu that opens on pointerdown, not click',
    html: `<div id="target" role="button" ${box()}>Account</div><ul id="menu" hidden><li>Sign out</li></ul>`,
    setup: (target) =>
      target.addEventListener('pointerdown', () => {
        document.getElementById('menu')?.removeAttribute('hidden');
      }),
    action: 'click',
    didHappen: () =>
      document.getElementById('menu')?.hasAttribute('hidden') === false,
    supported: true,
  },
  {
    name: 'control that commits on mouseup',
    html: `<div id="target" role="menuitem" ${box()}>Archive</div><p id="out"></p>`,
    setup: (target) =>
      target.addEventListener('mouseup', () => {
        const out = document.getElementById('out');
        if (out) out.textContent = 'archived';
      }),
    action: 'click',
    didHappen: () => document.getElementById('out')?.textContent === 'archived',
    supported: true,
  },
  {
    name: 'control that needs focus before it reacts',
    html: `<div id="target" role="button" tabindex="0" ${box()}>Rename</div><p id="out"></p>`,
    setup: (target) =>
      target.addEventListener('focus', () => {
        const out = document.getElementById('out');
        if (out) out.textContent = 'focused';
      }),
    action: 'click',
    didHappen: () => document.getElementById('out')?.textContent === 'focused',
    supported: true,
  },
  {
    name: 'link that navigates within the page',
    html: `<a id="target" href="#section" ${box()}>Jump to section</a><h2 id="section">Section</h2>`,
    action: 'click',
    didHappen: () => window.location.hash === '#section',
    supported: true,
  },
  {
    name: 'text field with a <label for>',
    html: `<label for="target">Email address</label><input id="target" ${box()} />`,
    action: 'fill',
    value: 'ada@example.com',
    didHappen: (target) =>
      target instanceof HTMLInputElement && target.value === 'ada@example.com',
    supported: true,
  },
  {
    name: 'framework-tracked field that only accepts a native-setter write',
    html: `<label for="target">Full name</label><input id="target" ${box()} />`,
    setup: (target) => {
      // The shape of a React controlled input: it keeps its own last-known
      // value and only re-renders when a real change event says otherwise.
      let committed = '';
      target.addEventListener('input', (event) => {
        const next = (event.target as HTMLInputElement).value;
        // A direct `.value =` write leaves the tracker untouched, and this
        // listener would never see the new text.
        committed = next;
        target.setAttribute('data-committed', committed);
      });
    },
    action: 'fill',
    value: 'hello',
    didHappen: (target) => target.getAttribute('data-committed') === 'hello',
    supported: true,
  },
  {
    name: 'textarea named by its placeholder',
    html: `<textarea id="target" placeholder="Tell us what happened" ${box()}></textarea>`,
    action: 'fill',
    value: 'a longer note',
    didHappen: (target) =>
      target instanceof HTMLTextAreaElement && target.value === 'a longer note',
    supported: true,
  },
  {
    name: 'native select chosen by the option label',
    html: `<label for="target">Billing cycle</label><select id="target" ${box()}><option value="m">Monthly</option><option value="y">Yearly</option></select>`,
    action: 'select',
    value: 'Yearly',
    didHappen: (target) =>
      target instanceof HTMLSelectElement && target.value === 'y',
    supported: true,
  },
  {
    name: 'native select chosen by the option value',
    html: `<select id="target" aria-label="Currency" ${box()}><option value="eur">EUR</option><option value="usd">USD</option></select>`,
    action: 'select',
    value: 'usd',
    didHappen: (target) =>
      target instanceof HTMLSelectElement && target.value === 'usd',
    supported: true,
  },
  {
    name: 'checkbox with a wrapping label',
    html: `<label>Email me receipts <input id="target" type="checkbox" style="width:16px;height:16px" /></label>`,
    action: 'check',
    didHappen: (target) => target instanceof HTMLInputElement && target.checked,
    supported: true,
  },
  {
    name: 'checkbox already on, turned off',
    html: `<label for="target">Auto-renew</label><input id="target" type="checkbox" checked style="width:16px;height:16px" />`,
    action: 'uncheck',
    didHappen: (target) =>
      target instanceof HTMLInputElement && !target.checked,
    supported: true,
  },
  {
    name: 'aria switch that flips its own state',
    html: `<div id="target" role="switch" aria-checked="false" ${box()}>Live mode</div>`,
    setup: (target) =>
      target.addEventListener('click', () =>
        target.setAttribute(
          'aria-checked',
          target.getAttribute('aria-checked') === 'true' ? 'false' : 'true',
        ),
      ),
    action: 'check',
    didHappen: (target) => target.getAttribute('aria-checked') === 'true',
    supported: true,
  },
  {
    name: 'button whose label is a nested span',
    html: `<button id="target" ${box()}><span>Download</span><span> invoice</span></button><p id="out"></p>`,
    setup: (target) =>
      target.addEventListener('click', () => {
        const out = document.getElementById('out');
        if (out) out.textContent = 'downloaded';
      }),
    action: 'click',
    didHappen: () =>
      document.getElementById('out')?.textContent === 'downloaded',
    supported: true,
  },
  {
    name: 'button inside a scrolled container',
    html: `<div style="height:60px;overflow:auto"><div style="height:300px"></div><button id="target" ${box()}>Deep button</button></div><p id="out"></p>`,
    setup: (target) =>
      target.addEventListener('click', () => {
        const out = document.getElementById('out');
        if (out) out.textContent = 'clicked';
      }),
    action: 'click',
    didHappen: () => document.getElementById('out')?.textContent === 'clicked',
    supported: true,
  },
  {
    name: 'control that re-renders itself on interaction',
    html: `<div id="wrap"><button id="target" ${box()}>Refresh</button></div><p id="out"></p>`,
    setup: (target) =>
      target.addEventListener('click', () => {
        const out = document.getElementById('out');
        if (out) out.textContent = 'refreshed';
        // The page swaps in new nodes around it, as a re-render would.
        const wrap = document.getElementById('wrap');
        if (wrap) wrap.insertAdjacentHTML('beforeend', '<span>updated</span>');
      }),
    action: 'click',
    didHappen: () =>
      document.getElementById('out')?.textContent === 'refreshed',
    supported: true,
  },
  // ——— The ones the widget must refuse, not quietly fail at ———
  {
    // A control nobody can name is a control nobody can ask about: on a page
    // with twelve bare inputs, "the text field" means nothing. The reader
    // drops it rather than invent a name, so the agent can never point at
    // it — and that has to be measured, not assumed.
    name: 'field with no label, placeholder or aria-label',
    html: `<input id="target" ${box()} />`,
    action: 'fill',
    value: 'anything',
    didHappen: (target) =>
      target instanceof HTMLInputElement && target.value === 'anything',
    // Operable in principle — it is an ordinary text field — but never
    // offered, so no reference to it ever exists.
    supported: true,
    offeredByReader: false,
  },
  {
    // The hole a read-time-only check leaves: an app marks its card form
    // private when it mounts, a moment AFTER the page was read. A reference
    // minted before that still resolves, so the rule has to be re-checked
    // at the instant of acting, not only when the list was built.
    name: 'control inside a region marked private after it was read',
    html: `<section data-opencx-private><button id="target" ${box()}>Reveal full card number</button></section><p id="out"></p>`,
    setup: (target) =>
      target.addEventListener('click', () => {
        const out = document.getElementById('out');
        if (out) out.textContent = 'revealed';
      }),
    action: 'click',
    didHappen: () => document.getElementById('out')?.textContent === 'revealed',
    supported: false,
    offeredByReader: false,
  },
  {
    name: 'control inside an aria-hidden region',
    html: `<div aria-hidden="true"><button id="target" ${box()}>Hidden action</button></div><p id="out"></p>`,
    setup: (target) =>
      target.addEventListener('click', () => {
        const out = document.getElementById('out');
        if (out) out.textContent = 'ran';
      }),
    action: 'click',
    didHappen: () => document.getElementById('out')?.textContent === 'ran',
    supported: false,
    offeredByReader: false,
  },
  {
    name: 'password field',
    html: `<input id="target" type="password" ${box()} />`,
    action: 'fill',
    value: 'hunter2',
    didHappen: (target) =>
      target instanceof HTMLInputElement && target.value === 'hunter2',
    supported: false,
  },
  {
    name: 'file picker',
    html: `<input id="target" type="file" ${box()} />`,
    action: 'click',
    didHappen: () => false,
    supported: false,
  },
];
