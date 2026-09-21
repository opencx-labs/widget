// What the agent is allowed to know about a customer's page — checked in a
// real browser, because every rule here is a question jsdom answers wrongly:
// whether a control is visible, how big it is, what its accessible name is.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveRef, resetRefsForTest } from '../control-ref';
import { readPageControls } from '../read-controls';
import { MAX_CONTROLS } from '../types';

const mount = (html: string) => {
  document.body.innerHTML = html;
};

const names = () => readPageControls().controls.map((c) => c.name);

beforeEach(() => {
  resetRefsForTest();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('what the reader sees', () => {
  it('names controls the way a screen reader would', () => {
    mount(`
      <button id="a">Change plan</button>
      <button aria-label="Close dialog"><svg></svg></button>
      <span id="lbl">Card holder</span>
      <input aria-labelledby="lbl" />
      <label for="em">Email address</label><input id="em" />
      <input placeholder="Search orders" />
      <label for="cy">Billing cycle</label>
      <select id="cy"><option>Monthly</option></select>
      <a href="/billing">Billing</a>
    `);

    // Document order, which is the order the visitor reads them in.
    expect(names()).toEqual([
      'Change plan',
      'Close dialog',
      'Card holder',
      'Email address',
      'Search orders',
      'Billing cycle',
      'Billing',
    ]);
  });

  it('names a select by its label, never by the option it is on', () => {
    mount(`
      <label for="cy">Billing cycle</label>
      <select id="cy"><option selected>Monthly</option><option>Yearly</option></select>
      <select aria-label="Currency"><option selected>EUR</option></select>
      <select><option selected>Nameless</option></select>
    `);

    // The third select has no name at all, so it is not something the agent
    // can talk about — the selected option is a value, not a name.
    expect(names()).toEqual(['Billing cycle', 'Currency']);
    expect(JSON.stringify(readPageControls().controls)).not.toContain(
      'Monthly',
    );
  });

  it('reports the role and whether the control can be used', () => {
    mount(`
      <button disabled>Change plan</button>
      <div role="switch" aria-disabled="true">Live mode</div>
      <a href="/x">Invoices</a>
    `);

    expect(readPageControls().controls).toEqual([
      {
        ref: expect.any(String),
        role: 'button',
        name: 'Change plan',
        disabled: true,
      },
      {
        ref: expect.any(String),
        role: 'switch',
        name: 'Live mode',
        disabled: true,
      },
      { ref: expect.any(String), role: 'link', name: 'Invoices' },
    ]);
  });

  it('keeps a space where the page has a line break', () => {
    // A real dashboard banner: two block-level lines inside one link.
    // `textContent` glues them together, and the agent then cannot match
    // the name against anything a customer would say.
    mount(`
      <a href="/disputes" id="banner">
        <div>2 open disputes</div>
        <div>Respond before the deadline.</div>
      </a>
    `);

    expect(names()).toEqual(['2 open disputes Respond before the deadline.']);
  });

  it('drops a control it cannot name, rather than inventing one', () => {
    mount(`<button class="btn-primary p-0"></button><button>Save</button>`);

    expect(names()).toEqual(['Save']);
  });
});

describe('what the reader refuses', () => {
  it('skips anything not actually on screen', () => {
    mount(`
      <button style="display:none">Hidden away</button>
      <div style="visibility:hidden"><button>Invisible</button></div>
      <button style="width:0;height:0;padding:0;border:0">Zero sized</button>
      <button aria-hidden="true">Not for readers</button>
      <button>Visible</button>
    `);

    // Positive control: the same page does yield the one real control.
    expect(names()).toEqual(['Visible']);
  });

  it('never reads a password or a file picker, named or not', () => {
    mount(`
      <label for="p">Password</label><input id="p" type="password" />
      <label for="f">Upload your ID</label><input id="f" type="file" />
      <label for="u">Username</label><input id="u" />
    `);

    const read = names();
    expect(read).toEqual(['Username']);
    expect(read).not.toContain('Password');
    expect(read).not.toContain('Upload your ID');
  });

  it('skips a region the customer marked private, whole', () => {
    mount(`
      <section data-opencx-private>
        <button>Reveal SSN</button>
        <input aria-label="Account number" />
      </section>
      <button>Contact support</button>
    `);

    expect(names()).toEqual(['Contact support']);
  });

  it('never sends what is in a field', () => {
    mount(`
      <label for="c">Card number</label>
      <input id="c" value="4242424242424242" />
      <input type="submit" value="Pay 49.00" />
    `);

    const json = JSON.stringify(readPageControls().controls);
    expect(json).not.toContain('4242');
    // An input[type=submit] is named by its value in the accname spec; the
    // reader refuses that source outright, so the button is simply unnamed.
    expect(json).not.toContain('Pay 49.00');
    expect(names()).toEqual(['Card number']);
  });

  it('never reads the widget itself', () => {
    mount(`
      <div data-opencx-root><button>Send message</button></div>
      <button>Customer button</button>
    `);

    expect(names()).toEqual(['Customer button']);
  });
});

describe('the reference table', () => {
  it('hands out a reference that resolves back to that exact node', () => {
    mount(
      `<button id="pay">Pay now</button><button id="cancel">Cancel</button>`,
    );

    const [pay, cancel] = readPageControls().controls;
    expect(resolveRef(pay!.ref)).toBe(document.getElementById('pay'));
    expect(resolveRef(cancel!.ref)).toBe(document.getElementById('cancel'));
  });

  it('refuses a reference that is made up, or whose node has gone', () => {
    mount(`<button id="pay">Pay now</button>`);
    const [pay] = readPageControls().controls;

    expect(resolveRef('s9c99')).toBeNull();
    // Positive control: it resolved a moment ago.
    expect(resolveRef(pay!.ref)).not.toBeNull();
    document.getElementById('pay')!.remove();
    expect(resolveRef(pay!.ref)).toBeNull();
  });

  it('a new reading does not make the previous turn point somewhere else', () => {
    mount(`<button id="one">One</button>`);
    const first = readPageControls().controls[0]!;
    mount(`<button id="two">Two</button>`);
    const second = readPageControls().controls[0]!;

    expect(first.ref).not.toBe(second.ref);
    expect(resolveRef(first.ref)).toBeNull();
    expect(resolveRef(second.ref)).toBe(document.getElementById('two'));
  });
});

describe('cost', () => {
  it('reads a 2,000-control page in under 20ms and sends a bounded list', () => {
    mount(
      Array.from(
        { length: 2000 },
        (_, i) => `<button id="b${i}">Action ${i}</button>`,
      ).join(''),
    );
    // Warm the layout once — the measurement is of the reader, not of the
    // browser's first layout of a page it has just been handed.
    readPageControls();

    const started = performance.now();
    const snapshot = readPageControls();
    const elapsed = performance.now() - started;

    expect(snapshot.controls).toHaveLength(MAX_CONTROLS);
    expect(snapshot.truncated).toBe(true);
    expect(elapsed).toBeLessThan(20);
  });
});

/**
 * The shape that broke on the first real screen: a settlements table whose
 * rows are clickable with a React handler and nothing else. No href, no
 * role, no tabindex — invisible from the DOM, so an agent asked to open one
 * had only the navigation to offer, clicked that, and correctly reported
 * that nothing changed.
 */
describe('rows a page made clickable with style, not markup', () => {
  it('offers a clickable table row, named by its content', () => {
    mount(`
      <nav><a href="/settlements">Settlements</a></nav>
      <table>
        <tbody>
          <tr style="cursor: pointer"><td>1180.000.2026</td><td>Open</td><td>$0.00</td></tr>
          <tr style="cursor: pointer"><td>1180.001.2026</td><td>Pending</td><td>$508.50</td></tr>
        </tbody>
      </table>
    `);

    const { controls } = readPageControls();
    const rows = controls.filter((control) => control.role === 'row');
    expect(rows.map((row) => row.name)).toEqual([
      '1180.000.2026 Open $0.00',
      '1180.001.2026 Pending $508.50',
    ]);
    // Positive control: the navigation is still there, so this is the rows
    // being ADDED rather than the reader changing what it collects.
    expect(controls.some((control) => control.name === 'Settlements')).toBe(true);
  });

  it('leaves a plain table alone', () => {
    // The whole rule is `cursor: pointer`. Without it a table is text, and
    // offering its rows would invite clicks that do nothing.
    mount(`
      <table><tbody>
        <tr><td>1180.000.2026</td><td>Open</td></tr>
      </tbody></table>
    `);

    expect(readPageControls().controls).toEqual([]);
  });

  it('offers the control inside a clickable row, not the row', () => {
    // A row wrapping a real button is not itself the thing to press.
    mount(`
      <table><tbody>
        <tr style="cursor: pointer"><td><button>Download statement</button></td></tr>
      </tbody></table>
    `);

    const { controls } = readPageControls();
    expect(controls.map((control) => `${control.role}:${control.name}`)).toEqual([
      'button:Download statement',
    ]);
  });

  it('never offers a clickable row inside a private region', () => {
    mount(`
      <div data-opencx-private>
        <table><tbody>
          <tr style="cursor: pointer"><td>Card ending 4242</td></tr>
        </tbody></table>
      </div>
      <table><tbody>
        <tr style="cursor: pointer"><td>Public row</td></tr>
      </tbody></table>
    `);

    const names = readPageControls().controls.map((control) => control.name);
    // Positive control: the public row proves the pass ran at all.
    expect(names).toContain('Public row');
    expect(names).not.toContain('Card ending 4242');
  });
});
