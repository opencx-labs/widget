import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { actOnPage } from '../act';
import { captureActionMeaning } from '../action-meaning';
import { beginSnapshot, resetRefsForTest } from '../control-ref';

beforeEach(() => {
  resetRefsForTest();
  document.body.style.margin = '0';
});
afterEach(() => {
  document.body.innerHTML = '';
});

function setup(html: string) {
  document.body.innerHTML = html;
  const element = document.querySelector<HTMLElement>('#target')!;
  element.style.cssText = 'display:block;width:180px;height:40px';
  const ref = beginSnapshot()(element);
  const clicked = vi.fn((event: Event) => event.preventDefault());
  element.addEventListener('click', clicked);
  return {
    element,
    ref,
    clicked,
    consentIsCurrent: captureActionMeaning(element),
  };
}

it.each(['consent wait', 'pointerdown', 'focus'])(
  'does not click a changed native link after %s',
  async (when) => {
    const fixture = setup('<a id="target" href="/approved">Continue</a>');
    const change = () => fixture.element.setAttribute('href', '/different');
    if (when === 'consent wait') {
      await Promise.resolve();
      change();
    } else fixture.element.addEventListener(when, change);
    const result = await actOnPage({ ...fixture, action: 'click' });
    expect(result.outcome).toBe(
      when === 'consent wait' ? 'declined' : 'no_change',
    );
    if (when !== 'consent wait') expect(result.detail).toContain('interrupted');
    expect(fixture.clicked).not.toHaveBeenCalled();
  },
);

it.each([
  'base',
  'submit override',
  'form owner',
  'form method',
  'form target',
])('binds native submission to its approved %s', async (change) => {
  const fixture = setup(
    '<base href="https://example.test/safe/"><form id="one" action="save"></form><form id="two" action="delete"></form><button id="target" form="one" formaction="preview">Continue</button>',
  );
  await Promise.resolve();
  if (change === 'base')
    document.querySelector('base')!.href = 'https://other.test/';
  if (change === 'submit override')
    fixture.element.setAttribute('formaction', 'commit');
  if (change === 'form owner') fixture.element.setAttribute('form', 'two');
  if (change === 'form method') document.querySelector('form')!.method = 'post';
  if (change === 'form target')
    document.querySelector('form')!.target = '_blank';
  const result = await actOnPage({ ...fixture, action: 'click' });
  expect(result.outcome).toBe('declined');
  expect(fixture.clicked).not.toHaveBeenCalled();
});

it.each([
  '<a id="target" href="/approved">Continue</a>',
  '<form action="/approved"><button id="target">Continue</button></form>',
])(
  'retains the complete pointer sequence for unchanged controls: %s',
  async (html) => {
    const fixture = setup(html);
    const events: string[] = [];
    for (const name of [
      'pointerdown',
      'mousedown',
      'focus',
      'pointerup',
      'mouseup',
      'click',
    ]) {
      fixture.element.addEventListener(name, () => events.push(name));
    }
    await actOnPage({ ...fixture, action: 'click', settleMs: 20 });
    expect(fixture.clicked).toHaveBeenCalledOnce();
    expect(events).toEqual([
      'pointerdown',
      'mousedown',
      'focus',
      'pointerup',
      'mouseup',
      'click',
    ]);
  },
);

it('does not fill a field moved to another form by its focus handler', async () => {
  const fixture = setup(
    '<form id="one"></form><form id="two"></form><input id="target" form="one" aria-label="Name">',
  );
  fixture.element.addEventListener('focus', () =>
    fixture.element.setAttribute('form', 'two'),
  );
  const result = await actOnPage({
    ...fixture,
    action: 'fill',
    value: 'Alice',
  });
  expect(result.outcome).toBe('no_change');
  expect(result.detail).toContain('interrupted');
  expect((fixture.element as HTMLInputElement).value).toBe('');
});

it.each([
  '<form action="/approved"><button><span id="target" role="button">Continue</span></button></form>',
  '<form action="/approved"><button id="submit">Continue</button></form><label id="target" role="button" for="submit">Continue</label>',
])('binds forwarded native activation to consent: %s', async (html) => {
  const fixture = setup(html);
  fixture.element.removeEventListener('click', fixture.clicked);
  const form = document.querySelector('form')!;
  const submitted = vi.fn((event: Event) => event.preventDefault());
  form.addEventListener('submit', submitted);
  form.action = '/different';
  expect(
    (await actOnPage({ ...fixture, action: 'click', settleMs: 20 })).outcome,
  ).toBe('declined');
  expect(submitted).not.toHaveBeenCalled();
  form.action = '/approved';
  // Restoring markup cannot resurrect an old handle. Read the control again.
  fixture.ref = beginSnapshot()(fixture.element);
  await actOnPage({ ...fixture, action: 'click', settleMs: 20 });
  expect(submitted).toHaveBeenCalledOnce();
});

it('binds the submitter value even when the visible name stays the same', async () => {
  const fixture = setup(
    '<form action="/approved"><button id="target" name="operation" value="save">Continue</button></form>',
  );
  fixture.element.setAttribute('value', 'delete');
  expect((await actOnPage({ ...fixture, action: 'click' })).outcome).toBe(
    'declined',
  );
  expect(fixture.clicked).not.toHaveBeenCalled();
});

it.each(['pointerdown', 'mouseup'])(
  'reports an action that took effect on %s before approval became stale',
  async (eventName) => {
    const fixture = setup('<button id="target">Save</button>');
    let commits = 0;
    let approved = true;
    fixture.element.addEventListener(eventName, () => {
      commits++;
      fixture.element.textContent = 'Saved';
      approved = false;
    });
    const result = await actOnPage({
      ref: fixture.ref,
      action: 'click',
      consentIsCurrent: () => approved,
      settleMs: 200,
    });
    expect(commits).toBe(1);
    expect(fixture.clicked).not.toHaveBeenCalled();
    expect(result.outcome).toBe('no_change');
    expect(result.detail).toContain('The page changed.');
    expect(result.detail).toContain('interrupted');
    expect(result.detail).toContain('Do not repeat');
  },
);

it('reports uncertainty when an interrupted event had no observable DOM result', async () => {
  const fixture = setup('<button id="target">Save</button>');
  let requests = 0;
  let approved = true;
  fixture.element.addEventListener('pointerdown', () => {
    requests++;
    approved = false;
  });
  const result = await actOnPage({
    ref: fixture.ref,
    action: 'click',
    consentIsCurrent: () => approved,
    settleMs: 100,
  });
  expect(requests).toBe(1);
  expect(fixture.clicked).not.toHaveBeenCalled();
  expect(result.outcome).toBe('no_change');
  expect(result.detail).toContain('final result is unknown');
});

it('still reports declined when no host input event was dispatched', async () => {
  const fixture = setup('<button id="target">Save</button>');
  let validations = 0;
  const pointer = vi.fn();
  fixture.element.addEventListener('pointerover', pointer);
  const result = await actOnPage({
    ref: fixture.ref,
    action: 'click',
    consentIsCurrent: () => ++validations === 1,
  });
  expect(result.outcome).toBe('declined');
  expect(pointer).not.toHaveBeenCalled();
  expect(fixture.clicked).not.toHaveBeenCalled();
});

it.each(['check', 'uncheck'] as const)(
  'observes an interrupted %s without dispatching a click afterwards',
  async (action) => {
    const fixture = setup(
      `<input id="target" type="checkbox" ${action === 'uncheck' ? 'checked' : ''}>`,
    );
    const input = document.querySelector<HTMLInputElement>('#target');
    if (!input) throw new Error('Missing checkbox');
    let approved = true;
    input.addEventListener('pointerdown', () => {
      input.checked = action === 'check';
      input.setAttribute('aria-label', 'Updated');
      approved = false;
    });
    const result = await actOnPage({
      ref: fixture.ref,
      action,
      consentIsCurrent: () => approved,
      settleMs: 100,
    });
    expect(input.checked).toBe(action === 'check');
    expect(fixture.clicked).not.toHaveBeenCalled();
    expect(result.outcome).toBe('no_change');
    expect(result.detail).toContain('interrupted');
  },
);

it('never reports a completed click when a hover handler interrupts the sequence', async () => {
  const fixture = setup('<button id="target">Save</button>');
  let approved = true;
  fixture.element.addEventListener('pointerover', () => {
    fixture.element.textContent = 'Hovered';
    approved = false;
  });
  const result = await actOnPage({
    ref: fixture.ref,
    action: 'click',
    consentIsCurrent: () => approved,
    settleMs: 100,
  });
  expect(fixture.clicked).not.toHaveBeenCalled();
  expect(result.outcome).toBe('no_change');
  expect(result.detail).toContain('interrupted');
  expect(result.detail).toContain('Do not repeat');
});
